import { createSSEEvent, parseSSEStream } from '../Utils';
import { SSEEvent } from '../types';

describe('createSSEEvent', () => {
  it('creates event with all fields', () => {
    const evt = createSSEEvent({ event: 'update', data: '{"x":1}', id: '1', retry: 3000 });
    expect(evt.event).toBe('update');
    expect(evt.data).toBe('{"x":1}');
    expect(evt.id).toBe('1');
    expect(evt.retry).toBe(3000);
    expect(evt.json()).toEqual({ x: 1 });
  });

  it('defaults missing fields to null/empty', () => {
    const evt = createSSEEvent({});
    expect(evt.event).toBeNull();
    expect(evt.data).toBe('');
    expect(evt.id).toBeNull();
    expect(evt.retry).toBeNull();
  });
});

/** Helper to create a mock Response with a readable body from text chunks. */
function mockSSEResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
  return { body: stream } as unknown as Response;
}

/** Collect all events from an async generator. */
async function collectEvents(gen: AsyncGenerator<SSEEvent>): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  for await (const evt of gen) {
    events.push(evt);
  }
  return events;
}

describe('parseSSEStream', () => {
  it('parses a simple event', async () => {
    const response = mockSSEResponse([
      'event: status\ndata: {"status":"STARTED"}\n\n',
    ]);
    const events = await collectEvents(parseSSEStream(response));
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('status');
    expect(events[0].json()).toEqual({ status: 'STARTED' });
  });

  it('parses multiple events', async () => {
    const response = mockSSEResponse([
      'event: status\ndata: {"s":"A"}\n\nevent: status\ndata: {"s":"B"}\n\n',
    ]);
    const events = await collectEvents(parseSSEStream(response));
    expect(events).toHaveLength(2);
    expect(events[0].json()).toEqual({ s: 'A' });
    expect(events[1].json()).toEqual({ s: 'B' });
  });

  it('handles multi-line data fields', async () => {
    const response = mockSSEResponse([
      'data: line1\ndata: line2\n\n',
    ]);
    const events = await collectEvents(parseSSEStream(response));
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('line1\nline2');
  });

  it('handles data split across chunks', async () => {
    const response = mockSSEResponse([
      'event: up',
      'date\ndata: {"x":1}\n',
      '\n',
    ]);
    const events = await collectEvents(parseSSEStream(response));
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('update');
    expect(events[0].json()).toEqual({ x: 1 });
  });

  it('ignores comment lines', async () => {
    const response = mockSSEResponse([
      ': this is a comment\nevent: ping\ndata: hello\n\n',
    ]);
    const events = await collectEvents(parseSSEStream(response));
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('ping');
    expect(events[0].data).toBe('hello');
  });

  it('handles event with id and retry fields', async () => {
    const response = mockSSEResponse([
      'id: 42\nretry: 5000\ndata: test\n\n',
    ]);
    const events = await collectEvents(parseSSEStream(response));
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('42');
    expect(events[0].retry).toBe(5000);
  });

  it('flushes remaining event at end of stream', async () => {
    // Data with trailing newline but no double-newline terminator
    const response = mockSSEResponse([
      'data: final\n',
    ]);
    const events = await collectEvents(parseSSEStream(response));
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('final');
  });

  it('returns no events for empty stream', async () => {
    const response = mockSSEResponse([]);
    const events = await collectEvents(parseSSEStream(response));
    expect(events).toHaveLength(0);
  });

  it('returns immediately if response has no body', async () => {
    const response = { body: null } as unknown as Response;
    const events = await collectEvents(parseSSEStream(response));
    expect(events).toHaveLength(0);
  });
});
