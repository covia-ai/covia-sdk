/**
 * DID and lattice-path helpers for the Covia grid.
 *
 * Covia addresses its lattice as `<DID>/<namespace>/<path...>`. These helpers
 * build and parse those addresses so callers don't hand-concatenate strings.
 *
 * Which DID belongs in a lattice address:
 * - `w`/`o`/`g`/`j`/`s` are per-user: the `<DID>` is the resource *owner's* DID
 *   (yours is your auth DID, e.g. `Ed25519Auth.getDID()`) — NOT the venue's.
 * - `a` (assets) is venue-global and content-addressed.
 * - A namespace-relative path (no `<DID>`) resolves to the authenticated caller.
 */

/** Lattice namespace identifiers. */
export const Namespace = {
  ASSET: 'a',
  OPERATION: 'o',
  JOB: 'j',
  AGENT: 'g',
  WORKSPACE: 'w',
  SECRET: 's',
  // Virtual namespaces — resolved against the active request context:
  AGENT_SCRATCH: 'n',
  SESSION_SCRATCH: 'c',
  JOB_SCRATCH: 't',
  VENUE: 'v',
} as const;

/** A parsed lattice address. */
export interface DIDURL {
  did: string | null;
  namespace: string | null;
  path: string;
}

/** True if `value` is a bare DID (`did:<method>:<id>`), not a DID URL with a path. */
export function isDid(value: string): boolean {
  if (value.includes('/')) return false;
  const parts = value.split(':');
  return parts.length >= 3 && parts[0] === 'did' && parts.slice(1).every((p) => p.length > 0);
}

/** The DID method (e.g. `'key'`, `'web'`), or null if `value` is not a DID. */
export function didMethod(value: string): string | null {
  return isDid(value) ? value.split(':')[1] : null;
}

/**
 * Split a lattice address into its DID, namespace, and path. Handles bare DIDs,
 * namespace-relative paths (`w/foo` or `/w/foo`), and fully-qualified DID URLs
 * (`did:key:z.../w/foo`); did:web `:` path separators inside the DID are kept.
 */
export function parseDidUrl(value: string): DIDURL {
  let did: string | null = null;
  let rest: string;
  if (value.startsWith('did:')) {
    const slash = value.indexOf('/');
    if (slash === -1) return { did: value, namespace: null, path: '' };
    did = value.slice(0, slash);
    rest = value.slice(slash + 1);
  } else {
    rest = value.replace(/^\/+/, ''); // tolerate a leading slash on relative paths
  }
  if (rest === '') return { did, namespace: null, path: '' };
  const slash = rest.indexOf('/');
  if (slash === -1) return { did, namespace: rest, path: '' };
  return { did, namespace: rest.slice(0, slash), path: rest.slice(slash + 1) };
}

/**
 * Build a lattice address `<did>/<namespace>/<segments...>`. Pass `did = null`
 * for a namespace-relative path. Stray surrounding slashes on segments are
 * stripped and empty segments dropped.
 *
 * Remember the ownership rules above: for `w`/`o`/`g`/`j`/`s` the `did` is the
 * resource owner's DID, not the venue's.
 */
export function didUrl(did: string | null, namespace: string, ...segments: string[]): string {
  const tail = segments
    .filter((s) => s !== '')
    .map((s) => s.replace(/^\/+|\/+$/g, ''))
    .join('/');
  const base = tail ? `${namespace}/${tail}` : namespace;
  return did ? `${did}/${base}` : base;
}

/**
 * The content hash `ref` pins to, or null if it isn't content-addressed.
 * Recognises a bare hex hash, `a/<hash>`, and `<DID>/a/<hash>` — the forms that
 * name a specific immutable asset. Mutable lattice paths (`w/…`, `o/…`) return
 * null: they resolve server-side, so there's no client-side hash and they must
 * not be treated as immutable (e.g. cached).
 */
export function assetHash(ref: string): string | null {
  if (!ref.includes('/')) {
    const s = ref.startsWith('0x') ? ref.slice(2) : ref;
    return s.length > 0 && /^[0-9a-fA-F]+$/.test(s) ? ref : null;
  }
  const parsed = parseDidUrl(ref);
  if (parsed.namespace === Namespace.ASSET && parsed.path && !parsed.path.includes('/')) {
    return parsed.path;
  }
  return null;
}
