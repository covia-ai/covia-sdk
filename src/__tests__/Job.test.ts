import { Job } from '../Job';
import { RunStatus, VenueInterface, CoviaTimeoutError, JobFailedError, SSEEvent } from '../types';
import { createSSEEvent } from '../Utils';

function createMockVenue(overrides: Partial<VenueInterface> = {}): VenueInterface {
  return {
    baseUrl: 'https://example.com',
    venueId: 'did:web:example.com',
    metadata: { name: 'Test Venue' },
    cancelJob: jest.fn().mockResolvedValue(200),
    deleteJob: jest.fn().mockResolvedValue(200),
    status: jest.fn(),
    getJob: jest.fn(),
    listJobs: jest.fn(),
    getAsset: jest.fn(),
    register: jest.fn(),
    listAssets: jest.fn().mockResolvedValue({ items: [], total: 0, offset: 0, limit: 100 }),
    getMetadata: jest.fn(),
    readStream: jest.fn(),
    putContent: jest.fn(),
    getContent: jest.fn(),
    run: jest.fn(),
    invoke: jest.fn(),
    listOperations: jest.fn().mockResolvedValue([]),
    getOperation: jest.fn().mockResolvedValue({ name: 'test:echo', asset: 'op-1' }),
    didDocument: jest.fn().mockResolvedValue({ id: 'did:web:example.com' }),
    mcpDiscovery: jest.fn().mockResolvedValue({}),
    agentCard: jest.fn().mockResolvedValue({}),
    streamJobEvents: jest.fn(),
    close: jest.fn(),
    ...overrides,
  };
}

describe('Job', () => {
  it('stores id, venue, and metadata', () => {
    const venue = createMockVenue();
    const meta = { status: RunStatus.COMPLETE, input: { x: 1 } };
    const job = new Job('job-1', venue, meta);

    expect(job.id).toBe('job-1');
    expect(job.venue).toBe(venue);
    expect(job.metadata).toBe(meta);
  });

  it('cancelJob delegates to venue.cancelJob', async () => {
    const venue = createMockVenue();
    const job = new Job('job-2', venue, { status: RunStatus.STARTED });

    const result = await job.cancelJob();
    expect(result).toBe(200);
    expect(venue.cancelJob).toHaveBeenCalledWith('job-2');
  });

  it('deleteJob delegates to venue.deleteJob', async () => {
    const venue = createMockVenue();
    const job = new Job('job-3', venue, { status: RunStatus.COMPLETE });

    const result = await job.deleteJob();
    expect(result).toBe(200);
    expect(venue.deleteJob).toHaveBeenCalledWith('job-3');
  });

  it('propagates errors from venue.cancelJob', async () => {
    const venue = createMockVenue({
      cancelJob: jest.fn().mockRejectedValue(new Error('cancel failed')),
    });
    const job = new Job('job-4', venue, { status: RunStatus.STARTED });

    await expect(job.cancelJob()).rejects.toThrow('cancel failed');
  });

  it('propagates errors from venue.deleteJob', async () => {
    const venue = createMockVenue({
      deleteJob: jest.fn().mockRejectedValue(new Error('delete failed')),
    });
    const job = new Job('job-5', venue, { status: RunStatus.COMPLETE });

    await expect(job.deleteJob()).rejects.toThrow('delete failed');
  });
});

describe('Job status helpers', () => {
  it('isFinished returns true for terminal statuses', () => {
    const venue = createMockVenue();
    expect(new Job('j', venue, { status: RunStatus.COMPLETE }).isFinished).toBe(true);
    expect(new Job('j', venue, { status: RunStatus.FAILED }).isFinished).toBe(true);
    expect(new Job('j', venue, { status: RunStatus.CANCELLED }).isFinished).toBe(true);
    expect(new Job('j', venue, { status: RunStatus.REJECTED }).isFinished).toBe(true);
    expect(new Job('j', venue, { status: RunStatus.TIMEOUT }).isFinished).toBe(true);
  });

  it('isFinished returns false for non-terminal statuses', () => {
    const venue = createMockVenue();
    expect(new Job('j', venue, { status: RunStatus.STARTED }).isFinished).toBe(false);
    expect(new Job('j', venue, { status: RunStatus.PENDING }).isFinished).toBe(false);
    expect(new Job('j', venue, { status: RunStatus.PAUSED }).isFinished).toBe(false);
  });

  it('isComplete returns true only for COMPLETE', () => {
    const venue = createMockVenue();
    expect(new Job('j', venue, { status: RunStatus.COMPLETE }).isComplete).toBe(true);
    expect(new Job('j', venue, { status: RunStatus.FAILED }).isComplete).toBe(false);
    expect(new Job('j', venue, { status: RunStatus.STARTED }).isComplete).toBe(false);
  });
});

