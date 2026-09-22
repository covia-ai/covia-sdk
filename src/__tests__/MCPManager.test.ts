import { MCPManager } from '../MCPManager';
import { MCPError } from '../types';

// The venue answers `/mcp` with either application/json or text/event-stream
// at its discretion, so every test states which it is returning.

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

function headers(map: Record<string, string>) {
  const lower = new Map(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (k: string) => lower.get(k.toLowerCase()) ?? null };
}

function jsonResponse(body: unknown, extraHeaders: Record<string, string> = {}) {
  return {
    ok: true,
    status: 200,
    headers: headers({ 'Content-Type': 'application/json', ...extraHeaders }),
    json: () => Promise.resolve(body),
  };
}

/** An SSE-framed answer: the venue may stream the JSON-RPC response. */
function sseResponse(frames: string[], extraHeaders: Record<string, string> = {}) {
  const encoder = new TextEncoder();
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < frames.length) controller.enqueue(encoder.encode(frames[i++]));
      else controller.close();
    },
  });
  return {
    ok: true,
    status: 200,
    headers: headers({ 'Content-Type': 'text/event-stream', ...extraHeaders }),
    body,
  };
}

/** Discovery is probed once before the first request; answer it by default. */
function mockDiscovery(doc: Record<string, unknown> = {}) {
  return jest.fn().mockResolvedValue(doc);
}

function createMockVenue(discovery = mockDiscovery()) {
  return {
    baseUrl: 'https://venue.example',
    venueId: 'did:key:zVenue',
    auth: { apply: jest.fn((h: Record<string, string>) => { h['Authorization'] = 'Bearer tok'; }) },
    operations: { invoke: jest.fn().mockResolvedValue({ id: 'job-1' }) },
    mcpDiscovery: discovery,
  };
}

