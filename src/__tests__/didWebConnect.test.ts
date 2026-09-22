// Connecting by did:web (covia-sdk#62). The venue reports its canonical
// did:key at /api/v1/status; the did:web document is how that key is
// discovered and vouched for. These tests pin the relationship between the
// two, which the did:web path previously got backwards.

const KEY = 'z6MkqBTxiqjs9eNhvS9qY8B3HhgnYfKgAYqPy8X3MDqUJnmT';
const DID_KEY = `did:key:${KEY}`;
const DID_WEB = 'did:web:venue-3.covia.ai';
const BASE = 'https://venue-3.covia.ai';

/** A venue's did:web document, as covia actually serves it. */
function didDocument(overrides: Record<string, unknown> = {}) {
  return {
    '@context': 'https://www.w3.org/ns/did/v1',
    id: DID_WEB,
    service: [{ type: 'Covia.API.v1', serviceEndpoint: `${BASE}/api/v1` }],
    verificationMethod: [{
      id: `${DID_WEB}#${KEY}`,
      type: 'Multikey',
      controller: DID_WEB,
      publicKeyMultibase: KEY,
    }],
    alsoKnownAs: [DID_KEY],
    ...overrides,
  };
}

let resolvedDocument: Record<string, unknown> | null = didDocument();
const resolve = jest.fn(async (_did: string) => ({ didDocument: resolvedDocument }));

jest.mock('did-resolver', () => ({
  Resolver: class { resolve = (did: string) => resolve(did); },
}));
jest.mock('web-did-resolver', () => ({ getResolver: () => ({}) }));

const mockFetch = jest.fn();
global.fetch = mockFetch;

/** The venue's own answer about who it is. */
function statusReporting(did: string) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ did, name: 'Covia Venue (EC2)', version: '0.9.8' }),
  };
}

import { Venue } from '../Venue';
import { VenueIdentityChangedError } from '../types';

beforeEach(() => {
  jest.clearAllMocks();
  resolvedDocument = didDocument();
});

describe('Venue.connect by did:web', () => {
  it('connects, and adopts the canonical did:key as the venue id', async () => {
    mockFetch.mockResolvedValue(statusReporting(DID_KEY));

    const venue = await Venue.connect(DID_WEB);

    expect(venue.venueId).toBe(DID_KEY);      // not the did:web it was asked by
    expect(venue.baseUrl).toBe(BASE);
    expect(resolve).toHaveBeenCalledWith(DID_WEB);
  });

  // The bug: expectedDid was the did:web string, compared against a did:key,
  // so a healthy venue was rejected as having changed identity.
  it('does not reject the venue for reporting its did:key', async () => {
    mockFetch.mockResolvedValue(statusReporting(DID_KEY));
    await expect(Venue.connect(DID_WEB)).resolves.toBeInstanceOf(Venue);
  });

  it('still rejects a venue whose key the document does not vouch for', async () => {
    mockFetch.mockResolvedValue(statusReporting('did:key:z6MkImposterImposterImposterImposter'));

    await expect(Venue.connect(DID_WEB)).rejects.toThrow(VenueIdentityChangedError);
  });

  it("names the document's key as the expectation when it rejects", async () => {
    mockFetch.mockResolvedValue(statusReporting('did:key:z6MkImposter'));

    expect.assertions(2);
    try {
      await Venue.connect(DID_WEB);
    } catch (e) {
      expect((e as Error).message).toContain(DID_KEY);       // what the document vouched for
      expect((e as Error).message).toContain('did:key:z6MkImposter'); // what answered
    }
  });

  // alsoKnownAs is the document's explicit statement of identity; a document
  // without it still carries the key in its verification methods.
  it('falls back to a verificationMethod key when alsoKnownAs is absent', async () => {
    resolvedDocument = didDocument({ alsoKnownAs: undefined });
    mockFetch.mockResolvedValue(statusReporting(DID_KEY));

    const venue = await Venue.connect(DID_WEB);
    expect(venue.venueId).toBe(DID_KEY);
  });

  it('rejects a mismatch found via the verificationMethod fallback', async () => {
    resolvedDocument = didDocument({ alsoKnownAs: undefined });
    mockFetch.mockResolvedValue(statusReporting('did:key:z6MkSomethingElse'));

    await expect(Venue.connect(DID_WEB)).rejects.toThrow(VenueIdentityChangedError);
  });

  // Nothing to pin against: the https-fetched, domain-controlled document is
  // then the only trust anchor, and it is the same document that chose the
  // endpoint. Connecting is correct; refusing would break such venues.
  it('connects without pinning when the document vouches for no key', async () => {
    resolvedDocument = didDocument({ alsoKnownAs: undefined, verificationMethod: undefined });
    mockFetch.mockResolvedValue(statusReporting(DID_KEY));

    const venue = await Venue.connect(DID_WEB);
    expect(venue.venueId).toBe(DID_KEY);
  });

  // With no key vouched for, a reported did:web is still comparable to the one
  // asked for — and a mismatch there is a real impersonation signal, so the
  // like-for-like check survives the #62 fix.
  it('still rejects a keyless document whose endpoint claims another did:web', async () => {
    resolvedDocument = didDocument({ alsoKnownAs: undefined, verificationMethod: undefined });
    mockFetch.mockResolvedValue(statusReporting('did:web:impostor.example.com'));

    await expect(Venue.connect(DID_WEB)).rejects.toThrow(VenueIdentityChangedError);
  });

  it('prefers alsoKnownAs over a disagreeing verificationMethod', async () => {
    resolvedDocument = didDocument({
      verificationMethod: [{
        id: `${DID_WEB}#other`, type: 'Multikey', controller: DID_WEB,
        publicKeyMultibase: 'z6MkStaleRotatedKey',
      }],
    });
    mockFetch.mockResolvedValue(statusReporting(DID_KEY));

    await expect(Venue.connect(DID_WEB)).resolves.toBeInstanceOf(Venue);
  });

  it('fails when the document has no Covia.API.v1 endpoint', async () => {
    resolvedDocument = didDocument({ service: [] });

    await expect(Venue.connect(DID_WEB)).rejects.toThrow(/No \(string\) endpoint/);
  });

  it('fails when the DID does not resolve at all', async () => {
    resolvedDocument = null;

    await expect(Venue.connect(DID_WEB)).rejects.toThrow(/Invalid DID document/);
  });
});
