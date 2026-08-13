import { Auth } from "./Credentials";
import { Venue } from "./Venue";

interface ConnectionEntry {
  promise: Promise<Venue>;
  venue?: Venue;
}

// Auth is identity-bearing state, so cache by object identity. Keep anonymous
// connections separately because WeakMap cannot use undefined as a key.
const anonymousConnections = new Map<string, ConnectionEntry>();
const authenticatedConnections = new WeakMap<Auth, Map<string, ConnectionEntry>>();

function connectionsFor(auth?: Auth): Map<string, ConnectionEntry> {
  if (!auth) return anonymousConnections;
  let connections = authenticatedConnections.get(auth);
  if (!connections) {
    connections = new Map();
    authenticatedConnections.set(auth, connections);
  }
  return connections;
}

function normaliseKey(venueId: string): string {
  return venueId.replace(/\/+$/, '');
}

function removeEntry(cache: Map<string, ConnectionEntry>, entry: ConnectionEntry): void {
  for (const [key, candidate] of cache) {
    if (candidate === entry) cache.delete(key);
  }
}

export class Grid {

   /**
   * Static method to connect to a venue
   * @param venueId - Can be a HTTP base URL, DNS name, or existing Venue instance
   * @param auth - Optional authentication provider (BearerAuth, BasicAuth, Ed25519Auth, etc.)
   * @returns {Promise<Venue>} A new Venue instance configured appropriately
   */
  static async connect(venueId:string, auth?: Auth): Promise<Venue> {
    const cache = connectionsFor(auth);
    const key = normaliseKey(venueId);
    const cached = cache.get(key);
    if (cached) {
      if (!cached.venue?.closed) return cached.promise;
      removeEntry(cache, cached);
    }

    const promise = Venue.connect(venueId, auth)
      .then((venue) => {
        entry.venue = venue;
        // Learn canonical aliases after validation, so connecting by URL and
        // later by the reported DID reuses the same authenticated handle.
        cache.set(normaliseKey(venue.baseUrl), entry);
        cache.set(normaliseKey(venue.venueId), entry);
        return venue;
      })
      .catch((error: unknown) => {
        removeEntry(cache, entry);
        throw error;
      });
    const entry: ConnectionEntry = { promise };
    cache.set(key, entry);
    return entry.promise;
  }
}
