import {
  CoviaError, InvokeOptions, MCPDiscovery, MCPError, MCPToolPage, MCPToolResult,
} from './types';
import { Job } from './Job';
import { parseSSEStream } from './Utils';
import { venueStream, VenueRequestContext } from './VenueTransport';

/** The catalog op that bridges to an MCP server — see `callToolTracked`. */
const TOOL_CALL_OP = 'v/ops/mcp/tools-call';

/** Compatibility default when discovery names no endpoint. */
const DEFAULT_MCP_PATH = '/mcp';

const HEADER_SESSION_ID = 'Mcp-Session-Id';

interface MCPOps {
  invoke(assetId: string, input?: unknown, options?: InvokeOptions): Promise<Job>;
}

interface MCPManagerVenue extends VenueRequestContext {
  operations: MCPOps;
  mcpDiscovery(): Promise<MCPDiscovery>;
}

/** A JSON-RPC 2.0 response frame. */
interface JsonRpcResponse {
  jsonrpc?: string;
  id?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function isResponseFrame(value: unknown): value is JsonRpcResponse {
  return typeof value === 'object' && value !== null && ('result' in value || 'error' in value);
}

/**
 * MCP client for a venue's native `/mcp` endpoint.
 *
 * The venue speaks Streamable HTTP MCP: JSON-RPC over POST, answering either
 * `application/json` or `text/event-stream` at its discretion. Everything that
 * implies — request-id correlation, reading a response that may arrive as SSE
 * frames, applying the venue's auth with the venue DID as audience, turning
 * JSON-RPC error objects into typed errors — is protocol plumbing every
 * TypeScript consumer would otherwise rebuild (covia-sdk#23).
 *
 * ```ts
 * const page = await venue.mcp.listTools();
 * const out  = await venue.mcp.callTool(page.tools[0].name, { text: 'hi' });
 * ```
 *
 * **`listTools()` is job-free.** It reads the native endpoint, never the
 * `v/ops/mcp/tools-list` operation — discovery and display must not persist a
 * job per page (covia#177).
 */
export class MCPManager {
  private nextId = 1;
  private sessionId?: string;
  private endpointPromise?: Promise<string>;

  constructor(private venue: MCPManagerVenue) {}

  /** The venue's MCP discovery document (`GET /.well-known/mcp`). */
  discovery(): Promise<MCPDiscovery> {
    return this.venue.mcpDiscovery();
  }

  /**
   * List the tools this venue bridges, job-free.
   *
   * @param options.cursor Continue a previous page. MCP pagination is opaque:
   *   pass back the `nextCursor` a page returned, and stop when it is absent.
   */
  async listTools(options: { cursor?: string; signal?: AbortSignal } = {}): Promise<MCPToolPage> {
    const params = options.cursor !== undefined ? { cursor: options.cursor } : {};
    const result = await this.request<{ tools?: MCPToolPage['tools']; nextCursor?: string }>(
      'tools/list', params, { signal: options.signal },
    );
    const page: MCPToolPage = { tools: result?.tools ?? [] };
    if (result?.nextCursor !== undefined) page.nextCursor = result.nextCursor;
    return page;
  }

  /**
   * Every tool the venue bridges, draining the cursor.
   *
   * A server that never stops handing back a cursor would loop forever, so a
   * repeated cursor is treated as the end rather than trusted.
   */
  async listAllTools(options: { signal?: AbortSignal } = {}): Promise<MCPToolPage['tools']> {
    const tools: MCPToolPage['tools'] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    for (;;) {
      const page: MCPToolPage = await this.listTools({ cursor, signal: options.signal });
      tools.push(...page.tools);
      if (page.nextCursor === undefined || seen.has(page.nextCursor)) return tools;
      seen.add(page.nextCursor);
      cursor = page.nextCursor;
    }
  }

  /**
   * Call a bridged tool natively and return its MCP result.
   *
   * This is the direct protocol call: the answer comes back in the response,
   * and the caller never holds a Job. The venue still runs the tool through
   * its job machinery and records it — "direct" describes what *this* call
   * hands back, not whether the venue keeps a record.
   *
   * Use {@link callToolTracked} when you want the `Job` itself: to stream it,
   * inspect its steps, link to its receipt, or continue it when it pauses.
   *
   * An MCP tool that fails *its own* execution answers with `isError: true`
   * and the failure in `content` — a successful protocol call reporting a
   * failed tool, which is not thrown. Only a protocol-level error throws.
   */
  async callTool(
    name: string,
    args: Record<string, unknown> = {},
    options: { signal?: AbortSignal } = {},
  ): Promise<MCPToolResult> {
    return this.request<MCPToolResult>(
      'tools/call', { name, arguments: args }, { signal: options.signal },
    );
  }

