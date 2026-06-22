import { WorkspaceReadResult, WorkspaceWriteResult, WorkspaceDeleteResult, WorkspaceAppendResult, WorkspaceListResult, WorkspaceSliceResult, WorkspaceCopyResult, WorkspaceInspectResult, InvokeOptions } from './types';

interface WorkspaceManagerVenue {
  operations: { run(assetId: string, input: any, options?: InvokeOptions): Promise<any> };
}

/**
 * Workspace (`v/ops/covia/*`) lattice operations.
 *
 * Paths resolve against the caller's own DID unless fully qualified
 * (`<DID>/w/...`). Reading or writing **another DID's** namespace is
 * capability-gated — build the path with the DID helpers and pass the proof
 * token(s) as the trailing `ucans` argument.
 */
export class WorkspaceManager {
  constructor(private venue: WorkspaceManagerVenue) {}

  async read(path: string, maxSize?: number, ucans?: string[]): Promise<WorkspaceReadResult> {
    return this.venue.operations.run('v/ops/covia/read', { path, maxSize }, { ucans });
  }

  async write(path: string, value: any, ucans?: string[]): Promise<WorkspaceWriteResult> {
    return this.venue.operations.run('v/ops/covia/write', { path, value }, { ucans });
  }

  async delete(path: string, ucans?: string[]): Promise<WorkspaceDeleteResult> {
    return this.venue.operations.run('v/ops/covia/delete', { path }, { ucans });
  }

  async append(path: string, value: any, ucans?: string[]): Promise<WorkspaceAppendResult> {
    return this.venue.operations.run('v/ops/covia/append', { path, value }, { ucans });
  }

  async list(path?: string, limit?: number, offset?: number, ucans?: string[]): Promise<WorkspaceListResult> {
    return this.venue.operations.run('v/ops/covia/list', { path, limit, offset }, { ucans });
  }

  async slice(path: string, offset?: number, limit?: number, ucans?: string[]): Promise<WorkspaceSliceResult> {
    return this.venue.operations.run('v/ops/covia/slice', { path, offset, limit }, { ucans });
  }

  async copy(from: string, to: string, ucans?: string[]): Promise<WorkspaceCopyResult> {
    return this.venue.operations.run('v/ops/covia/copy', { from, to }, { ucans });
  }

  async inspect(paths: string | string[], budget?: number, compact?: boolean, ucans?: string[]): Promise<WorkspaceInspectResult> {
    return this.venue.operations.run('v/ops/covia/inspect', { paths, budget, compact }, { ucans });
  }
}
