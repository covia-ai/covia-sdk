# Changelog

All notable changes to `@covia/covia-sdk` are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/); this package follows
its own SemVer track (independent of the venue/platform version).

## 1.9.1

### Added

- **`Ed25519Auth.identityToken(audience?, lifetimeSeconds?)`** — mint and
  return the bearer-usable identity JWT that `apply()` attaches to requests,
  for presenting the identity outside the SDK (CLI tools, curl, another
  client). Same audience rules as `apply()`: the `aud` claim is required and
  binds the token to one venue.

## 1.9.0

### Security

- **Connect no longer sends credentials to unverified hosts.** The connect-time
  status probe is anonymous again (as in 1.8.0): candidate hosts (typo'd DNS,
  http fallback) receive no `Authorization` header of any kind. The first
  authenticated request is made by the returned venue, with the token audience
  bound to the DID pinned at validation.
- **`Ed25519Auth` refuses to mint an unbound token.** A JWT without an `aud`
  claim is replayable at any venue that accepts the caller's DID; `apply()` now
  throws if no venue audience is known. Connect via `Grid.connect()` /
  `Venue.connect()` (which pins the venue DID), or pin `auth.audience`
  explicitly for hand-constructed venues.
- **A URL connect can no longer claim a DID's cache slot.** `Grid` registers a
  venue's reported DID as a cache alias only when the caller connected by that
  DID (resolved and identity-asserted); a URL connect's self-reported DID is
  trust-on-first-use and no longer aliases, so a later connect by DID always
  performs full resolution and identity checking.

### Added

- **Asset-based skill access** — `venue.skills.list(path)` returns the ordinary
  asset objects at one collection location and `venue.skills.get(path)` returns
  the ordinary asset at one exact path. Discovery and interpretation remain
  application concerns.
- **Structured user memory** — `venue.memory.list` reads `w/memory` job-free;
  `remember`, `update` and `forget` retain the venue's audited operation path.
- **Agent session reads** — paginated `listSessions` and exact `getSession` methods
  on both `AgentManager` and bound `Agent` handles, backed by job-free workspace
  reads of `g/<agent>/sessions`.

### Added

- `AssetManager.listMine(options)` — job-free listing of the authenticated
  caller's own assets (the per-user `a/` namespace populated by `store`/
  `pin`), via `GET /api/v1/assets?scope=own`. Returns `MyAssetList`
  (`AssetSummary[]` items with `name`/`type`/`description`), distinct from the
  venue-wide catalog `list()` reads.

### Changed

- Read methods no longer silently invoke operations when a job-free endpoint
  is unavailable. They now throw `UnsupportedVenueFeatureError`; callers that
  intend to create a persisted job can invoke the corresponding operation
  explicitly.
- Simplified memory results: `memory.list()` now returns `MemoryEntry[]`
  directly, entries have required text without a duplicate raw value, and all
  mutations return the same validated `{ number, count }` shape.
- Simplified agent sessions to `AgentSession` and `AgentSessionPage`: pages use
  the common `items`/`total`/`offset`/`limit` vocabulary, exact lookup is
  `getSession()`, and the duplicate raw venue value is no longer exposed.
- `jobs.list()` now follows the venue's page envelope until all job IDs have
  been read and validates malformed responses instead of silently returning a
  partial or empty list.
- Private jobs are now selected per `operations.run(..., { private: true })`;
  the mutable connection-wide `venue.setPrivate()` switch remains available
  for compatibility but is deprecated.
- Grid connections are now cached per `(venue, auth)` with in-flight request
  deduplication, canonical URL/DID aliases, and failed/closed-handle eviction;
  closing one Venue no longer clears other venues' in-memory asset caches.
- Centralised venue API transport so status, operation discovery, assets, jobs,
  agents, workspace and secrets consistently carry venue-bound authentication;
  plain-text HTTP failures are now preserved in typed errors.
- Removed deployment-specific venue hostnames, a hard-coded asset hash, and a
  duplicated package-version claim from examples and contributor guidance.
  Runnable examples now require an explicit venue environment override, while
  illustrative snippets and URL parser tests use RFC-reserved fixtures.
