---
name: build-and-test
description: Build the SDK (tsup → dual CJS + ESM) and run all tests in one shot.
---

# Build and Test

Build the SDK and run all tests sequentially.

## Steps

1. **Install dependencies:**
```bash
cd covia-sdk && pnpm install
```

2. **Build:**
```bash
pnpm run build
```

This runs tsup, producing `dist/index.js` (CJS), `dist/index.mjs` (ESM), and `dist/index.d.ts` (types).

3. **Run tests:**
```bash
pnpm test
```

Unit tests are in `src/__tests__/`. Integration tests are in `venue.test.ts` (requires a running venue).

## Summary Format

```
SDK Build & Test
================
Build:  PASS / FAIL
Tests:  X passed, Y failed, Z total
Output: dist/index.js, dist/index.mjs, dist/index.d.ts
```

## Notes

- To run only unit tests: `pnpm run test:unit`
- To run only integration tests: `pnpm run test:integration` (requires running venue)
- Build must succeed before publish — `prepublishOnly` runs build + test automatically
