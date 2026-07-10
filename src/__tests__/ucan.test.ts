import { identityToken, grant, relayDelegation, createUCANJWT, didFor, VENUE_RELAY } from '../crypto/ucan';
import { generateKeyPair } from '../crypto/keys';

// Deterministic shape tests for client-side UCAN minting (covia-sdk#15).
// Signature verification end-to-end is covered by the live venue test
// (ucan_verify); here we decode and pin the claims.

function decode(jwt: string): { header: any; claims: any } {
  const [h, p] = jwt.split('.');
  const un64 = (s: string) => JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  return { header: un64(h), claims: un64(p) };
}

describe('UCAN minting', () => {
  const { privateKey } = generateKeyPair();
  const venueDID = 'did:key:z6MkVenueExample';

  it('identityToken: empty att, audienced to the venue, short-lived', () => {
    const { header, claims } = decode(identityToken(privateKey, venueDID, 300));
    expect(header.alg).toBe('EdDSA');
    expect(claims.iss).toBe(didFor(privateKey));
    expect(claims.aud).toBe(venueDID);
    expect(claims.att).toEqual([]);                       // pure identity — grants nothing
    expect(claims.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(300);
  });

  it('grant: owner-rooted delegation of {with, can}', () => {
    const { claims } = decode(grant(privateKey, 'did:key:z6MkBob', 'did:key:zAlice/w/shared/', 'crud/read', 3600));
    expect(claims.aud).toBe('did:key:z6MkBob');
    expect(claims.att).toEqual([{ with: 'did:key:zAlice/w/shared/', can: 'crud/read' }]);
    expect(claims.prf).toBeUndefined();                   // root grant — no chain
  });

  it('relayDelegation: venue/relay instruction + substantive caps', () => {
    const { claims } = decode(relayDelegation(privateKey, venueDID, 300,
      [{ with: 'did:key:zMe/w/', can: 'crud/read' }]));
    expect(claims.aud).toBe(venueDID);
    expect(claims.att[0]).toEqual({ with: didFor(privateKey), can: VENUE_RELAY });
    expect(claims.att[1]).toEqual({ with: 'did:key:zMe/w/', can: 'crud/read' });
  });

  it('delegation chains embed parent JWTs in prf', () => {
    const root = grant(privateKey, 'did:key:z6MkBob', 'did:key:zMe/w/', 'crud', 3600);
    const { privateKey: bobKey } = generateKeyPair();
    const leaf = createUCANJWT(bobKey, 'did:key:z6MkCarol',
      [{ with: 'did:key:zMe/w/shared/', can: 'crud/read' }], 3600, [root]);
    const { claims } = decode(leaf);
    expect(claims.prf).toEqual([root]);
  });
});
