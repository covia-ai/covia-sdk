# @covia/covia-sdk

[![npm version](https://badge.fury.io/js/@covia%2Fcovia-sdk.svg)](https://www.npmjs.com/package/@covia/covia-sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)

TypeScript SDK for [Covia.ai](https://covia.ai) — The Universal Grid for AI Orchestration & Multi-Agent Workflows.

Covia.ai provides federated execution, cryptographic verification, and shared state management for AI agents across organizations, clouds, and platforms.

## Installation

```bash
npm install @covia/covia-sdk
```

```bash
pnpm add @covia/covia-sdk
```

```bash
yarn add @covia/covia-sdk
```

## Quick Start

```typescript
import { Grid, KeyPairAuth } from "@covia/covia-sdk";

// Connect to a venue (URL, DNS name, or DID)
const venue = await Grid.connect("https://venue.covia.ai");

// Or connect with keypair authentication
const auth = KeyPairAuth.generate();
const venue = await Grid.connect("did:web:venue.covia.ai", auth);

// Run an operation and get the result
const result = await venue.operations.run("v/ops/schema/infer", {
  value: { name: "Ada", age: 36, admin: true },
});

// Invoke an operation asynchronously and track the job
const job = await venue.operations.invoke("v/ops/schema/infer", {
  value: { name: "Ada", age: 36, admin: true },
});
console.log(`Job ${job.id} status: ${job.metadata.status}`);
const output = await job.result({ timeout: 30000 });

// Work with assets
const assets = await venue.listAssets();
const operation = await venue.getAsset("my-operation-id");
await operation.invoke({ param: "value" });

// Upload data
const dataAsset = await venue.getAsset("my-data-id");
await dataAsset.putContent(new Blob(["Hello World"], { type: "text/plain" }));
const stream = await dataAsset.getContent();

// Clean up
venue.close();
```

## Connecting to a Venue

The SDK supports three connection methods:

```typescript
import { Grid, Venue, KeyPairAuth, BearerAuth } from "@covia/covia-sdk";

// Via Grid (cached — same ID returns the same Venue instance)
const venue = await Grid.connect("https://venue.covia.ai");
const venue = await Grid.connect("did:web:venue.covia.ai");
const venue = await Grid.connect("venue.covia.ai"); // DNS name → https://

// Via Venue directly (no caching)
const venue = await Venue.connect("https://venue.covia.ai");
```

### Authentication

```typescript
// No auth (default)
const venue = await Grid.connect("https://venue.covia.ai");

// Ed25519 keypair (self-issued JWT per request)
const auth = KeyPairAuth.generate();
console.log(auth.getDID()); // did:key:z6Mk...
const venue = await Grid.connect("https://venue.covia.ai", auth);

// From a saved private key
const auth = KeyPairAuth.fromHex("abcdef1234...");

// Bearer token
const auth = new BearerAuth("my-api-token");
const venue = await Grid.connect("https://venue.covia.ai", auth);
```

## API Reference

### Venue

The `Venue` is the primary entry point. All domain-specific functionality is accessed through manager objects.

```typescript
venue.baseUrl;    // string — the venue's base URL
venue.venueId;    // string — the venue's DID
venue.metadata;   // { name, description }
```

| Method | Description |
|---|---|
| `venue.status()` | Get venue status (health, stats) |
| `venue.getAsset(assetId)` | Get an asset by ID (returns `Operation` or `DataAsset`) |
| `venue.listAssets(options?)` | List assets with pagination (`{ offset, limit }`) |
| `venue.agent(agentId)` | Get a lazy `Agent` handle (no round-trip) |
| `venue.getJob(jobId)` | Get a job by ID |
| `venue.listJobs()` | List all job IDs |
| `venue.didDocument()` | Get the venue's DID document |
| `venue.mcpDiscovery()` | Get MCP (Model Context Protocol) discovery info |
| `venue.agentCard()` | Get A2A (Agent-to-Agent) agent card |
| `venue.close()` | Release resources and clear caches |

---

### Operations — `venue.operations`

Execute named operations or asset-based operations.

```typescript
// List available operations
const ops = await venue.operations.list();
ops.forEach((op) => console.log(`${op.name}: ${op.description}`));

// Get operation details
const info = await venue.operations.get("v/ops/schema/infer");

// Run synchronously (invoke + wait for result)
const result = await venue.operations.run("v/ops/schema/infer", {
  value: { name: "Ada", age: 36 },
});

// Invoke asynchronously (returns a Job)
const job = await venue.operations.invoke("v/ops/schema/infer", {
  value: { name: "Ada", age: 36 },
});
const output = await job.result({ timeout: 10000 });

// With UCAN capability tokens
const job = await venue.operations.invoke("sensitive:op", input, {
  ucans: ["eyJhbGc..."],
});
```

| Method | Returns | Description |
|---|---|---|
| `operations.list()` | `OperationInfo[]` | List all named operations |
| `operations.get(name)` | `OperationInfo` | Get operation details |
| `operations.run(id, input, options?)` | `any` | Execute and wait for result |
| `operations.invoke(id, input, options?)` | `Job` | Execute and return a Job |

---

### Assets — `venue.assets`

Manage data assets and operations registered on the venue.

```typescript
// List and retrieve assets
const list = await venue.assets.list({ offset: 0, limit: 50 });
const asset = await venue.assets.get("asset-id");

// Register a new asset
const newAsset = await venue.assets.register({
  name: "My Dataset",
  description: "Training data",
  content: { contentType: "text/csv", sha256: "abc123..." },
});

// Upload and download content
await venue.assets.putContent("asset-id", new Blob(["data"]));
const stream = await venue.assets.getContent("asset-id");

// Get metadata
const meta = await venue.assets.getMetadata("asset-id");
```

| Method | Returns | Description |
|---|---|---|
| `assets.get(assetId)` | `Asset` | Get asset by ID (`Operation` or `DataAsset`) |
| `assets.list(options?)` | `AssetList` | List assets with pagination |
| `assets.register(data)` | `Asset` | Register a new asset |
| `assets.getMetadata(assetId)` | `AssetMetadata` | Get asset metadata |
| `assets.putContent(assetId, content)` | `ContentHashResult` | Upload content |
| `assets.getContent(assetId)` | `ReadableStream \| null` | Download content stream |
| `assets.clearCache()` | `void` | Clear the asset cache |

---

### Jobs — `venue.jobs`

Manage job lifecycle. Jobs are also returned by `operations.invoke()` and `asset.invoke()`.

```typescript
// List and retrieve jobs
const jobIds = await venue.jobs.list();
const job = await venue.jobs.get(jobIds[0]);

// Job lifecycle via manager
await venue.jobs.pause(jobId);
await venue.jobs.resume(jobId);
await venue.jobs.cancel(jobId);
await venue.jobs.delete(jobId);

// Send a message to a running job
await venue.jobs.sendMessage(jobId, { text: "user input" });

// Stream server-sent events
for await (const event of venue.jobs.stream(jobId)) {
  console.log(event.event, event.json());
}
```

| Method | Returns | Description |
|---|---|---|
| `jobs.list()` | `string[]` | List all job IDs |
| `jobs.get(jobId)` | `Job` | Get a job by ID |
| `jobs.cancel(jobId)` | `JobMetadata` | Cancel a job |
| `jobs.delete(jobId)` | `void` | Delete a job |
| `jobs.pause(jobId)` | `JobMetadata` | Pause a job |
| `jobs.resume(jobId)` | `JobMetadata` | Resume a paused job |
| `jobs.sendMessage(jobId, msg)` | `any` | Send a message to a job |
| `jobs.stream(jobId)` | `AsyncGenerator<SSEEvent>` | Stream SSE events |

---

### Job Instance

Once you have a `Job` object, you can interact with it directly.

```typescript
const job = await venue.operations.invoke("long:task", input);

// Status helpers
job.isFinished;  // true for COMPLETE, FAILED, CANCELLED, REJECTED, TIMEOUT
job.isComplete;  // true only for COMPLETE
job.isPaused;    // true for PAUSED, INPUT_REQUIRED, AUTH_REQUIRED
job.needsInput;  // true for INPUT_REQUIRED
job.needsAuth;   // true for AUTH_REQUIRED

// Wait for completion
await job.wait({ timeout: 60000 });
const output = job.output; // throws JobFailedError if not COMPLETE

// Or wait + get output in one call
const result = await job.result({ timeout: 60000 });

// Refresh status from server
await job.refresh();

// Lifecycle
await job.cancel();
await job.delete();
await job.pause();
await job.resume();

// Interactive jobs
if (job.needsInput) {
  await job.sendMessage({ text: "user response" });
}

// Stream events
for await (const event of job.stream()) {
  console.log(event.event, event.json());
}
```

| Property / Method | Type | Description |
|---|---|---|
| `job.id` | `string` | Job identifier |
| `job.metadata` | `JobMetadata` | Status, input, output, timestamps |
| `job.isFinished` | `boolean` | Terminal state reached |
| `job.isComplete` | `boolean` | Completed successfully |
| `job.isPaused` | `boolean` | Paused / awaiting input or auth |
| `job.needsInput` | `boolean` | Requires user input |
| `job.needsAuth` | `boolean` | Requires authentication |
| `job.output` | `any` | Get output (throws if not complete) |
| `job.refresh()` | `Promise<void>` | Poll latest status from server |
| `job.wait(options?)` | `Promise<void>` | Wait until finished (exponential backoff) |
| `job.result(options?)` | `Promise<any>` | Wait and return output |
| `job.cancel()` | `Promise<JobMetadata>` | Cancel the job |
| `job.delete()` | `Promise<void>` | Delete the job |
| `job.pause()` | `Promise<JobMetadata>` | Pause the job |
| `job.resume()` | `Promise<JobMetadata>` | Resume the job |
| `job.sendMessage(msg)` | `Promise<any>` | Send a message to the job |
| `job.stream()` | `AsyncGenerator<SSEEvent>` | Stream SSE events |

---

### Asset Instance

Assets returned by `venue.getAsset()` or `venue.assets.get()` are either an `Operation` or a `DataAsset`.

```typescript
const asset = await venue.getAsset("my-asset-id");

// Metadata
const meta = await asset.getMetadata();

// Content (DataAsset)
await asset.putContent(new Blob(["data"], { type: "text/plain" }));
const stream = await asset.getContent();
const url = asset.getContentURL(); // direct download URL

// Execution (Operation)
const result = await asset.run({ param: "value" });      // sync
const job = await asset.invoke({ param: "value" });       // async → Job
```

| Method | Returns | Description |
|---|---|---|
| `asset.id` | `string` | Asset identifier |
| `asset.metadata` | `AssetMetadata` | Asset metadata |
| `asset.getMetadata()` | `Promise<AssetMetadata>` | Fetch metadata (cached) |
| `asset.putContent(content)` | `Promise<ContentHashResult>` | Upload content |
| `asset.getContent()` | `Promise<ReadableStream \| null>` | Download content stream |
| `asset.getContentURL()` | `string` | Direct content download URL |
| `asset.run(input)` | `Promise<any>` | Execute and wait for result |
| `asset.invoke(input)` | `Promise<Job>` | Execute and return a Job |

---

### Agents — `venue.agent(id)` / `venue.agents`

The preferred way to work with agents is through the `Agent` instance returned by `venue.agent(id)`. This is a lazy handle — no network call is made until you invoke a method.

```typescript
// Get a handle to an agent (no round-trip)
const mina = venue.agent("Mina");

// Interact
const response = await mina.request({ text: "hello" });
await mina.message({ event: "update" });
await mina.trigger();
const state = await mina.query();
const info = await mina.info();

// Session-scoped chat — ChatSession manages the sessionId for you
const chat = mina.chatSession();
await chat.send("hi");          // mints a new session
await chat.send("and now?");    // reuses the session automatically
chat.sessionId;                 // available for persistence

// Resume a previous session
const resumed = mina.chatSession(storedSessionId);
await resumed.send("I'm back");

// Lifecycle
await mina.suspend();
await mina.resume();
await mina.update({ config: { model: "gpt-4" } });
await mina.cancelTask("task-123");
await mina.delete();

// Fork into a new agent
const clone = await mina.fork("Mina-v2", { includeTimeline: true });
```

#### Agent Instance

| Method | Returns | Description |
|---|---|---|
| `agent.request(input?, wait?)` | `AgentRequestResult` | Send request to agent |
| `agent.message(message)` | `AgentMessageResult` | Send a message |
| `agent.chat(message, sessionId?)` | `AgentChatResult` | Single chat call (manual sessionId) |
| `agent.chatSession(sessionId?)` | `ChatSession` | Create a session that manages sessionId |
| `agent.trigger()` | `AgentTriggerResult` | Trigger agent execution |
| `agent.query()` | `AgentQueryResult` | Query agent state |
| `agent.info()` | `AgentInfoResult` | Get agent info |
| `agent.context(task?)` | `string` | Get agent context |
| `agent.suspend()` | `AgentSuspendResult` | Suspend the agent |
| `agent.resume(autoWake?)` | `AgentSuspendResult` | Resume the agent |
| `agent.update(options)` | `any` | Update agent config/state |
| `agent.cancelTask(taskId)` | `any` | Cancel an agent task |
| `agent.fork(agentId, options?)` | `Agent` | Fork into a new agent |
| `agent.delete(remove?)` | `AgentDeleteResult` | Delete the agent |

#### ChatSession

| Property / Method | Type | Description |
|---|---|---|
| `chat.sessionId` | `string \| undefined` | Current session ID (undefined until first send) |
| `chat.send(message)` | `Promise<AgentChatResult>` | Send a message, auto-managing sessionId |

#### AgentManager — `venue.agents`

The `AgentManager` is still available for collection-level operations and flat-style dispatch.

```typescript
// Create an agent
await venue.agents.create({ agentId: "my-agent", config: { ... } });

// List agents
const agents = await venue.agents.list();

// Flat-style dispatch (all manager methods still work)
await venue.agents.chat("my-agent", "hi");
```

| Method | Returns | Description |
|---|---|---|
| `agents.create(input)` | `AgentCreateResult` | Create an agent |
| `agents.list(includeTerminated?)` | `AgentListResult` | List agents |
| `agents.request(id, input?, wait?)` | `AgentRequestResult` | Send request to agent |
| `agents.message(id, message)` | `AgentMessageResult` | Send a message |
| `agents.chat(id, message, sessionId?)` | `AgentChatResult` | Session-scoped chat |
| `agents.trigger(id)` | `AgentTriggerResult` | Trigger agent execution |
| `agents.query(id)` | `AgentQueryResult` | Query agent state |
| `agents.info(id)` | `AgentInfoResult` | Get agent info |
| `agents.suspend(id)` | `AgentSuspendResult` | Suspend an agent |
| `agents.resume(id, autoWake?)` | `AgentSuspendResult` | Resume an agent |
| `agents.update(input)` | `any` | Update agent config/state |
| `agents.cancelTask(agentId, taskId)` | `any` | Cancel an agent task |
| `agents.fork(input)` | `AgentForkResult` | Fork an agent |
| `agents.context(id, task?)` | `string` | Get agent context |
| `agents.delete(id, remove?)` | `AgentDeleteResult` | Delete an agent |

---

### Workspace — `venue.workspace`

Read and write shared state in the venue's workspace.

**Reads are job-free.** `read`/`list`/`slice`/`inspect`/`count`/`aggregate` go through
`GET /api/v1/values/*` (covia #177) — synchronous, capability-checked, and **no job is
persisted**. This matters under load: routing reads through the invoke/job path writes a
durable job record per read, growing the venue's etch without bound. **Writes stay on the
job path** (they should leave an audit record). A read that needs UCAN **proof tokens**
(cross-DID) transparently falls back to the invoke path.

```typescript
// CRUD (reads are job-free; writes are jobs)
await venue.workspace.write("w/my-app/config", { theme: "dark" });
const data = await venue.workspace.read("w/my-app/config");
await venue.workspace.append("w/my-app/log", "new entry");
await venue.workspace.delete("w/my-app/config");

// List and slice
const entries = await venue.workspace.list("w/my-app/log", 100, 0);
const slice = await venue.workspace.slice("w/my-app/log", 0, 10);

// Server-side tallies — count / group-by without reading every record
const { count } = await venue.workspace.count("w/my-app/log", { depth: 1 });
const byKind = await venue.workspace.aggregate("w/my-app/events", { depth: 2, groupBy: "kind" });
// byKind.groups → { click: { count: 12 }, view: { count: 40 } }
```

| Method | Returns | Description |
|---|---|---|
| `workspace.read(path, maxSize?)` | `WorkspaceReadResult` | Read a value (job-free) |
| `workspace.write(path, value)` | `WorkspaceWriteResult` | Write a value (job) |
| `workspace.delete(path)` | `WorkspaceDeleteResult` | Delete an entry (job) |
| `workspace.append(path, value)` | `WorkspaceAppendResult` | Append to an entry (job) |
| `workspace.list(path?, limit?, offset?)` | `WorkspaceListResult` | List keys/count of a node (job-free) |
| `workspace.slice(path, offset?, limit?)` | `WorkspaceSliceResult` | Paginated elements/entries (job-free) |
| `workspace.inspect(paths, budget?, compact?)` | `WorkspaceInspectResult` | JSON5 render of a value (job-free; single path) |
| `workspace.count(path, {depth?})` | `WorkspaceCountResult` | Count entries at a depth (job-free) |
| `workspace.aggregate(path, {depth?, groupBy?})` | `WorkspaceAggregateResult` | Count, optionally grouped by a field (job-free) |
| `workspace.copy(from, to)` | `WorkspaceCopyResult` | Copy a value between paths (job) |

---

### Secrets — `venue.secrets`

Manage secrets stored on the venue.

```typescript
// Store and retrieve
await venue.secrets.put("API_KEY", "sk-...");
await venue.secrets.set("API_KEY", "sk-..."); // via secret:set operation

// List
const names = await venue.secrets.list(); // ["API_KEY", "DB_PASS"]

// Extract (requires UCAN capability)
const secret = await venue.secrets.extract("API_KEY");

// Delete
await venue.secrets.delete("API_KEY");
```

| Method | Returns | Description |
|---|---|---|
| `secrets.list()` | `string[]` | List secret names |
| `secrets.put(name, value)` | `void` | Store a secret via REST |
| `secrets.set(name, value)` | `SecretSetResult` | Store via `secret:set` operation |
| `secrets.extract(name)` | `SecretExtractResult` | Extract value (requires UCAN) |
| `secrets.delete(name)` | `void` | Delete a secret |

---

### UCAN — `venue.ucan`

Issue UCAN (User Controlled Authorization Network) capability tokens.

```typescript
const att = [{ with: "/w/my-app/", can: "crud/read" }];
const exp = Math.floor(Date.now() / 1000) + 3600; // 1 hour

const token = await venue.ucan.issue("did:key:z6MkBob", att, exp);
```

| Method | Returns | Description |
|---|---|---|
| `ucan.issue(aud, att, exp)` | `UCANIssueResult` | Issue a UCAN token |

---

## Error Handling

The SDK provides a hierarchy of typed errors:

```typescript
import {
  CoviaError,          // Base error
  GridError,           // HTTP API errors (4xx/5xx)
  NotFoundError,       // 404 responses
  AssetNotFoundError,  // Asset not found
  JobNotFoundError,    // Job not found
  CoviaConnectionError,// Connection failures
  CoviaTimeoutError,   // Timeout exceeded
  JobFailedError,      // Job finished with non-COMPLETE status
} from "@covia/covia-sdk";

try {
  const asset = await venue.getAsset("nonexistent");
} catch (err) {
  if (err instanceof AssetNotFoundError) {
    console.log(`Asset ${err.assetId} not found`);
  } else if (err instanceof GridError) {
    console.log(`HTTP ${err.statusCode}: ${err.message}`);
  }
}

try {
  const result = await job.result({ timeout: 5000 });
} catch (err) {
  if (err instanceof CoviaTimeoutError) {
    console.log("Job took too long");
  } else if (err instanceof JobFailedError) {
    console.log(`Job failed: ${err.jobData.status}`);
  }
}
```

## Job Status

```typescript
import { RunStatus } from "@covia/covia-sdk";

RunStatus.PENDING;         // Queued, not yet started
RunStatus.STARTED;         // Running
RunStatus.COMPLETE;        // Finished successfully
RunStatus.FAILED;          // Finished with error
RunStatus.CANCELLED;       // Cancelled by user
RunStatus.TIMEOUT;         // Timed out
RunStatus.REJECTED;        // Rejected by venue
RunStatus.PAUSED;          // Paused
RunStatus.INPUT_REQUIRED;  // Waiting for user input
RunStatus.AUTH_REQUIRED;   // Waiting for authentication
```

## Requirements

- Node.js >= 18
- TypeScript >= 5.3 (for TypeScript users)

## TypeScript

`@covia/covia-sdk` is written in TypeScript and ships with full type declarations. No `@types/` package is needed.

```typescript
import {
  Venue, Grid, Job, Agent, ChatSession, Asset, Operation, DataAsset,
  AssetManager, OperationManager, JobManager,
  AgentManager, WorkspaceManager, SecretManager, UCANManager,
  KeyPairAuth, BearerAuth,
  RunStatus, CoviaError,
} from "@covia/covia-sdk";
```

## Resources

- [Covia.ai Platform](https://covia.ai)
- [Documentation](https://docs.covia.ai/)
- [GitHub Repository](https://github.com/covia-ai/covia-sdk)
- [npm Package](https://www.npmjs.com/package/@covia/covia-sdk)

## License

Apache-2.0 - [Covia AI](https://covia.ai)
