import { OperationInfo, InvokeOptions, JobMetadata, VenueInterface } from './types';
import { fetchWithError } from './Utils';
import { Job } from './Job';

interface OperationManagerVenue {
  baseUrl: string;
  venueId: string;
  auth: { apply(headers: Record<string, string>, audience?: string): void };
}

export class OperationManager {
  constructor(private venue: OperationManagerVenue) {}

  /**
   * List all named operations available on this venue
   */
  async list(): Promise<OperationInfo[]> {
    return fetchWithError<OperationInfo[]>(`${this.venue.baseUrl}/api/v1/operations`);
  }

  /**
   * Get details of a named operation
   * @param name - Operation name (e.g., "v/ops/schema/infer")
   */
  async get(name: string): Promise<OperationInfo> {
    return fetchWithError<OperationInfo>(`${this.venue.baseUrl}/api/v1/operations/${name}`);
  }

  /**
   * Execute an operation and wait for the result
   * @param assetId - Operation asset ID or named operation
   * @param input - Operation input parameters
   * @param options - Invoke options (e.g., ucans)
   */
  async run<T = unknown>(assetId: string, input?: unknown, options?: InvokeOptions): Promise<T> {
    const job = await this.invoke(assetId, input, options);
    return (await job.result()) as T;
  }

  /**
   * Execute an operation and return a Job for tracking
   * @param assetId - Operation asset ID or named operation
   * @param input - Operation input parameters
   * @param options - Invoke options (e.g., ucans)
   */
  async invoke(assetId: string, input?: unknown, options?: InvokeOptions): Promise<Job> {
    const payload: Record<string, unknown> = {
      operation: assetId,
      input: input
    };
    if (options?.ucans) {
      payload.ucans = options.ucans;
    }
    const response = await fetchWithError<JobMetadata>(`${this.venue.baseUrl}/api/v1/invoke`, {
      method: 'POST',
      headers: this._buildHeaders(),
      body: JSON.stringify(payload),
    });
    return new Job(response.id ?? '', this.venue as unknown as VenueInterface, response);
  }

  private _buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    this.venue.auth.apply(headers, this.venue.venueId);
    return headers;
  }
}