function lastCall() {
  const [url, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  return { url: String(url), init: init as RequestInit & { headers: Record<string, string> } };
}

function bodyOf(call = lastCall()) {
  return JSON.parse(call.init.body as string);
}

describe('MCPManager', () => {
  let venue: ReturnType<typeof createMockVenue>;
  let mcp: MCPManager;

  beforeEach(() => {
    mockFetch.mockReset();
    venue = createMockVenue();
    mcp = new MCPManager(venue);
  });

  describe('listTools', () => {
    it('POSTs tools/call-free JSON-RPC to /mcp and returns the tools', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        jsonrpc: '2.0', id: 1,
        result: { tools: [{ name: 'echo', inputSchema: { type: 'object' } }] },
      }));

      const page = await mcp.listTools();

      const { url, init } = lastCall();
      expect(url).toBe('https://venue.example/mcp');
      expect(init.method).toBe('POST');
      expect(bodyOf()).toEqual({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
      expect(page.tools).toEqual([{ name: 'echo', inputSchema: { type: 'object' } }]);
      expect(page.nextCursor).toBeUndefined();
    });

    // The whole point of the job-free rule (covia#177): listing tools for
    // display must not persist a job per page.
    it('never touches the v/ops/mcp/tools-list operation', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 1, result: { tools: [] } }));
      await mcp.listTools();
      expect(venue.operations.invoke).not.toHaveBeenCalled();
      expect(lastCall().url).not.toContain('v/ops');
    });

    it('applies the venue auth provider with the venue DID as audience', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 1, result: { tools: [] } }));
      await mcp.listTools();
      expect(venue.auth.apply).toHaveBeenCalledWith(expect.any(Object), 'did:key:zVenue');
      expect(lastCall().init.headers['Authorization']).toBe('Bearer tok');
    });

    it('advertises both response types', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 1, result: { tools: [] } }));
      await mcp.listTools();
      expect(lastCall().init.headers['Accept']).toBe('application/json, text/event-stream');
    });

    it('passes a cursor through and returns nextCursor', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        jsonrpc: '2.0', id: 1, result: { tools: [], nextCursor: 'page-2' },
      }));
      const page = await mcp.listTools({ cursor: 'page-1' });
      expect(bodyOf().params).toEqual({ cursor: 'page-1' });
      expect(page.nextCursor).toBe('page-2');
    });

    it('tolerates a result with no tools array', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 1, result: {} }));
      await expect(mcp.listTools()).resolves.toEqual({ tools: [] });
    });
  });

  describe('listAllTools', () => {
    it('drains the cursor across pages', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 1, result: { tools: [{ name: 'a', inputSchema: {} }], nextCursor: 'c1' } }))
        .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 2, result: { tools: [{ name: 'b', inputSchema: {} }] } }));

      const tools = await mcp.listAllTools();
      expect(tools.map((t) => t.name)).toEqual(['a', 'b']);
      expect(bodyOf().params).toEqual({ cursor: 'c1' });
    });

    // A server that keeps handing back the same cursor would otherwise spin
    // forever on a page that never advances.
    it('stops on a repeated cursor rather than looping', async () => {
      mockFetch.mockResolvedValue(jsonResponse({
        jsonrpc: '2.0', id: 1, result: { tools: [{ name: 'a', inputSchema: {} }], nextCursor: 'same' },
      }));
      const tools = await mcp.listAllTools();
      expect(tools).toHaveLength(2); // first page, then the repeat, then stop
    });
  });

  describe('callTool', () => {
    it('sends name and arguments, and returns the result', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'hi' }] },
      }));

      const result = await mcp.callTool('echo', { text: 'hi' });
      expect(bodyOf()).toMatchObject({ method: 'tools/call', params: { name: 'echo', arguments: { text: 'hi' } } });
      expect(result.content).toEqual([{ type: 'text', text: 'hi' }]);
    });

    // A tool that ran and failed is a *successful* protocol call. Throwing
    // here would make a reportable tool failure indistinguishable from a
    // transport fault.
    it('does not throw on isError — that is a tool failure, not a protocol one', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        jsonrpc: '2.0', id: 1, result: { isError: true, content: [{ type: 'text', text: 'boom' }] },
      }));
      const result = await mcp.callTool('explode');
      expect(result.isError).toBe(true);
    });

    it('defaults arguments to an empty object', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 1, result: {} }));
      await mcp.callTool('noargs');
      expect(bodyOf().params).toEqual({ name: 'noargs', arguments: {} });
    });
  });

  describe('callToolTracked', () => {
    it('invokes the bridge op pointed back at this venue, and returns the Job', async () => {
      const job = await mcp.callToolTracked('echo', { text: 'hi' });

      expect(mockFetch).not.toHaveBeenCalled();  // the op path, not /mcp
      expect(venue.operations.invoke).toHaveBeenCalledWith(
        'v/ops/mcp/tools-call',
        { server: 'https://venue.example', toolName: 'echo', arguments: { text: 'hi' } },
        {},
      );
      expect(job).toEqual({ id: 'job-1' });
    });

    it('reaches a third-party MCP server when one is named', async () => {
      await mcp.callToolTracked('search', { q: 'x' }, { server: 'https://mcp.example.com', token: 'sekret' });
      expect(venue.operations.invoke).toHaveBeenCalledWith(
        'v/ops/mcp/tools-call',
        { server: 'https://mcp.example.com', toolName: 'search', arguments: { q: 'x' }, token: 'sekret' },
        {},
      );
    });

    it('omits token when none is given', async () => {
      await mcp.callToolTracked('echo');
      expect(venue.operations.invoke.mock.calls[0][1]).not.toHaveProperty('token');
    });
  });

  describe('SSE-framed responses', () => {
    it('reads the JSON-RPC answer out of an event stream', async () => {
      mockFetch.mockResolvedValueOnce(sseResponse([
        'data: {"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"streamed","inputSchema":{}}]}}\n\n',
      ]));

      const page = await mcp.listTools();
      expect(page.tools[0].name).toBe('streamed');
    });

    // Correlation is the reason ids are minted internally: an unrelated frame
    // on the same stream must not be mistaken for this request's answer.
    it('skips frames whose id does not match the request', async () => {
      mockFetch.mockResolvedValueOnce(sseResponse([
        'data: {"jsonrpc":"2.0","method":"notifications/progress","params":{}}\n\n',
        'data: {"jsonrpc":"2.0","id":99,"result":{"tools":[{"name":"wrong","inputSchema":{}}]}}\n\n',
        'data: {"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"right","inputSchema":{}}]}}\n\n',
      ]));

      const page = await mcp.listTools();
      expect(page.tools[0].name).toBe('right');
    });

    it('errors when the stream ends without an answer', async () => {
      mockFetch.mockResolvedValueOnce(sseResponse([
        'data: {"jsonrpc":"2.0","method":"notifications/message","params":{}}\n\n',
      ]));
      await expect(mcp.listTools()).rejects.toThrow(/ended without a response/);
    });
  });

  describe('errors', () => {
    it('turns a JSON-RPC error into a typed MCPError', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        jsonrpc: '2.0', id: 1,
        error: { code: -32602, message: 'Unknown tool: nope', data: { tool: 'nope' } },
      }));

      await expect(mcp.callTool('nope')).rejects.toThrow(MCPError);
      mockFetch.mockResolvedValueOnce(jsonResponse({
        jsonrpc: '2.0', id: 2, error: { code: -32602, message: 'Unknown tool: nope', data: { tool: 'nope' } },
      }));
      const err: MCPError = await mcp.callTool('nope').catch((e) => e);
      expect(err.code).toBe(-32602);
      expect(err.data).toEqual({ tool: 'nope' });
      expect(err.message).toBe('Unknown tool: nope');
    });

    it('rejects a frame carrying neither result nor error', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 1 }));
      await expect(mcp.listTools()).rejects.toThrow(/returned no result/);
    });

    it('propagates an HTTP error from the transport', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false, status: 503, headers: headers({}),
        text: () => Promise.resolve('venue down'),
        json: () => Promise.resolve({ error: 'venue down' }),
      });
      await expect(mcp.listTools()).rejects.toThrow();
    });
  });

  describe('request ids', () => {
    it('mints a fresh id per request and correlates on it', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 1, result: {} }))
        .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 2, result: {} }))
        .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 3, result: {} }));

      await mcp.listTools();
      await mcp.callTool('a');
      await mcp.request('resources/list');

      const ids = mockFetch.mock.calls.map(
        (c) => (JSON.parse((c[1] as RequestInit).body as string) as { id: number }).id,
      );
      expect(ids).toEqual([1, 2, 3]);
    });
  });

  describe('sessions', () => {
    it('echoes a session id the venue mints back on later calls', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(
        { jsonrpc: '2.0', id: 1, result: {} }, { 'Mcp-Session-Id': 'sess-7' },
      ));
      await mcp.request('initialize');
      expect(lastCall().init.headers['Mcp-Session-Id']).toBeUndefined(); // none to send yet

      mockFetch.mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 2, result: { tools: [] } }));
      await mcp.listTools();
      expect(lastCall().init.headers['Mcp-Session-Id']).toBe('sess-7');
    });

    it('does not initialize implicitly — the venue needs no session for tools/list', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 1, result: { tools: [] } }));
      await mcp.listTools();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(bodyOf().method).toBe('tools/list');
    });
  });

  describe('endpoint resolution', () => {
    it('uses the endpoint discovery advertises', async () => {
      const m = new MCPManager(createMockVenue(mockDiscovery({ server_url: '/custom-mcp' })));
      mockFetch.mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 1, result: { tools: [] } }));
      await m.listTools();
      expect(lastCall().url).toBe('https://venue.example/custom-mcp');
    });

    it('strips the venue base from an absolute advertised URL', async () => {
      const m = new MCPManager(createMockVenue(mockDiscovery({ server_url: 'https://venue.example/mcp-v2' })));
      mockFetch.mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 1, result: { tools: [] } }));
      await m.listTools();
      expect(lastCall().url).toBe('https://venue.example/mcp-v2');
    });

    // A venue that serves /mcp without advertising it still works — a failed
    // probe must not fail the call that triggered it.
    it('falls back to /mcp when discovery fails', async () => {
      const discovery = jest.fn().mockRejectedValue(new Error('no well-known'));
      const m = new MCPManager(createMockVenue(discovery));
      mockFetch.mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 1, result: { tools: [] } }));
      await m.listTools();
      expect(lastCall().url).toBe('https://venue.example/mcp');
    });

    it('probes discovery once, not per request', async () => {
      const discovery = mockDiscovery({ server_url: '/mcp' });
      const m = new MCPManager(createMockVenue(discovery));
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 1, result: { tools: [] } }))
        .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 2, result: { tools: [] } }));
      await m.listTools();
      await m.listTools();
      expect(discovery).toHaveBeenCalledTimes(1);
    });
  });
});
