import { Job } from '../Job';
import { RunStatus, VenueInterface, CoviaTimeoutError, JobFailedError, SSEEvent } from '../types';
import { createSSEEvent } from '../Utils';

function createMockJobs() {
  return {
    cancel: jest.fn().mockResolvedValue({ status: RunStatus.CANCELLED }),
    delete: jest.fn().mockResolvedValue(undefined),
    sendMessage: jest.fn().mockResolvedValue({ status: 'queued', queueDepth: 1 }),
    pause: jest.fn().mockResolvedValue({ status: RunStatus.PAUSED }),
    resume: jest.fn().mockResolvedValue({ status: RunStatus.STARTED }),
    stream: jest.fn(),
  };
}

function createMockVenue(overrides: Record<string, any> = {}): VenueInterface {
  return {
    baseUrl: 'https://example.com',
    venueId: 'did:web:example.com',
    metadata: { name: 'Test Venue' },
    auth: { apply: jest.fn() },
    status: jest.fn(),
    getJob: jest.fn(),
    listJobs: jest.fn(),
    getAsset: jest.fn(),
    listAssets: jest.fn().mockResolvedValue({ items: [], total: 0, offset: 0, limit: 100 }),
    didDocument: jest.fn().mockResolvedValue({ id: 'did:web:example.com' }),
    mcpDiscovery: jest.fn().mockResolvedValue({}),
    agentCard: jest.fn().mockResolvedValue({}),
    listSecrets: jest.fn().mockResolvedValue([]),
    putSecret: jest.fn().mockResolvedValue(undefined),
    deleteSecret: jest.fn().mockResolvedValue(undefined),
    close: jest.fn(),
    jobs: createMockJobs(),
    assets: { get: jest.fn(), list: jest.fn(), getMetadata: jest.fn(), putContent: jest.fn(), getContent: jest.fn(), register: jest.fn(), clearCache: jest.fn() },
    operations: { run: jest.fn(), invoke: jest.fn(), list: jest.fn(), get: jest.fn() },
    ...overrides,
  } as any;
}

function getJobs(venue: VenueInterface) {
  return (venue as any).jobs;
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

  it('cancel delegates to jobs.cancel', async () => {
    const venue = createMockVenue();
    const job = new Job('job-2', venue, { status: RunStatus.STARTED });

    const result = await job.cancel();
    expect(result).toEqual({ status: RunStatus.CANCELLED });
    expect(getJobs(venue).cancel).toHaveBeenCalledWith('job-2');
  });

  it('delete delegates to jobs.delete', async () => {
    const venue = createMockVenue();
    const job = new Job('job-3', venue, { status: RunStatus.COMPLETE });

    await job.delete();
    expect(getJobs(venue).delete).toHaveBeenCalledWith('job-3');
  });

  it('propagates errors from jobs.cancel', async () => {
    const jobs = createMockJobs();
    jobs.cancel.mockRejectedValue(new Error('cancel failed'));
    const venue = createMockVenue({ jobs } as any);
    const job = new Job('job-4', venue, { status: RunStatus.STARTED });

    await expect(job.cancel()).rejects.toThrow('cancel failed');
  });

  it('propagates errors from jobs.delete', async () => {
    const jobs = createMockJobs();
    jobs.delete.mockRejectedValue(new Error('delete failed'));
    const venue = createMockVenue({ jobs } as any);
    const job = new Job('job-5', venue, { status: RunStatus.COMPLETE });

    await expect(job.delete()).rejects.toThrow('delete failed');
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
    const venue = createMockVenue();
    const updatedJob = new Job('j1', venue, { status: RunStatus.COMPLETE, output: { x: 1 } });
    (venue.getJob as jest.Mock).mockResolvedValue(updatedJob);
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
        return Promise.resolve(new Job('j1', venue, { status }));
      }),
    } as any);
    const job = new Job('j1', venue, { status: RunStatus.STARTED });

    await job.wait({ timeout: 5000 });
    expect(callCount).toBeGreaterThanOrEqual(2);
    expect(job.isFinished).toBe(true);
  });

  it('throws CoviaTimeoutError when timeout exceeded', async () => {
    const venue = createMockVenue({
      getJob: jest.fn().mockImplementation(() =>
        Promise.resolve(new Job('j1', venue, { status: RunStatus.STARTED }))
      ),
    } as any);
    const job = new Job('j1', venue, { status: RunStatus.STARTED });

    await expect(job.wait({ timeout: 100 })).rejects.toThrow(CoviaTimeoutError);
  });
});