- Made npm publishing stable-only: prerelease versions and unexpected dist-tags
  fail before publication, stable releases always use `latest`, and release
  candidates are distributed as `pnpm pack` tarballs rather than persistent
  registry aliases.
- `assets.clearCache()` now clears only the in-memory cache; purging a
  configured persistent metadata store is the new, explicit
  `assets.clearPersistentCache()`. `venue.close()` accordingly no longer wipes
  the persistent store — entries are content-addressed and immutable, so they
  remain valid across sessions. Call `clearPersistentCache()` at sign-out if
  the store must be emptied.
- Reads that exceed the venue's single-read cap are no longer misreported:
  a truncated `getSession` read assembles the session from per-field reads and
  a truncated `memory.list` pages entries through `slice`, instead of
  reporting "session not found" / an empty memory list.
- Requests without a body no longer send a default `Content-Type` header, so
  browser GETs stay simple CORS requests (no per-call preflight).
- `Ed25519Auth.fromHex` / `hexToPrivateKey` now validate the stored key
  (exactly 64 hex chars, optional `0x` prefix) instead of silently deriving a
  different identity from corrupted input.

## 1.8.0

Compatibility with Covia venue 0.9.0.

### Changed

- **UCAN minting emits the Convex UCAN JWT profile** — `ucv` claim and
  always-present `prf`; `exp` is always present and may be `null` for a
  non-expiring token. Required by venues on Convex 0.8.11+ (#25)

## 1.7.2

Compatibility with Covia venue 0.6.0.

### Fixed

- **`jobs.list()` accepts the 0.6.0 paged envelope** — venue 0.6.0 serves
  `GET /api/v1/jobs` as `{items, total, offset, limit}` (covia #229) instead of
  a flat id array; `list()` now handles both, so one SDK spans the upgrade.
  Every other 0.6.0 surface is already covered: enriched agent listings (#233)
  normalise to objects, `status.stats` carries the new job counts, and skills
  are ordinary assets read through `assets.get()` — no special handling.

## 1.7.1

Job-hygiene and shape-consistency fixes. Reads never mint venue jobs on any
venue ≥ 0.3, in every case previously left to a fallback heuristic.

### Fixed

- **Rootless `workspace.list()` no longer mints a Job** (#16) — an
  empty/undefined path normalises to `"/"` and stays on the job-free
  `GET /api/v1/values/list` (the venue serves the root there); previously
  every root listing ran the invoke-based `covia:list` and persisted a job.
- **Agents 404 latch** — `GET /api/v1/agents/{id}` 404s for a *missing agent*,
  not just a missing route, but any 404 permanently downgraded all later
  `agents.list()`/`info()` calls to the job-minting invoke path (a 3-second
  polling UI produced ~1k persisted jobs/hour after one transient bad agent
  id). Only the bare list route or the distinctive unmapped-endpoint body now
  latches the fallback; per-resource 404s propagate as `NotFoundError`.
- **Agent list entry shape** — the job-free GET returns bare agent-id strings
  while `agent:list` returns `{agentId, status, tasks}` objects; `list()` now
  normalises strings to `{agentId}` so consumers always receive objects
  (`status`/`tasks` are typed optional; venue-side parity tracked in
  covia-ai/covia#233).

### Added

- **Persistent content-addressed asset metadata cache** — an asset id is the
  Convex value hash of its metadata, so id → metadata is immutable;
  `AssetManager` now backs its in-memory cache with a pluggable persistent
  store (localStorage by default in browsers, `setAssetMetadataStore()` for
  custom/Node stores), keyed by normalised bare hash across all ref forms.
  Admission is trust-based until a TS CVM encoder enables hash verification
  (#18, Convex-Dev/convex.ts#1).

## 1.7.0

Job-free adapter and agent reads, 429 backpressure handling with typed
`RateLimitError`, client-side UCAN minting (`grant` / `identityToken` /
`relayDelegation`), `ucan.verify` diagnostic, and connection-level
private-jobs mode via `venue.setPrivate(true)` (covia #192). Targets Covia
venue 0.4.0.

## 1.6.0

First stable release targeting the covia 0.3.0 venue. Several items are
**breaking** — see below. Validated against the released 0.3.0 fleet (job-free
`/api/v1/values/*` reads confirmed live).

### Added

- **`BasicAuth(username, password)`** — HTTP Basic auth provider
  (`Authorization: Basic <base64(username:password)>`, UTF-8), matching the
  Python SDK.
- **Job-free workspace reads** — `venue.workspace` read/list/slice/inspect now
  route through the venue's `GET /api/v1/values/*` API (no Job persisted), with
  new `count` and `aggregate` operations.
- **Pre-0.3 venue fallback** — workspace reads against a venue without the
  `/values` routes transparently fall back to the invoke path (a 404 there can
  only mean the route is missing; an absent path is `200 {exists:false}`). The
  venue is remembered as pre-0.3 after the first probe, so old venues don't pay
  a failed GET per read. Venue-version accommodation lives in the SDK, not in
  application code.
- **`venue.lastKnownStatus`** — `Venue.connect` stashes the `/api/v1/status`
  payload it already fetches (and `status()` refreshes it), so managers can use
  it as a capability hint: a status without a `version` field identifies a
  pre-0.3 venue and workspace reads skip the GET probe entirely. The probe
  remains the authority when no status has been seen (direct construction,
  auth-gated venues).
- **`ucans` threading + DID/path helpers** — managers accept `ucans` for
  capability-gated cross-DID access; `src/did.ts` exposes `Namespace`,
  `isDid`, `didUrl`, `parseDidUrl`, `assetHash`, etc. for building/parsing
  `<DID>/<namespace>/<path>` lattice addresses.

### Changed

- **`KeyPairAuth` renamed to `Ed25519Auth`** (cross-SDK consistency with
  Python). `KeyPairAuth` remains as a deprecated value+type alias, so existing
  `new KeyPairAuth(...)` / `KeyPairAuth.generate()` / `.fromHex()` keep working.
- **`AgentManager.query()` removed — use `info()`.** `info(agentId)` returns
  the venue's lightweight `AgentInfoResult` summary. **Breaking.**
- **`AgentCard` type corrected to the A2A v1.0 wire shape.** The old fields
  (`agentProvider`/`agentCapabilities`/`agentSkills`/`agentInterfaces`/
  `securityScheme`) never matched what the venue serves; replaced with `name`,
  `description`, `version`, `provider`, `capabilities`, `defaultInputModes`,
  `defaultOutputModes`, `skills`, `supportedInterfaces`, `preferredTransport`.
  Verified against a live venue card. **Breaking.**
- **Secret storage unified on `set()`** — `secrets.put()` removed; `set`
  returns a typed result. Workspace result types now target the 0.3.0 venue
  (dropped pre-0.3.0 straddle fields; added the #147 mutation-outcome fields).
  **Breaking.**
- **JWT `aud` bound to the venue's DID**, resolved from the venue's reported
  identity and reused across venues (no longer derived from the connection
  string). `Venue.connect` falls back to the public `did:web` document on an
  auth-gated venue.
- **Type safety** — public inputs are `unknown` (not `any`), operation
  execution is generic (`run<T = unknown>`), and `Asset.run`/`invoke` now
  thread the `options` argument (e.g. UCAN proofs) through to the
  OperationManager. `no-unsafe-*` lint rules are enforced via a type-aware
  ESLint flat config. Tooling and dependencies refreshed for release hygiene.

### Fixed

- **Asset `Operation`/`DataAsset` detection** — checked a phantom
  `metadata.operation` wrapper; the venue returns metadata directly.
- **`Grid.connect` auth caching** — a second connect with different auth no
  longer returns the first venue; the cache is keyed by id *and* auth.
- **Asset caching** — removed the stale module-level `getMetadata` cache;
  binary content uploads are no longer mislabeled `application/json`.

### Removed

- **`AgentManager.query`** — superseded by `info()` (see above).

## 1.6.0-next.0

Prerelease baseline (published to the `next` dist-tag). Prior history is in the
Git log and GitHub releases.
