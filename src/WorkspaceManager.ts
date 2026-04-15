import { WorkspaceReadResult, WorkspaceWriteResult, WorkspaceDeleteResult, WorkspaceAppendResult, WorkspaceListResult, WorkspaceSliceResult } from './types';

interface WorkspaceManagerVenue {
  operations: { run(assetId: string, input: any): Promise<any> };
}

export class WorkspaceManager {
  constructor(private venue: WorkspaceManagerVenue) {}

  async read(path: string, maxSize?: number): Promise<WorkspaceReadResult> {
    return this.venue.operations.run('v/ops/covia/read', { path, maxSize });
  }

  async write(path: string, value: any): Promise<WorkspaceWriteResult> {
    return this.venue.operations.run('v/ops/covia/write', { path, value });
  }

  async delete(path: string): Promise<WorkspaceDeleteResult> {
    return this.venue.operations.run('v/ops/covia/delete', { path });
  }

  async append(path: string, value: any): Promise<WorkspaceAppendResult> {
    return this.venue.operations.run('v/ops/covia/append', { path, value });
  }

  async list(path?: string, limit?: number, offset?: number): Promise<WorkspaceListResult> {
    return this.venue.operations.run('v/ops/covia/list', { path, limit, offset });
  }

  async slice(path: string, offset?: number, limit?: number): Promise<WorkspaceSliceResult> {
    return this.venue.operations.run('v/ops/covia/slice', { path, offset, limit });
  }
}