describe('Job.result', () => {
  it('waits and returns output on success', async () => {
    const venue = createMockVenue();
    const completedJob = new Job('j1', venue, {
      status: RunStatus.COMPLETE,
      output: { answer: 42 },
    });
    (venue.getJob as jest.Mock).mockResolvedValue(completedJob);
    const job = new Job('j1', venue, { status: RunStatus.STARTED });

    const result = await job.result({ timeout: 5000 });
    expect(result).toEqual({ answer: 42 });
  });

  it('throws JobFailedError when job fails', async () => {
    const venue = createMockVenue();
    const failedJob = new Job('j1', venue, {
      status: RunStatus.FAILED,
      output: { error: 'something broke' },
    });
    (venue.getJob as jest.Mock).mockResolvedValue(failedJob);
    const job = new Job('j1', venue, { status: RunStatus.STARTED });

    await expect(job.result({ timeout: 5000 })).rejects.toThrow(JobFailedError);
  });
});

describe('Job.isPaused / needsInput / needsAuth', () => {
  it('isPaused returns true for PAUSED status', () => {
    const venue = createMockVenue();
    expect(new Job('j', venue, { status: RunStatus.PAUSED }).isPaused).toBe(true);
  });

  it('isPaused returns true for INPUT_REQUIRED status', () => {
    const venue = createMockVenue();
    expect(new Job('j', venue, { status: RunStatus.INPUT_REQUIRED }).isPaused).toBe(true);
  });

  it('isPaused returns true for AUTH_REQUIRED status', () => {
    const venue = createMockVenue();
    expect(new Job('j', venue, { status: RunStatus.AUTH_REQUIRED }).isPaused).toBe(true);
  });

  it('isPaused returns false for non-paused statuses', () => {
    const venue = createMockVenue();
    expect(new Job('j', venue, { status: RunStatus.STARTED }).isPaused).toBe(false);
    expect(new Job('j', venue, { status: RunStatus.COMPLETE }).isPaused).toBe(false);
  });

  it('needsInput returns true only for INPUT_REQUIRED', () => {
    const venue = createMockVenue();
    expect(new Job('j', venue, { status: RunStatus.INPUT_REQUIRED }).needsInput).toBe(true);
    expect(new Job('j', venue, { status: RunStatus.PAUSED }).needsInput).toBe(false);
  });

  it('needsAuth returns true only for AUTH_REQUIRED', () => {
    const venue = createMockVenue();
    expect(new Job('j', venue, { status: RunStatus.AUTH_REQUIRED }).needsAuth).toBe(true);
    expect(new Job('j', venue, { status: RunStatus.PAUSED }).needsAuth).toBe(false);
  });
});

describe('Job.sendMessage / pause / resume', () => {
  it('sendMessage delegates to jobs.sendMessage', async () => {
    const venue = createMockVenue();
    const job = new Job('job-msg', venue, { status: RunStatus.INPUT_REQUIRED });

    const result = await job.sendMessage({ text: 'hello' });
    expect(getJobs(venue).sendMessage).toHaveBeenCalledWith('job-msg', { text: 'hello' });
    expect(result).toEqual({ status: 'queued', queueDepth: 1 });
  });

  it('pause delegates to jobs.pause', async () => {
    const venue = createMockVenue();
    const job = new Job('job-p', venue, { status: RunStatus.STARTED });

    const result = await job.pause();
    expect(getJobs(venue).pause).toHaveBeenCalledWith('job-p');
    expect(result).toEqual({ status: RunStatus.PAUSED });
  });

  it('resume delegates to jobs.resume', async () => {
    const venue = createMockVenue();
    const job = new Job('job-r', venue, { status: RunStatus.PAUSED });

    const result = await job.resume();
    expect(getJobs(venue).resume).toHaveBeenCalledWith('job-r');
    expect(result).toEqual({ status: RunStatus.STARTED });
  });
});

describe('Job.stream', () => {
  it('delegates to jobs.stream', async () => {
    const fakeEvents: SSEEvent[] = [
      createSSEEvent({ event: 'status', data: '{"status":"STARTED"}' }),
      createSSEEvent({ event: 'status', data: '{"status":"COMPLETE"}' }),
    ];
    async function* fakeGenerator(): AsyncGenerator<SSEEvent> {
      for (const evt of fakeEvents) {
        yield evt;
      }
    }
    const jobs = createMockJobs();
    jobs.stream.mockReturnValue(fakeGenerator());
    const venue = createMockVenue({ jobs } as any);
    const job = new Job('j1', venue, { status: RunStatus.STARTED });

    const collected: SSEEvent[] = [];
    for await (const evt of job.stream()) {
      collected.push(evt);
    }

    expect(jobs.stream).toHaveBeenCalledWith('j1');
    expect(collected).toHaveLength(2);
    expect(collected[0].json()).toEqual({ status: 'STARTED' });
    expect(collected[1].json()).toEqual({ status: 'COMPLETE' });
  });
});
