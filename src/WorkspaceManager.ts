import { VenueInterface, WorkspaceReadResult, WorkspaceWriteResult, WorkspaceDeleteResult, WorkspaceAppendResult, WorkspaceListResult, WorkspaceSliceResult, FunctionsResult, AdaptersResult } from './types';

export class WorkspaceManager {
  constructor(private venue: VenueInterface) {}

  async read(path: string, maxSize?: number): Promise<WorkspaceReadResult> {
    return this.venue.run('covia:read', { path, maxSize });
  }

  async write(path: string, value: any): Promise<WorkspaceWriteResult> {
    return this.venue.run('covia:write', { path, value });
  }

  async delete(path: string): Promise<WorkspaceDeleteResult> {
    return this.venue.run('covia:delete', { path });
  }

  async append(path: string, value: any): Promise<WorkspaceAppendResult> {
    return this.venue.run('covia:append', { path, value });
  }

  async list(path?: string, limit?: number, offset?: number): Promise<WorkspaceListResult> {
    return this.venue.run('covia:list', { path, limit, offset });
  }

  async slice(path: string, offset?: number, limit?: number): Promise<WorkspaceSliceResult> {
    return this.venue.run('covia:slice', { path, offset, limit });
  }

  async functions(): Promise<FunctionsResult> {
    return this.venue.run('covia:functions', {});
  }

  async describe(name: string): Promise<any> {
    return this.venue.run('covia:describe', { name });
  }

  async adapters(): Promise<AdaptersResult> {
    return this.venue.run('covia:adapters', {});
  }
}
