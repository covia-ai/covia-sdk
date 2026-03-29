import { VenueInterface, UCANAttenuation, UCANIssueResult } from './types';

export class UCANManager {
  constructor(private venue: VenueInterface) {}

  async issue(aud: string, att: UCANAttenuation[], exp: number): Promise<UCANIssueResult> {
    return this.venue.run('ucan:issue', { aud, att, exp });
  }
}
