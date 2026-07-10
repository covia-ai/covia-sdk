import { UCANAttenuation, UCANIssueResult, UCANVerifyResult, OperationRunner } from './types';

interface UCANManagerVenue {
  operations: OperationRunner;
}

export class UCANManager {
  constructor(private venue: UCANManagerVenue) {}

  async issue(aud: string, att: UCANAttenuation[], exp: number): Promise<UCANIssueResult> {
    return this.venue.operations.run<UCANIssueResult>('v/ops/ucan/issue', { aud, att, exp });
  }

  /**
   * Verify a UCAN against the venue's trust policy and get the verdict
   * explained — validity with a diagnosable reason, chain depth and root
   * issuer, per-capability root-authority (owner / venue / refused), and,
   * when `check` is supplied, whether the token would authorise that request
   * here. The diagnostic counterpart to an enforcement "Access denied".
   */
  async verify(token: string | object, check?: { with?: string; can?: string; aud?: string }): Promise<UCANVerifyResult> {
    return this.venue.operations.run<UCANVerifyResult>('v/ops/ucan/verify', { token, ...check });
  }
}