describe('Job.output', () => {
  it('returns output when job is COMPLETE', () => {
    const venue = createMockVenue();
    const job = new Job('j1', venue, { status: RunStatus.COMPLETE, output: { answer: 42 } });
    expect(job.output).toEqual({ answer: 42 });
  });

  it('throws JobFailedError when job finished with non-COMPLETE status', () => {
    const venue = createMockVenue();
    const job = new Job('j2', venue, { status: RunStatus.FAILED, output: { error: 'boom' } });
    expect(() => job.output).toThrow(JobFailedError);
  });

  it('throws Error when job is not finished', () => {
    const venue = createMockVenue();
    const job = new Job('j3', venue, { status: RunStatus.STARTED });
    expect(() => job.output).toThrow('Job is not finished');
  });
});

describe('Job.refresh', () => {
  it('calls venue.getJob and updates metadata', async () => {
    const updatedJob = new Job('j1', {} as VenueInterface, { status: RunStatus.COMPLETE, output: { x: 1 } });
    const venue = createMockVenue({
      getJob: jest.fn().mockResolvedValue(updatedJob),
    });
    const job = new Job('j1', venue, { status: RunStatus.STARTED });

    await job.refresh();
    expect(venue.getJob).toHaveBeenCalledWith('j1');
    expect(job.metadata.status).toBe(RunStatus.COMPLETE);
  });

  it('throws Error when job has no ID', async () => {
    const venue = createMockVenue();
    const job = new Job('', venue, { status: RunStatus.STARTED });
    await expect(job.refresh()).rejects.toThrow('Cannot refresh a job with no ID');
  });
});

describe('Job.wait', () => {
  it('returns immediately if already finished', async () => {
    const venue = createMockVenue();
    const job = new Job('j1', venue, { status: RunStatus.COMPLETE });

    await job.wait();
    expect(venue.getJob).not.toHaveBeenCalled();
  });

  it('polls until finished', async () => {
    let callCount = 0;
    const venue = createMockVenue({
      getJob: jest.fn().mockImplementation(() => {
        callCount++;
        const status = callCount >= 2 ? RunStatus.COMPLETE : RunStatus.STARTED;
        return Promise.resolve(new Job('j1', {} as VenueInterface, { status }));
      }),
    });
    const job = new Job('j1', venue, { status: RunStatus.STARTED });

    await job.wait({ timeout: 5000 });
    expect(callCount).toBeGreaterThanOrEqual(2);
    expect(job.isFinished).toBe(true);
  });

  it('throws CoviaTimeoutError when timeout exceeded', async () => {
    const venue = createMockVenue({
      getJob: jest.fn().mockResolvedValue(
        new Job('j1', {} as VenueInterface, { status: RunStatus.STARTED })
      ),
    });
    const job = new Job('j1', venue, { status: RunStatus.STARTED });

    await expect(job.wait({ timeout: 100 })).rejects.toThrow(CoviaTimeoutError);
  });
});

describe('Job.result', () => {
  it('waits and returns output on success', async () => {
    const completedJob = new Job('j1', {} as VenueInterface, {
      status: RunStatus.COMPLETE,
      output: { answer: 42 },
    });
    const venue = createMockVenue({
      getJob: jest.fn().mockResolvedValue(completedJob),
    });
    const job = new Job('j1', venue, { status: RunStatus.STARTED });

    const result = await job.result({ timeout: 5000 });
    expect(result).toEqual({ answer: 42 });
  });

  it('throws JobFailedError when job fails', async () => {
    const failedJob = new Job('j1', {} as VenueInterface, {
      status: RunStatus.FAILED,
      output: { error: 'something broke' },
    });
    const venue = createMockVenue({
      getJob: jest.fn().mockResolvedValue(failedJob),
    });
    const job = new Job('j1', venue, { status: RunStatus.STARTED });

    await expect(job.result({ timeout: 5000 })).rejects.toThrow(JobFailedError);
  });
});

describe('Job.stream', () => {
  it('delegates to venue.streamJobEvents', async () => {
    const fakeEvents: SSEEvent[] = [
      createSSEEvent({ event: 'status', data: '{"status":"STARTED"}' }),
      createSSEEvent({ event: 'status', data: '{"status":"COMPLETE"}' }),
    ];
    async function* fakeGenerator(): AsyncGenerator<SSEEvent> {
      for (const evt of fakeEvents) {
        yield evt;
      }
    }
    const venue = createMockVenue({
      streamJobEvents: jest.fn().mockReturnValue(fakeGenerator()),
    });
    const job = new Job('j1', venue, { status: RunStatus.STARTED });

    const collected: SSEEvent[] = [];
    for await (const evt of job.stream()) {
      collected.push(evt);
    }

    expect(venue.streamJobEvents).toHaveBeenCalledWith('j1');
    expect(collected).toHaveLength(2);
    expect(collected[0].json()).toEqual({ status: 'STARTED' });
    expect(collected[1].json()).toEqual({ status: 'COMPLETE' });
  });
});
