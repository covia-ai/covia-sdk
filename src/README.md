# Covia TypeScript API

This directory contains the TypeScript implementation of the Covia grid API, extracted from the original JavaScript implementation.

## File Structure

- **`types.ts`** - TypeScript interfaces, types, and the `CoviaError` class
- **`Asset.ts`** - Abstract base class for all assets
- **`Operation.ts`** - Extends `Asset` for operation-specific functionality
- **`DataAsset.ts`** - Extends `Asset` for data asset-specific functionality
- **`Venue.ts`** - Manages connections and provides factory methods
- **`index.ts`** - Exports all classes and types
- **`example.ts`** - Usage examples

## Inheritance Structure

```
Asset (abstract base class)
├── Operation (extends Asset)
└── DataAsset (extends Asset)
```

## Usage

```typescript
import { Grid } from '@covia/covia-sdk';

// Create venue
const venue = await Grid.connect("venue-did");

// Get assets (returns Operation or DataAsset based on metadata)
const operation = await venue.getAsset('op-id');
const dataAsset = await venue.getAsset('data-id');

// Use inherited functionality
await operation.invoke({ param: 'value' }); // Simplified: just pass input parameters
await dataAsset.putContent(content);
```

## MCP Tools

`venue.mcp` is an MCP client for the venue's native `/mcp` endpoint. It mints
and correlates JSON-RPC ids, applies the venue auth provider with the venue DID
as audience, and accepts either an `application/json` or a `text/event-stream`
response — the venue chooses, and the SDK handles both.

```typescript
// Discovery and listing are job-free: no job is persisted per page.
const { tools, nextCursor } = await venue.mcp.listTools();
const all = await venue.mcp.listAllTools();   // drains the cursor

// Direct call: the result comes back in the response.
const result = await venue.mcp.callTool('echo', { text: 'hi' });
if (result.isError) console.error(result.content);  // the tool failed, not the call

// Tracked call: returns the Job, so the run is inspectable and linkable.
const job = await venue.mcp.callToolTracked('echo', { text: 'hi' });
await job.result();

// The same bridge reaches a third-party MCP server through the venue.
await venue.mcp.callToolTracked('search', { q: 'x' },
  { server: 'https://mcp.example.com', token: '…' });

// Escape hatch for methods the manager does not wrap.
await venue.mcp.request('resources/list');
```

`callTool` vs `callToolTracked`: both run the tool and both leave a venue-side
record. The difference is what you get back — the MCP result, or the `Job` to
stream, inspect and link. A protocol failure throws `MCPError` (carrying the
JSON-RPC `code` and `data`); a tool that ran and failed comes back normally
with `isError: true`.

## Key Features

- **Type Safety**: Full TypeScript support with proper interfaces
- **Inheritance**: `Operation` and `DataAsset` inherit all functionality from `Asset`
- **Caching**: Built-in caching for improved performance
- **Error Handling**: Typed `CoviaError` class for proper error management
- **Stream Support**: Built-in support for content streaming
