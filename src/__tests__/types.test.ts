import { CoviaError, RunStatus } from '../types';

describe('CoviaError', () => {
  it('is an instance of Error', () => {
    const err = new CoviaError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CoviaError);
  });

  it('sets name to CoviaError', () => {
    const err = new CoviaError('test');
    expect(err.name).toBe('CoviaError');
  });

  it('sets message', () => {
    const err = new CoviaError('something went wrong');
    expect(err.message).toBe('something went wrong');
  });

  it('defaults code to null', () => {
    const err = new CoviaError('test');
    expect(err.code).toBeNull();
  });

  it('accepts a custom code', () => {
    const err = new CoviaError('not found', 404);
    expect(err.code).toBe(404);
    expect(err.message).toBe('not found');
  });

  it('has a stack trace', () => {
    const err = new CoviaError('test');
    expect(err.stack).toBeDefined();
  });
});

describe('RunStatus', () => {
  it('has all expected values', () => {
    expect(RunStatus.COMPLETE).toBe('COMPLETE');
    expect(RunStatus.FAILED).toBe('FAILED');
    expect(RunStatus.PENDING).toBe('PENDING');
    expect(RunStatus.STARTED).toBe('STARTED');
    expect(RunStatus.CANCELLED).toBe('CANCELLED');
    expect(RunStatus.TIMEOUT).toBe('TIMEOUT');
    expect(RunStatus.REJECTED).toBe('REJECTED');
    expect(RunStatus.INPUT_REQUIRED).toBe('INPUT_REQUIRED');
    expect(RunStatus.AUTH_REQUIRED).toBe('AUTH_REQUIRED');
    expect(RunStatus.PAUSED).toBe('PAUSED');
  });

  it('has exactly 10 values', () => {
    const values = Object.values(RunStatus);
    expect(values).toHaveLength(10);
  });
});


describe('exclusive agent lifecycle contracts', () => {
  it('accepts current result shapes without legacy creation flags', () => {
    const created: import('../types').AgentCreateResult = { agentId: 'a', status: 'SLEEPING', warnings: ['check tools'] };
    const forked: import('../types').AgentForkResult = { agentId: 'b', status: 'SLEEPING', forkedFrom: 'a' };
    expect(created.warnings).toEqual(['check tools']);
    expect(forked.forkedFrom).toBe('a');
    // @ts-expect-error overwrite was removed from the venue contract
    const createInput: import('../types').AgentCreateInput = { agentId: 'a', overwrite: true };
    // @ts-expect-error overwrite was removed from the venue contract
    const forkInput: import('../types').AgentForkInput = { agentId: 'b', sourceId: 'a', overwrite: true };
    expect(createInput.agentId).toBe('a');
    expect(forkInput.sourceId).toBe('a');
  });
});


it('accepts both agent deletion result shapes', () => {
  const terminated: import('../types').AgentDeleteResult = { agentId: 'a', status: 'TERMINATED' };
  const removed: import('../types').AgentDeleteResult = { agentId: 'a', address: 'g/a', removed: true };
  expect(terminated.status).toBe('TERMINATED');
  expect(removed.removed).toBe(true);
  expect(removed.status).toBeUndefined();
});
