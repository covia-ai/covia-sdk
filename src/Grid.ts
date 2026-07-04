import { Auth } from "./Credentials";
import { Venue } from "./Venue";

// Reuse a connected Venue for repeated Grid.connect(id, sameAuth) calls. Keyed
// by the auth reference as well as the id: a call with a different (or absent)
// auth must NEVER receive a Venue bound to someone else's credentials — that
// would silently run one caller's requests under another's identity.
const cache = new Map<string, { auth?: Auth; venue: Venue }>();

export class Grid {

   /**
   * Static method to connect to a venue
   * @param venueId - Can be a HTTP base URL, DNS name, or existing Venue instance
   * @param auth - Optional authentication provider (BearerAuth, KeyPairAuth, etc.)
   * @returns {Promise<Venue>} A new Venue instance configured appropriately
   */
  static async connect(venueId:string, auth?: Auth): Promise<Venue> {
    const cached = cache.get(venueId);
    if (cached && cached.auth === auth)
        return cached.venue;
    const connectedVenue = await Venue.connect(venueId, auth);
    cache.set(venueId, { auth, venue: connectedVenue });
    return connectedVenue;
  }
}
