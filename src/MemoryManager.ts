import {
  CoviaError,
  MemoryChange,
  MemoryEntry,
  OperationRunner,
  WorkspaceReadResult,
} from './types';

const DEFAULT_MEMORY_PATH = 'w/memory';

interface MemoryManagerVenue {
  workspace: {
    read(path: string, maxSize?: number): Promise<WorkspaceReadResult>;
  };
  operations: OperationRunner;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function memoryChange(value: unknown): MemoryChange {
  const result = record(value);
  if (typeof result?.n !== 'number' || typeof result.count !== 'number') {
    throw new CoviaError('Venue returned an invalid memory mutation result');
  }
  return { number: result.n, count: result.count };
}

/** Structured access to the venue's conventional per-user memory list. */
export class MemoryManager {
  constructor(private venue: MemoryManagerVenue) {}

  /**
   * Read memory directly from the workspace Values surface. This is job-free;
   * unlike `v/ops/memory {command:'recall'}`, it returns structured entries
   * rather than an LLM-oriented numbered text block.
   */
  async list(path = DEFAULT_MEMORY_PATH): Promise<MemoryEntry[]> {
    const result = await this.venue.workspace.read(path);
    if (!result.exists || result.value === undefined || result.value === null) {
      return [];
    }
    if (!Array.isArray(result.value)) {
      throw new CoviaError(`Memory at ${path} is not a flat list`);
    }
    const entries = result.value.map((value, index): MemoryEntry => {
      const item = record(value);
      const text = typeof value === 'string'
        ? value
        : (typeof item?.text === 'string' ? item.text : undefined);
      if (text === undefined) {
        throw new CoviaError(`Memory entry ${index + 1} at ${path} has no text`);
      }
      return {
        number: index + 1,
        text,
        createdAt: typeof item?.ts === 'number' ? item.ts : undefined,
        updatedAt: typeof item?.updated === 'number' ? item.updated : undefined,
      };
    });
    return entries;
  }

  /** Append a memory entry. Mutations intentionally remain audited Jobs. */
  async remember(text: string, path = DEFAULT_MEMORY_PATH): Promise<MemoryChange> {
    const result = await this.venue.operations.run('v/ops/memory', {
      command: 'remember', text, path,
    });
    return memoryChange(result);
  }

  /** Replace a 1-based memory entry. Mutations intentionally remain audited Jobs. */
  async update(number: number, text: string, path = DEFAULT_MEMORY_PATH): Promise<MemoryChange> {
    const result = await this.venue.operations.run('v/ops/memory', {
      command: 'update', n: number, text, path,
    });
    return memoryChange(result);
  }

  /** Remove a 1-based memory entry. Mutations intentionally remain audited Jobs. */
  async forget(number: number, path = DEFAULT_MEMORY_PATH): Promise<MemoryChange> {
    const result = await this.venue.operations.run('v/ops/memory', {
      command: 'forget', n: number, path,
    });
    return memoryChange(result);
  }
}
