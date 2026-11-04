import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { OperationManager } from '../OperationManager';
import { UserManager } from '../UserManager';
import { GridError } from '../types';

// users.delete over real HTTP against a local stub venue (#85): checks what
// actually goes on the wire (bearer auth, operation name, DID, body UCANs)
// and how the venue's success and 403 answers come back.

type Seen = { method?: string; url?: string; auth?: string; body?: any };

function startStub(respond: (seen: Seen, res: ServerResponse) => void): Promise<{ server: Server; baseUrl: string; seen: Seen[] }> {
  const seen: Seen[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const s: Seen = { method: req.method, url: req.url, auth: req.headers.authorization, body: raw ? JSON.parse(raw) : undefined };
      seen.push(s);
      respond(s, res);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    resolve({ server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen });
  }));
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function usersFor(baseUrl: string) {
  const ctx = {
    baseUrl,
    venueId: 'did:key:zVenue',
    auth: { apply: (h: Record<string, string>) => { h['Authorization'] = 'Bearer tok'; } },
  };
  return new UserManager({ ...ctx, operations: new OperationManager(ctx) });
}

describe('users.delete over HTTP (#85)', () => {
  let server: Server | undefined;
  afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

  const record = { did: 'did:web:example.com%3A8080:u:alice', deletedAt: 1762236000000, deletedBy: 'did:key:zOperator' };

  it('posts v/ops/user/delete with the DID verbatim, bearer auth and body UCANs, and types the result', async () => {
    const stub = await startStub((s, res) => send(res, 200, { id: '0xjob', status: 'COMPLETE', output: record }));
    server = stub.server;
    const result = await usersFor(stub.baseUrl).delete(record.did, ['ucan-jwt']);
    expect(result).toEqual(record);
    const [req] = stub.seen;
    expect(req.method).toBe('POST');
    expect(req.url).toBe('/api/v1/invoke');
    expect(req.auth).toBe('Bearer tok');
    expect(req.body).toMatchObject({ operation: 'v/ops/user/delete', input: { did: record.did }, ucans: ['ucan-jwt'] });
  });

  it('returns the original record when the deletion is repeated', async () => {
    const stub = await startStub((s, res) => send(res, 200, { id: '0xjob', status: 'COMPLETE', output: record }));
    server = stub.server;
    const users = usersFor(stub.baseUrl);
    expect(await users.delete(record.did)).toEqual(record);
    expect(await users.delete(record.did)).toEqual(record);
    expect(stub.seen.every((s) => s.body.ucans === undefined)).toBe(true);
  });

  it('surfaces a 403 for a caller without user/delete authority', async () => {
    const stub = await startStub((s, res) => send(res, 403, { error: 'Requires user/delete on did:key:zVenue/users' }));
    server = stub.server;
    const err = await usersFor(stub.baseUrl).delete(record.did).catch((e) => e);
    expect(err).toBeInstanceOf(GridError);
    expect((err as GridError).statusCode).toBe(403);
  });
});
