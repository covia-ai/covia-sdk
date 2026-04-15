import { UCANAttenuation, UCANIssueResult } from './types';

interface UCANManagerVenue {
  operations: { run(assetId: string, input: any): Promise<any> };
}

export class UCANManager {
  constructor(private venue: UCANManagerVenue) {}

  async issue(aud: string, att: UCANAttenuation[], exp: number): Promise<UCANIssueResult> {
    return this.venue.operations.run('v/ops/ucan/issue', { aud, att, exp });
  }
}
