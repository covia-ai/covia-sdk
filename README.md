# @covia/covia-sdk

[![npm version](https://badge.fury.io/js/@covia%2Fcovia-sdk.svg)](https://www.npmjs.com/package/@covia/covia-sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)

TypeScript SDK for the [Covia](https://covia.ai) federated AI orchestration grid.

Covia enables AI models, agents, and data to collaborate across organisational boundaries, clouds, and jurisdictions — with built-in governance and without centralising control.

The full guide is on [docs.covia.ai](https://docs.covia.ai/docs/user-guide/sdk/typescript). Every exported class and method carries doc comments, so your editor shows signatures and behaviour inline.

## Installation

```bash
npm install @covia/covia-sdk
# or: pnpm add @covia/covia-sdk / yarn add @covia/covia-sdk
```

Requires Node.js 18 or later. Type declarations are bundled; no `@types/` package is needed.

The SDK follows its own SemVer track, independent of the venue version. Changes and upgrade notes are recorded in the [changelog](CHANGELOG.md).

## Quick Start

```typescript
import { Grid } from "@covia/covia-sdk";

// Connect to a venue
const venue = await Grid.connect("https://venue.covia.ai");

// Run an operation and get the result
const result = await venue.operations.run("v/ops/schema/infer", {
  value: { name: "Ada", age: 36 },
});
console.log(result);
```

## Usage

### Connect to a Venue

```typescript
import { Grid, Venue } from "@covia/covia-sdk";

// By URL, DID, or DNS name (cached: the same id returns the same Venue)
const venue = await Grid.connect("https://venue.covia.ai");
const byDid = await Grid.connect("did:web:venue.covia.ai");
const byHost = await Grid.connect("venue.covia.ai");

// Without the Grid cache
const fresh = await Venue.connect("https://venue.covia.ai");

// Release resources when done, or let `using` do it (TypeScript 5.2+)
venue.close();
{
  using scoped = await Venue.connect("https://venue.covia.ai");
  // scoped.close() runs at the end of the block
}
```

For an address without a scheme, the SDK picks one from the host:

- **Public hosts** use `https://` only. There is no fallback to plain HTTP.
- **Local hosts** (`localhost`, `*.local`, loopback, and the private ranges `10/8`, `172.16/12`, `192.168/16`, `169.254/16`) try `http://` first, then `https://`, so a venue on your machine or LAN works without TLS.
- **Explicit `http://` or `https://`** addresses are used exactly as given.

Credentials sent over `http://` travel in cleartext, so use `https://` for any venue reached over a network you don't control. To report a security issue, see [SECURITY.md](SECURITY.md).

### Authentication

Pass an auth provider as the second argument to `Grid.connect()`:

```typescript
import { Grid, BearerAuth, Ed25519Auth } from "@covia/covia-sdk";

// Bearer token
const venue = await Grid.connect("https://venue.covia.ai", new BearerAuth("<token>"));

// Self-issued Ed25519 JWT, signed fresh per request
const auth = Ed25519Auth.generate();
console.log(auth.getDID()); // did:key:z6Mk...
const signed = await Grid.connect("https://venue.covia.ai", auth);

// Restore a saved key
const restored = Ed25519Auth.fromHex("abcdef1234...");
```

Tokens are bound to the venue's DID, which `Grid.connect()` / `Venue.connect()` pin before any credential is sent.

### Invoke Operations

```typescript
// Run: invoke, wait, and return the output
const result = await venue.operations.run("v/ops/schema/infer", { value: { x: 1 } });

// Invoke: get a Job handle and wait on it yourself
const job = await venue.operations.invoke("v/ops/schema/infer", { value: { x: 1 } });
const output = await job.result({ timeout: 30000 });

// With UCAN capability tokens
const read = await venue.operations.run("v/ops/covia/read", { path: "did:key:zAlice/w/shared" }, {
  ucans: [token],
});

// Discover what the venue offers
const ops = await venue.operations.list();
const adapters = await venue.adapters.list();
```

#### Private jobs

Pass `{ private: true }` to `run()` to execute as a memory-only job: it is never
persisted to the venue's job index and is gone on venue restart (the venue must
enable `enablePrivateJobs`). Private execution works with `run()`; poll-style
`invoke()` rejects it.

```typescript
const result = await venue.operations.run("v/ops/schema/infer", {
  value: { name: "Ada" },
}, { private: true });
```

### Job Lifecycle

```typescript
import { RunStatus } from "@covia/covia-sdk";

const job = await venue.operations.invoke("long-operation", { data: "..." });

// Poll status
console.log(job.metadata.status); // RunStatus.PENDING
await job.refresh();

// Wait for completion
await job.wait({ timeout: 120000 });
if (job.isComplete) {
  console.log(job.output);
}

// Interactive jobs
if (job.needsInput) {
  await job.sendMessage({ text: "user response" });
}

// Pause, resume, cancel, delete
await job.cancel();

// Stream SSE updates
for await (const event of job.stream()) {
  console.log(event.event, event.json());
}

// Look up jobs: a page of job records, newest first
const page = await venue.jobs.history({ limit: 20 });
console.log(`${page.total} jobs`, page.items.map((j) => j.status));
const again = await venue.jobs.get(job.id);
```

### Asset Management

```typescript
// Register an asset
const asset = await venue.assets.register({
  name: "Training Data",
  description: "Model training dataset",
  content: { contentType: "application/json" },
});

// Upload and download content
await asset.putContent(new Blob(['{"records": []}'], { type: "application/json" }));
const stream = await asset.getContent();

// Retrieve an asset: an Operation or a DataAsset
const op = await venue.getAsset("abc123...");
const out = await op.run({ x: 1 });

// List assets
const assets = await venue.assets.list({ limit: 100 });
console.log(`${assets.total} assets available`);
```

### Agents

`venue.agent(id)` returns a lazy handle; no request is made until you call a method.

```typescript
// Create (the name must be unused)
await venue.agents.create({ agentId: "mina", config: { systemPrompt: "You are helpful." } });
const mina = venue.agent("mina");

// Send a task and wait for the result
const answer = await mina.request({ question: "Summarise this" });
console.log(answer.output);

// Session-scoped chat: ChatSession carries the sessionId for you
const chat = mina.chatSession();
await chat.send("hi");
await chat.send("and now?");
const resumed = mina.chatSession(chat.sessionId);

// Saved sessions, state and lifecycle
const sessions = await mina.listSessions();
const info = await mina.info();
await mina.suspend();
await mina.resume();
const clone = await mina.fork("mina-v2", { includeTimeline: true });
await mina.delete();

// Collection-level calls
const agents = await venue.agents.list();
```

### Workspace

Reads are job-free; writes run as jobs so they leave an audit record.

```typescript
await venue.workspace.write("w/notes/today", { text: "hi" });
console.log((await venue.workspace.read("w/notes/today")).value);
await venue.workspace.append("w/notes/log", "new entry");

// Keys, elements, and selected fields per key
const keys = await venue.workspace.list("w/notes", 100, 0);
const slice = await venue.workspace.slice("w/notes/log", 0, 10);
const rows = await venue.workspace.listFields("w/vendors", ["name", "meta/updated"]);

// Server-side tallies
const { count } = await venue.workspace.count("w/notes/log");
const byKind = await venue.workspace.aggregate("w/events", { depth: 2, groupBy: "kind" });

// An agent's task or session scratch space
const scratch = venue.workspace.scoped({ agent: "mina", task: taskId });
await scratch.read("t/snapshot");

// Structured memory (w/memory) and skills
await venue.memory.remember("Prefers concise answers");
const memories = await venue.memory.list();
const skills = await venue.skills.list("w/skills");
```

### Secrets & UCANs

```typescript
// Secrets
await venue.secrets.set("ANTHROPIC_API_KEY", "sk-...");
console.log(await venue.secrets.list());

// Venue-issued UCAN delegation
const { token } = await venue.ucan.issue(
  "did:key:z6MkBob",
  [{ with: "did:key:zAlice/w/shared", can: "crud/read" }],
  Math.floor(Date.now() / 1000) + 3600,
);

// Diagnose a token against the venue's trust policy
const verdict = await venue.ucan.verify(token, { with: "did:key:zAlice/w/shared", can: "crud/read" });
console.log(verdict.valid, verdict.rootIssuer, verdict.authorises);
```

Tokens can also be minted **client-side** with your own Ed25519 key, with no venue round-trip:

```typescript
import { grant, identityToken, didFor } from "@covia/covia-sdk";

// Self-sovereign grant over your own namespace — verifies on ANY venue
const shared = grant(privateKey, "did:key:z6MkBob", `${didFor(privateKey)}/w/shared/`, "crud/read", 3600);

// Identity token — proves control of your DID to a venue (empty attenuation)
const idToken = identityToken(privateKey, venue.venueId);
```

### Venue Discovery

```typescript
const status = await venue.status();
const didDoc = await venue.didDocument();
const card = await venue.agentCard(); // A2A agent card

// MCP: discovery, tools, and tool calls
const mcp = await venue.mcp.discovery();
const tools = await venue.mcp.listAllTools();
const call = await venue.mcp.callTool("covia_read", { path: "w/notes" });
```

### Error Handling

```typescript
import {
  CoviaError, GridError, AssetNotFoundError, JobFailedError,
  CoviaTimeoutError, CoviaConnectionError, RateLimitError,
} from "@covia/covia-sdk";

try {
  const result = await venue.operations.run("might-fail", { x: 1 });
} catch (err) {
  if (err instanceof JobFailedError) {
    console.error(`Job failed: ${err.jobData.error}`);
  } else if (err instanceof CoviaTimeoutError) {
    console.error("Operation timed out");
  } else if (err instanceof RateLimitError) {
    // 429 after bounded automatic retries — rate limit or concurrent-job cap
    console.error(`Rate limited, retry after ${err.retryAfterSeconds}s`);
  } else if (err instanceof AssetNotFoundError) {
    console.error(`No asset ${err.assetId}`);
  } else if (err instanceof GridError) {
    console.error(`API error ${err.statusCode}: ${err.message}`);
  } else if (err instanceof CoviaConnectionError) {
    // Every candidate URL and failed request a connect attempt made
    console.error(err.candidates, err.attempts);
  } else if (err instanceof CoviaError) {
    console.error(`SDK error: ${err.message}`);
  }
}
```

## Development

```bash
# Clone and install
git clone https://github.com/covia-ai/covia-sdk.git
cd covia-sdk
pnpm install

# Build, unit tests, lint
pnpm run build
pnpm run test:unit
pnpm run lint

# Integration tests against a throwaway Docker venue
.github/integration/start-venue.sh > .it-env
(while IFS= read -r l; do export "$l"; done < .it-env; pnpm run test:integration)
docker stop covia-sdk-it-venue
```

See [AGENTS.md](AGENTS.md) for the module layout and release process.

## License

Apache License 2.0. See [LICENSE.md](LICENSE.md).

## Links

- [TypeScript SDK Documentation](https://docs.covia.ai/docs/user-guide/sdk/typescript)
- [Covia Documentation](https://docs.covia.ai)
- [Covia Website](https://covia.ai)
- [npm Package](https://www.npmjs.com/package/@covia/covia-sdk)
- [GitHub](https://github.com/covia-ai/covia-sdk)
- [Discord](https://discord.gg/fywdrKd8QT)
