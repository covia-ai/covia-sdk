/**
 * DID and lattice-path helpers for the Covia grid.
 *
 * Covia addresses its lattice as `<DID>/<namespace>/<path...>`. These helpers
 * build and parse those addresses so callers don't hand-concatenate strings.
 *
 * Which DID belongs in a lattice address:
 * - `w`/`o`/`g`/`j`/`s` are per-user: the `<DID>` is the resource *owner's* DID
 *   (yours is your auth DID, e.g. `Ed25519Auth.getDID()`) — NOT the venue's.
 * - `a` (assets) is content-addressed, and **caller-relative**: a bare hash or
 *   `a/<hash>` names the asset in the requesting caller's own `a/` namespace,
 *   not a global one (covia#502). Name another owner's copy explicitly as
 *   `<ownerDID>/a/<hash>` — the only portable form — and the venue's own
 *   catalog as `<venueDID>/a/<hash>`.
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

/**
 * The base URL a `did:web` DID names, per the W3C did:web rules (#126): the
 * domain may encode a port as `%3A`, and further `:`-separated segments become
 * URL path segments.
 *
 * `didWebToUrl('did:web:host%3A3000:a:b')` → `'https://host:3000/a/b'`
 *
 * Matches the Python SDK's `did_web_to_url`. This is the DID's base URL, not
 * its document URL (`/.well-known/did.json` or `<path>/did.json`).
 *
 * @throws Error if `did` is not a `did:web` DID with a host.
 */
export function didWebToUrl(did: string, opts: { scheme?: 'https' | 'http' } = {}): string {
  const prefix = 'did:web:';
  const rest = did.startsWith(prefix) ? did.slice(prefix.length) : '';
  const [domain, ...path] = rest.split(':');
  if (!domain) throw new Error(`Not a did:web DID: ${JSON.stringify(did)}`);
  const host = domain.replace(/%3A/gi, ':');
  return `${opts.scheme ?? 'https'}://${host}${path.length ? `/${path.join('/')}` : ''}`;
}

/**
 * The `did:web` DID for an HTTP(S) URL; the inverse of {@link didWebToUrl}
 * (#126). A port is encoded as `%3A` and path segments are joined with `:`.
 * A trailing slash is ignored, and a bare host (no scheme) is accepted.
 *
 * `urlToDidWeb('https://host:3000/a/b')` → `'did:web:host%3A3000:a:b'`
 *
 * Matches the Python SDK's `url_to_did_web`.
 *
 * @throws Error for a non-HTTP(S) scheme, or a URL with no host.
 */
export function urlToDidWeb(url: string): string {
  const schemeEnd = url.indexOf('://');
  if (schemeEnd >= 0 && !/^https?$/i.test(url.slice(0, schemeEnd))) {
    throw new Error(`Not an HTTP(S) URL: ${JSON.stringify(url)}`);
  }
  const after = (schemeEnd >= 0 ? url.slice(schemeEnd + 3) : url).replace(/\/+$/, '');
  const slash = after.indexOf('/');
  const host = slash >= 0 ? after.slice(0, slash) : after;
  const path = slash >= 0 ? after.slice(slash + 1) : '';
  if (!host) throw new Error(`URL has no host: ${JSON.stringify(url)}`);
  return `did:web:${host.replace(/:/g, '%3A')}${path ? `:${path.split('/').join(':')}` : ''}`;
}
