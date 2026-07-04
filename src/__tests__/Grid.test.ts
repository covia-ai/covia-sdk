import { Grid } from '../Grid';
import { Venue } from '../Venue';

jest.mock('../Venue', () => {
  const mockVenue = {
    baseUrl: 'https://example.com',
    venueId: 'did:web:example.com',
    metadata: { name: 'Test' },
  };
  return {
    Venue: {
      connect: jest.fn().mockResolvedValue(mockVenue),
    },
  };
});

describe('Grid', () => {
  beforeEach(() => {
    // Clear the Grid cache between tests by re-requiring
    // Since the cache is module-level, we reset mocks instead
    (Venue.connect as jest.Mock).mockClear();
  });

  it('connect delegates to Venue.connect', async () => {
    const venue = await Grid.connect('https://new-venue.example.com');
    expect(Venue.connect).toHaveBeenCalledWith('https://new-venue.example.com', undefined);
    expect(venue.venueId).toBe('did:web:example.com');
  });

  it('connect passes auth to Venue.connect', async () => {
    const { BearerAuth } = jest.requireActual('../Credentials');
    const auth = new BearerAuth('my-token');
    await Grid.connect('https://auth-venue.example.com', auth);
    expect(Venue.connect).toHaveBeenCalledWith('https://auth-venue.example.com', auth);
  });

  it('returns cached venue on second call with same ID and same auth', async () => {
    const venueId = 'https://cached-venue.example.com';
    const first = await Grid.connect(venueId);
    const second = await Grid.connect(venueId);

    // Venue.connect should only be called once for the same ID + auth
    expect(Venue.connect).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('does NOT reuse a cached venue when a different auth is supplied', async () => {
    // Regression: the cache used to key on the id alone, so an anonymous
    // connect followed by an authenticated one silently returned the
    // anonymous venue — running authenticated requests unauthenticated.
    const { BearerAuth } = jest.requireActual('../Credentials');
    const venueId = 'https://reauth-venue.example.com';
    await Grid.connect(venueId); // anonymous
    await Grid.connect(venueId, new BearerAuth('token')); // authenticated
    expect(Venue.connect).toHaveBeenCalledTimes(2);
  });
});
