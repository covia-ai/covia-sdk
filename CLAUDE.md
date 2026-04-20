# CLAUDE.md

## Project Overview

`@covia/covia-sdk` — TypeScript SDK for Covia.ai, the Universal Grid for AI Orchestration & Multi-Agent Workflows. Provides APIs to connect to venues, manage assets/operations, execute jobs, handle streaming content, chat with agents over sessions, and work with UCAN-based auth, workspaces, and secrets.

## Tech Stack

- **Language:** TypeScript 5.3+
- **Runtime:** Node.js (>=18)
- **Build:** tsup (dual CJS + ESM output with type declarations)
- **Package Manager:** pnpm (npm lockfile also present)
- **Crypto:** `@noble/ed25519`, `@noble/hashes`, `did-resolver`, `web-did-resolver`

## Commands

```bash
pnpm install            # Install dependencies
pnpm run build          # Build (tsup → dist/)
pnpm run dev            # Build in watch mode
pnpm run lint           # ESLint
pnpm test               # Run all Jest tests
pnpm run test:unit      # Unit tests only (src/__tests__/)
pnpm run test:integration  # Integration tests (venue.test.ts)
```

## Project Structure

```
src/
├── index.ts            # Main entry point and re-exports
├── types.ts            # Type definitions and interfaces
├── Venue.ts            # Venue class — primary API surface, delegates to managers
├── Grid.ts             # Grid connection manager
├── Asset.ts            # Abstract base class for assets
├── Operation.ts        # Operation asset (extends Asset)
├── DataAsset.ts        # Data asset (extends Asset)
├── Job.ts              # Job execution tracking
├── Credentials.ts      # Auth interface (NoAuth + implementations)
├── Logger.ts           # Logger utility
├── Utils.ts            # Fetch helpers, SSE streaming, job status utilities
├── AgentManager.ts     # Agent lifecycle on a venue
├── AssetManager.ts     # Asset CRUD, caching, listing
├── JobManager.ts       # Job creation, polling, listing
├── OperationManager.ts # Operation invocation (v/ops/<adapter>/<op>)
├── WorkspaceManager.ts # Workspace management
├── SecretManager.ts    # Secret storage per venue
├── UCANManager.ts      # UCAN token delegation/auth
├── crypto/
│   ├── base58.ts       # Base58 encoding
│   ├── jwt.ts          # JWT signing/verification
│   ├── keys.ts         # ed25519 key generation + hex conversion
│   └── multikey.ts     # DID/multikey encoding
├── example.ts          # Usage examples
└── __tests__/          # Jest unit tests (one per manager + SSE, Utils, types, ...)
examples/node/          # Node.js usage example
venue.test.ts           # Integration test (requires live venue)
dist/                   # Build output (CJS + ESM + .d.ts) — committed
```

## Key Exports

**Classes:** `Grid`, `Venue`, `Asset`, `Operation`, `DataAsset`, `Job`

**Managers:** `AgentManager`, `AssetManager`, `JobManager`, `OperationManager`, `WorkspaceManager`, `UCANManager`, `SecretManager`

**Types:** `VenueOptions`, `AssetMetadata`, `OperationDetails`, `JobMetadata`, `RunStatus`, `CoviaError`, `AgentCard`, `MCPDiscovery`, `DIDDocument`

**Utilities:** `fetchWithError()`, `fetchStreamWithError()`, `isJobComplete()`, `isJobFinished()`, `isJobPaused()`, `getParsedAssetId()`, `getAssetIdFromPath()`

**Crypto:** `generateKeyPair`, `privateKeyToHex`, `hexToPrivateKey`, `didFromPublicKey`, `encodePublicKey`, `decodePublicKey`

## Core Workflow

1. Connect to a venue via `Grid.connect()` or `Venue.connect()` (HTTP URL, DNS name, or `did:web:`)
2. Access domain managers through `venue.assets`, `venue.operations`, `venue.jobs`, `venue.agents`, `venue.workspace`, `venue.secrets`, `venue.ucan` (lazily instantiated)
3. Retrieve assets via `venue.assets.get(id)` → returns `Operation` or `DataAsset`
4. Invoke operations (resolved via `v/ops/<adapter>/<op>` paths) and poll jobs
5. Discover venue metadata via `venue.status()`, `venue.didDocument()`, `venue.mcpDiscovery()`, `venue.agentCard()`

## Agent Chat Sessions

`AgentManager.chat(agentId, message, sessionId?)` blocks until the agent returns its next response on the session. Omit `sessionId` on the first call; the server mints one and returns it in the result — capture and pass it on subsequent calls. Unknown session ids are rejected (no silent mint). Only one chat may be in flight per session.

## Venue Lifecycle

`Venue` implements `Symbol.dispose`, so `using venue = await Grid.connect(...)` works in TS 5.2+. `close()` clears cached asset state.

## Key Conventions

- Strict TypeScript — strict mode enabled, unused vars are errors (underscore prefix exempted)
- `no-explicit-any` is a warning, not an error
- Explicit return types not required
- DID-based identity resolution via `did-resolver` + `web-did-resolver`; service type `Covia.API.v1`
- `CoviaError` is the custom error class for all API errors
- Manager pattern: `Venue` owns shared state (baseUrl, auth, venueId); managers are lazy getters that hold a back-reference to the venue

## Testing

- **Framework:** Jest 30 + ts-jest
- **Environment:** Node.js
- **Env vars:** Loaded from `.env` via dotenv in `jest.config.js`
- **Unit tests:** `src/__tests__/*.test.ts` — one suite per manager, plus SSE, Utils, types, Credentials
- **Integration tests:** `venue.test.ts` at repo root — hits a live venue

## Package Details

- **npm:** `@covia/covia-sdk`
- **Version:** see `package.json` (currently 1.3.x)
- **Entry points:** `dist/index.js` (CJS), `dist/index.mjs` (ESM), `dist/index.d.ts` (types)
- **License:** MIT