  /**
   * Call a tool through the `v/ops/mcp/tools-call` operation, returning the
   * `Job` so the run is an inspectable, linkable record.
   *
   * The operation is the venue's bridge to *any* MCP server, so `server`
   * defaults to this venue's own base URL — pointing the bridge back at the
   * venue, which is how a local tool gets called with a Job in hand. Name a
   * different `server` (with a `token` if it needs one) to reach a third-party
   * MCP server through the venue instead, which the native endpoint cannot do.
   *
   * Unlike {@link callTool} this always persists a job, so it belongs to a
   * user-driven execution, never a page load.
   */
  async callToolTracked(
    name: string,
    args: Record<string, unknown> = {},
    options: { server?: string; token?: string } & InvokeOptions = {},
  ): Promise<Job> {
    const { server, token, ...invokeOptions } = options;
    const input: Record<string, unknown> = {
      server: server ?? this.venue.baseUrl,
      toolName: name,
      arguments: args,
    };
    if (token !== undefined) input.token = token;
    return this.venue.operations.invoke(TOOL_CALL_OP, input, invokeOptions);
  }

  /**
   * Send an arbitrary JSON-RPC method to the venue's MCP endpoint — the escape
   * hatch for methods this manager does not wrap (`resources/list`,
   * `prompts/list`, …).
   *
   * Request ids are minted and correlated here, so callers never supply one.
   */
  async request<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    options: { signal?: AbortSignal } = {},
  ): Promise<T> {
    const id = this.nextId++;
    const endpoint = await this.endpoint();
    const headers: Record<string, string> = {
      // The venue may answer either way; advertise both and branch on what
      // comes back rather than assuming JSON (which is the bug in every
      // hand-rolled copy of this call).
      Accept: 'application/json, text/event-stream',
    };
    if (this.sessionId) headers[HEADER_SESSION_ID] = this.sessionId;

    const response = await venueStream(this.venue, endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: options.signal,
    });

    // The venue mints a session on `initialize` and echoes it here; keep it so
    // later calls join the same session. It does not require one for
    // tools/list or tools/call, so there is no implicit initialize.
    const session = response.headers?.get?.(HEADER_SESSION_ID);
    if (session) this.sessionId = session;

    const frame = (response.headers?.get?.('Content-Type') ?? '').includes('text/event-stream')
      ? await this.readSSEFrame(response, id, options.signal)
      : (await response.json()) as JsonRpcResponse;

    return this.unwrap(frame, method, id);
  }

  /** The resolved MCP endpoint path, from discovery, probed once. */
  private endpoint(): Promise<string> {
    return this.endpointPromise ??= this.resolveEndpoint();
  }

  /**
   * Discovery names the endpoint; `${baseUrl}/mcp` is the compatibility
   * default. Discovery failing is not fatal — a venue that serves `/mcp`
   * without advertising it still works, so a failed probe falls through to the
   * default rather than failing the call that triggered it.
   */
  private async resolveEndpoint(): Promise<string> {
    try {
      const doc = await this.discovery();
      const advertised = [doc?.server_url, typeof doc?.endpoint === 'string' ? doc.endpoint : undefined]
        .find((v): v is string => typeof v === 'string' && v.length > 0);
      if (advertised) {
        // Absolute URLs from discovery are honoured as given; a path is taken
        // relative to the venue, which is what `venueStream` expects.
        if (/^https?:\/\//i.test(advertised)) {
          return advertised.startsWith(this.venue.baseUrl)
            ? advertised.slice(this.venue.baseUrl.length) || DEFAULT_MCP_PATH
            : advertised;
        }
        return advertised.startsWith('/') ? advertised : `/${advertised}`;
      }
    } catch {
      /* not advertised, or not reachable — the default below still works */
    }
    return DEFAULT_MCP_PATH;
  }

  /**
   * Read the response frame from an SSE-framed answer: the first event whose
   * JSON-RPC id matches the request. Notifications and unrelated frames are
   * skipped rather than mistaken for the answer.
   */
  private async readSSEFrame(
    response: Response,
    id: number,
    signal?: AbortSignal,
  ): Promise<JsonRpcResponse> {
    for await (const event of parseSSEStream(response, signal ? { signal } : undefined)) {
      let payload: unknown;
      try {
        payload = event.json();
      } catch {
        continue; // a keep-alive or comment frame, not our answer
      }
      if (isResponseFrame(payload) && payload.id === id) return payload;
    }
    throw new CoviaError(
      `MCP stream ended without a response to request ${id}`,
    );
  }

  /** JSON-RPC envelope → result, or a typed error. */
  private unwrap<T>(frame: JsonRpcResponse, method: string, id: number): T {
    if (frame?.error) {
      throw new MCPError(frame.error.message || `MCP ${method} failed`, frame.error.code, frame.error.data);
    }
    if (!frame || !('result' in frame)) {
      throw new CoviaError(`MCP ${method} returned no result for request ${id}`);
    }
    return frame.result as T;
  }
}
