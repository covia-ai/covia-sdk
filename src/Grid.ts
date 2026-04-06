import { Auth } from "./Credentials";
import { Venue } from "./Venue";

const cache = new Map<string, Venue>();

export class Grid {

   /**
   * Static method to connect to a venue
   * @param venueId - Can be a HTTP base URL, DNS name, or existing Venue instance
   * @param auth - Optional authentication provider (BearerAuth, KeyPairAuth, etc.)
   * @returns {Promise<Venue>} A new Venue instance configured appropriately
   */
  static async connect(venueId:string, auth?: Auth): Promise<Venue> {
    if (cache.has(venueId))
        return Promise.resolve(cache.get(venueId)!);
    const connectedVenue = await Venue.connect(venueId, auth);
    cache.set(venueId, connectedVenue);
    return Promise.resolve(connectedVenue);
  }
}
