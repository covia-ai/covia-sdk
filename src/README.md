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

## Key Features

- **Type Safety**: Full TypeScript support with proper interfaces
- **Inheritance**: `Operation` and `DataAsset` inherit all functionality from `Asset`
- **Caching**: Built-in caching for improved performance
- **Error Handling**: Typed `CoviaError` class for proper error management
- **Stream Support**: Built-in support for content streaming
