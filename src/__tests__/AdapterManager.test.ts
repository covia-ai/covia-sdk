import { AdapterManager } from '../AdapterManager';

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

function createMockVenue() {
  return {
    baseUrl: 'https://venue.example',
    venueId: 'did:key:zVenue',
    auth: { apply: jest.fn((h: Record<string, string>) => { h['Authorization'] = 'Bearer tok'; }) },
  };
}

function okJson(data: any) {
  mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(data) });
}

/** The URL of the Nth fetch call. */
function fetchUrl(n = 0): string {
  return String(mockFetch.mock.calls[n][0]);
}

describe('AdapterManager', () => {
  let venue: ReturnType<typeof createMockVenue>;
  let adapters: AdapterManager;

  beforeEach(() => {
    mockFetch.mockReset();
    venue = createMockVenue();
    adapters = new AdapterManager(venue);
  });

  it('list GETs /values/slice on v/info/adapters with a generous limit and binds auth', async () => {
    okJson({
      exists: true,
      count: 2,
      values: [
        { key: 'mcp', value: { name: 'mcp', description: 'MCP tools', operations: ['v/ops/mcp/toolList', 'v/ops/mcp/toolCall'] } },
        { key: 'test', value: { name: 'test', description: 'Testing', operations: ['v/ops/test/echo'] } },
      ],
    });

    const result = await adapters.list();

    const u = new URL(fetchUrl());
    expect(u.pathname).toBe('/api/v1/values/slice');
    expect(u.searchParams.get('path')).toBe('v/info/adapters');
    expect(u.searchParams.get('limit')).toBe('1000');
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
    expect(result).toEqual([
      { name: 'mcp', description: 'MCP tools', operations: ['v/ops/mcp/toolList', 'v/ops/mcp/toolCall'] },
      { name: 'test', description: 'Testing', operations: ['v/ops/test/echo'] },
    ]);
  });

  it('list returns an empty array when the path does not exist', async () => {
    okJson({ exists: false });

    const result = await adapters.list();
    expect(result).toEqual([]);
  });

  it('list includes adapters with zero operations', async () => {
    okJson({
      exists: true,
      values: [{ key: 'idle', value: { name: 'idle', description: 'No catalog ops', operations: [] } }],
    });

    const result = await adapters.list();
    expect(result).toEqual([{ name: 'idle', description: 'No catalog ops', operations: [] }]);
  });

  it('get GETs /values/read on v/info/adapters/<name>', async () => {
    okJson({
      exists: true,
      value: { name: 'mcp', description: 'MCP tools', operations: ['v/ops/mcp/toolList'] },
    });

    const result = await adapters.get('mcp');

    const u = new URL(fetchUrl());
    expect(u.pathname).toBe('/api/v1/values/read');
    expect(u.searchParams.get('path')).toBe('v/info/adapters/mcp');
    expect(result).toEqual({ name: 'mcp', description: 'MCP tools', operations: ['v/ops/mcp/toolList'] });
  });

  it('get returns null for an unregistered adapter', async () => {
    okJson({ exists: false });

    const result = await adapters.get('nonexistent');
    expect(result).toBeNull();
  });

  it('get URL-encodes the adapter name', async () => {
    okJson({ exists: false });

    await adapters.get('weird/name');
    const u = new URL(fetchUrl());
    expect(u.pathname).toBe('/api/v1/values/read');
    expect(u.searchParams.get('path')).toBe('v/info/adapters/weird%2Fname');
  });
});
