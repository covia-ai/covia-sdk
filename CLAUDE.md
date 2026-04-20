# CLAUDE.md

## Project Overview

`@covia/covia-sdk` — TypeScript SDK for Covia.ai, the Universal Grid for AI Orchestration & Multi-Agent Workflows. Provides APIs to connect to venues, manage assets/operations, execute jobs, and handle streaming content.

## Tech Stack

- **Language:** TypeScript 5.3+
- **Runtime:** Node.js (>=18.0.0)
- **Build:** tsup (dual CJS + ESM output with type declarations)
- **Package Manager:** pnpm

## Commands

```bash
pnpm install          # Install dependencies
pnpm run build        # Build (tsup → dist/)
pnpm run dev          # Build in watch mode
pnpm run lint         # ESLint
pnpm test             # Run Jest tests
```

## Project Structure

```
src/
├── index.ts          # Main entry point and re-exports
├── types.ts          # Type definitions and interfaces
├── Venue.ts          # Venue class — primary API surface
├── Grid.ts           # Grid connection manager with caching
├── Asset.ts          # Abstract base class for assets
├── Operation.ts      # Operation asset (extends Asset)
├── DataAsset.ts      # Data asset (extends Asset)
├── Job.ts            # Job execution tracking
├── Credentials.ts    # Authentication/credentials interface
├── Utils.ts          # Fetch helpers, job status utilities
└── example.ts        # Usage examples
examples/node/        # Node.js usage example
dist/                 # Build output (CJS + ESM + .d.ts)
```

## Key Exports

**Classes:** `Grid`, `Venue`, `Asset`, `Operation`, `DataAsset`, `Job`

**Types:** `VenueOptions`, `AssetMetadata`, `OperationDetails`, `JobMetadata`, `RunStatus`, `CoviaError`

**Utilities:** `fetchWithError()`, `fetchStreamWithError()`, `isJobComplete()`, `isJobFinished()`, `isJobPaused()`, `getParsedAssetId()`, `getAssetIdFromPath()`

## Core Workflow

1. Connect to a venue via `Grid.connect()` (supports HTTP URLs, DNS names, or DIDs)
2. Retrieve assets via `venue.getAsset()` → returns `Operation` or `DataAsset`
3. Invoke operations or manage data assets
4. Track job execution via `Job` class
5. Upload/download content via streaming

## Key Conventions

- Strict TypeScript — strict mode enabled, unused vars are errors (underscore prefix exempted)
- `no-explicit-any` is a warning, not an error
- Explicit return types not required
- DID-based identity resolution via `did-resolver` and `web-did-resolver`
- `CoviaError` custom error class for API errors

## Testing

- **Framework:** Jest 30 + ts-jest
- **Environment:** Node.js
- **Env vars:** Loaded from `.env` via dotenv in jest.config.js
- **Test file:** `venue.test.ts` (integration tests covering Grid, assets, operations, jobs)

## Package Details

- **npm:** `@covia/covia-sdk`
- **Entry points:** `dist/index.js` (CJS), `dist/index.mjs` (ESM), `dist/index.d.ts` (types)
- **License:** MIT
