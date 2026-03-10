import { Operation } from '../Operation';
import { DataAsset } from '../DataAsset';
import { RunStatus, VenueInterface } from '../types';
import { Job } from '../Job';

function createMockVenue(overrides: Partial<VenueInterface> = {}): VenueInterface {
  return {
    baseUrl: 'https://venue.example.com',
    venueId: 'did:web:venue.example.com',
    metadata: { name: 'Test Venue' },
    cancelJob: jest.fn(),
    deleteJob: jest.fn(),
    status: jest.fn(),
    getJob: jest.fn(),
    listJobs: jest.fn(),
    getAsset: jest.fn(),
    register: jest.fn(),
    listAssets: jest.fn().mockResolvedValue({ items: [], total: 0, offset: 0, limit: 100 }),
    getMetadata: jest.fn().mockResolvedValue({ name: 'Test Asset', type: 'data' }),
    readStream: jest.fn(),
    putContent: jest.fn().mockResolvedValue(null),
    getContent: jest.fn().mockResolvedValue(null),
    run: jest.fn().mockResolvedValue({ result: 42 }),
    invoke: jest.fn().mockResolvedValue(new Job('j1', {} as VenueInterface, { status: RunStatus.COMPLETE })),
    listOperations: jest.fn().mockResolvedValue([]),
    getOperation: jest.fn().mockResolvedValue({ name: 'test:echo', asset: 'op-1' }),
    didDocument: jest.fn().mockResolvedValue({ id: 'did:web:venue.example.com' }),
    mcpDiscovery: jest.fn().mockResolvedValue({}),
    agentCard: jest.fn().mockResolvedValue({}),
    streamJobEvents: jest.fn(),
    close: jest.fn(),
    ...overrides,
  };
}

describe('Asset (via Operation subclass)', () => {
  it('stores id, venue, and metadata', () => {
    const venue = createMockVenue();
    const meta = { name: 'My Op', operation: { adapter: 'test' } };
    const op = new Operation('op-1', venue, meta);

    expect(op.id).toBe('op-1');
    expect(op.venue).toBe(venue);
    expect(op.metadata).toEqual(meta);
  });

  it('defaults metadata to empty object', () => {
    const venue = createMockVenue();
    const op = new Operation('op-2', venue);
    expect(op.metadata).toEqual({});
  });

  describe('getContentURL', () => {
    it('returns correct URL', () => {
      const venue = createMockVenue();
      const asset = new DataAsset('asset-abc', venue);
      expect(asset.getContentURL()).toBe(
        'https://venue.example.com/api/v1/assets/asset-abc/content'
      );
    });
  });

  describe('putContent', () => {
    it('delegates to venue.putContent with asset id', async () => {
      const venue = createMockVenue();
      const asset = new DataAsset('asset-1', venue);
      const content = new Blob(['data']);

      await asset.putContent(content);
      expect(venue.putContent).toHaveBeenCalledWith('asset-1', content);
    });
  });

  describe('getContent', () => {
    it('delegates to venue.getContent with asset id', async () => {
      const venue = createMockVenue();
      const asset = new DataAsset('asset-2', venue);

      await asset.getContent();
      expect(venue.getContent).toHaveBeenCalledWith('asset-2');
    });
  });

  describe('run', () => {
    it('delegates to venue.run with asset id and input', async () => {
      const venue = createMockVenue();
      const op = new Operation('op-3', venue);
      const input = { param: 'value' };

      const result = await op.run(input);
      expect(venue.run).toHaveBeenCalledWith('op-3', input);
      expect(result).toEqual({ result: 42 });
    });
  });

  describe('invoke', () => {
    it('delegates to venue.invoke with asset id and input', async () => {
      const venue = createMockVenue();
      const op = new Operation('op-4', venue);

      const result = await op.invoke({ x: 1 });
      expect(venue.invoke).toHaveBeenCalledWith('op-4', { x: 1 });
      expect(result).toBeInstanceOf(Job);
    });
  });

  describe('getMetadata', () => {
    it('fetches metadata from venue on first call', async () => {
      const venue = createMockVenue();
      const asset = new DataAsset('meta-1', venue);

      const meta = await asset.getMetadata();
      expect(venue.getMetadata).toHaveBeenCalledWith('meta-1');
      expect(meta).toEqual({ name: 'Test Asset', type: 'data' });
    });
  });
});

describe('Asset (via DataAsset subclass)', () => {
  it('can be instantiated', () => {
    const venue = createMockVenue();
    const da = new DataAsset('da-1', venue, { name: 'Data' });
    expect(da.id).toBe('da-1');
    expect(da.metadata.name).toBe('Data');
  });
});

describe('Operation subclass', () => {
  it('can be instantiated with operation metadata', () => {
    const venue = createMockVenue();
    const op = new Operation('op-x', venue, {
      name: 'Test Op',
      operation: { adapter: 'python', input: { schema: {} } },
    });
    expect(op.id).toBe('op-x');
    expect(op.metadata.operation?.adapter).toBe('python');
  });
});
