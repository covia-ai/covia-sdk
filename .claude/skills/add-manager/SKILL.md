---
name: add-manager
description: Scaffold a new Manager class following the SDK's existing pattern — venue interface, _buildHeaders, auth integration, exports.
argument-hint: <ManagerName>
---

# Add Manager

Scaffold a new Manager class following the established SDK pattern.

## Steps

1. **Create `src/<Name>Manager.ts`** using this template:

```typescript
import { fetchWithError, fetchStreamWithError } from './Utils';

interface <Name>ManagerVenue {
  baseUrl: string;
  auth: { apply(headers: Record<string, string>): void };
}

export class <Name>Manager {
  constructor(private venue: <Name>ManagerVenue) {}

  // Add methods here, e.g.:
  // async list(): Promise<Item[]> {
  //   return fetchWithError<Item[]>(`${this.venue.baseUrl}/api/v1/<resource>`, {
  //     headers: this._buildHeaders(),
  //   });
  // }

  private _buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    this.venue.auth.apply(headers);
    return headers;
  }
}
```

2. **Export from `src/index.ts`:**
```typescript
export { <Name>Manager } from './<Name>Manager';
```

3. **Add lazy getter in `src/Venue.ts`:**
```typescript
// Add private field:
private _<name>?: <Name>Manager;

// Add getter:
get <name>(): <Name>Manager { return this._<name> ??= new <Name>Manager(this); }
```

4. **Add types** to `src/types.ts` if the manager introduces new response types.

## Key Conventions

- Each manager defines its own minimal venue interface (only `baseUrl` + `auth.apply`)
- `_buildHeaders()` is private — always delegates to `this.venue.auth.apply(headers)`
- Use `fetchWithError<T>()` for JSON responses, `fetchStreamWithError()` for streaming
- Catch `NotFoundError` and rethrow as domain-specific errors where appropriate
- Managers are accessed via lazy getters on `Venue` (e.g., `venue.assets`, `venue.jobs`)

## Reference Files

- `src/AssetManager.ts` — Full example with caching, CRUD, content upload/download
- `src/JobManager.ts` — Simpler example with list, get, cancel, delete
- `src/SecretManager.ts` — Minimal example
- `src/Venue.ts` — Lazy getter registration pattern (lines 25-39)
- `src/index.ts` — Export registration
