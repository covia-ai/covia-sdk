import { SecretSetResult, SecretExtractResult, OperationRunner } from './types';

interface SecretManagerVenue {
  operations: OperationRunner;
  listSecrets(): Promise<string[]>;
  deleteSecret(name: string): Promise<void>;
}

export class SecretManager {
  constructor(private venue: SecretManagerVenue) {}

  async set(name: string, value: string): Promise<SecretSetResult> {
    return this.venue.operations.run<SecretSetResult>('v/ops/secret/set', { name, value });
  }

  /**
   * Extract a secret value by name.
   * Requires a UCAN capability grant — pass the proof token(s) as `ucans`.
   * Extracting another DID's secret needs a grant on that DID's `/s/<name>`.
   */
  async extract(name: string, ucans?: string[]): Promise<SecretExtractResult> {
    return this.venue.operations.run<SecretExtractResult>('v/ops/secret/extract', { name }, { ucans });
  }

  async list(): Promise<string[]> {
    return this.venue.listSecrets();
  }

  async delete(name: string): Promise<void> {
    return this.venue.deleteSecret(name);
  }
}
