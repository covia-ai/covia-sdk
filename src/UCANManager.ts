import { UCANAttenuation, UCANIssueResult, OperationRunner } from './types';

interface UCANManagerVenue {
  operations: OperationRunner;
}

export class UCANManager {
  constructor(private venue: UCANManagerVenue) {}

  async issue(aud: string, att: UCANAttenuation[], exp: number): Promise<UCANIssueResult> {
    return this.venue.operations.run<UCANIssueResult>('v/ops/ucan/issue', { aud, att, exp });
  }
}
