import { SecretSetResult, SecretExtractResult } from './types';

interface SecretManagerVenue {
  operations: { run(assetId: string, input: any): Promise<any> };
  listSecrets(): Promise<string[]>;
  putSecret(name: string, value: string): Promise<void>;
  deleteSecret(name: string): Promise<void>;
}

export class SecretManager {
  constructor(private venue: SecretManagerVenue) {}

  async set(name: string, value: string): Promise<SecretSetResult> {
    return this.venue.operations.run('secret:set', { name, value });
  }

  /**
   * Extract a secret value by name.
   * NOTE: This operation requires a UCAN capability grant. The backend
   * may reject requests that lack the appropriate capability proof.
   */
  async extract(name: string): Promise<SecretExtractResult> {
    return this.venue.operations.run('secret:extract', { name });
  }

  async list(): Promise<string[]> {
    return this.venue.listSecrets();
  }

  async put(name: string, value: string): Promise<void> {
    return this.venue.putSecret(name, value);
  }

  async delete(name: string): Promise<void> {
    return this.venue.deleteSecret(name);
  }
}
