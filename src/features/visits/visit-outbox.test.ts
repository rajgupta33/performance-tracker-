import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { startVisit } = vi.hoisted(() => ({
  startVisit: vi.fn(async (input: any) => ({
    id: input.visitId,
    organizationId: 'org-test',
    employeeId: 'user-test',
    customerId: input.customerId,
    clientEventId: input.clientEventId,
    status: 'IN_PROGRESS',
    locationStatus: 'PENDING',
    products: [],
    startAccuracyM: input.position.accuracyM,
    startedAt: input.position.capturedAt,
  })),
}));

vi.mock('./visits.service', () => ({
  visitsService: {
    startVisit,
    completePreparedVisit: vi.fn(),
  },
}));

import {
  drainVisitOutbox,
  discardFailedVisitOutboxEntry,
  enqueueVisitStart,
  getVisitOutboxSummary,
  isRetryableVisitError,
  localActiveVisit,
} from './visit-outbox';

const customer = {
  id: 'customer-test',
  name: 'Test Dealer',
  customerType: 'DEALER' as const,
};

const startInput = (visitId: string, capturedAt = new Date().toISOString()) => ({
  visitId,
  clientEventId: `event-${visitId}`,
  customerId: customer.id,
  customer,
  purpose: 'Dealer follow-up',
  position: { latitude: 28.61, longitude: 77.2, accuracyM: 20, capturedAt },
});

describe('visit outbox error classification', () => {
  it('retries network/database availability failures', () => {
    expect(isRetryableVisitError({ status: 503 })).toBe(true);
    expect(isRetryableVisitError({ code: '08006' })).toBe(true);
    expect(isRetryableVisitError({ code: '40001' })).toBe(true);
  });

  it('dead-letters deterministic database and authorization errors', () => {
    expect(isRetryableVisitError({ code: '23514' })).toBe(false);
    expect(isRetryableVisitError({ status: 403 })).toBe(false);
  });
});

beforeEach(() => {
  startVisit.mockReset();
  startVisit.mockImplementation(async (input: any) => ({
    id: input.visitId, organizationId: 'org-test', employeeId: 'user-test',
    customerId: input.customerId, clientEventId: input.clientEventId,
    status: 'IN_PROGRESS', locationStatus: 'PENDING', products: [],
    startAccuracyM: input.position.accuracyM, startedAt: input.position.capturedAt,
  }));
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('visit IndexedDB outbox', () => {
  it('persists a start and restores an optimistic active visit', async () => {
    const userId = `restore-${crypto.randomUUID()}`;
    await enqueueVisitStart(userId, 'org-test', startInput(crypto.randomUUID()));

    const summary = await getVisitOutboxSummary(userId);
    const active = localActiveVisit(summary.entries);

    expect(summary.pending).toBe(1);
    expect(active?.customer?.name).toBe('Test Dealer');
    expect(active?.status).toBe('IN_PROGRESS');
  });

  it('drains a successful entry and removes it transactionally', async () => {
    const userId = `drain-${crypto.randomUUID()}`;
    const entry = await enqueueVisitStart(userId, 'org-test', startInput(crypto.randomUUID()));

    const result = await drainVisitOutbox(userId);

    expect(result.syncedEntryIds).toContain(entry.id);
    expect(result.results.get(entry.id)?.id).toBe(entry.visitId);
    expect((await getVisitOutboxSummary(userId)).entries).toHaveLength(0);
  });

  it('keeps strict FIFO order when the head action has a retryable failure', async () => {
    const userId = `fifo-${crypto.randomUUID()}`;
    const firstTime = new Date(Date.now() - 1000).toISOString();
    const secondTime = new Date().toISOString();
    await enqueueVisitStart(userId, 'org-test', startInput(crypto.randomUUID(), firstTime));
    await enqueueVisitStart(userId, 'org-test', startInput(crypto.randomUUID(), secondTime));
    startVisit.mockRejectedValueOnce(Object.assign(new Error('temporary outage'), { status: 503 }));

    await drainVisitOutbox(userId);
    const summary = await getVisitOutboxSummary(userId);

    expect(startVisit).toHaveBeenCalledTimes(1);
    expect(summary.pending).toBe(2);
    expect(summary.entries[0].attempts).toBe(1);
    expect(summary.entries[1].attempts).toBe(0);
  });

  it('does not attempt network work while offline', async () => {
    const userId = `offline-${crypto.randomUUID()}`;
    await enqueueVisitStart(userId, 'org-test', startInput(crypto.randomUUID()));
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    const result = await drainVisitOutbox(userId);

    expect(result.syncedEntryIds).toHaveLength(0);
    expect(startVisit).not.toHaveBeenCalled();
    expect((await getVisitOutboxSummary(userId)).pending).toBe(1);
  });

  it('coalesces concurrent drains so an action executes exactly once', async () => {
    const userId = `parallel-${crypto.randomUUID()}`;
    await enqueueVisitStart(userId, 'org-test', startInput(crypto.randomUUID()));

    await Promise.all([drainVisitOutbox(userId), drainVisitOutbox(userId), drainVisitOutbox(userId)]);

    expect(startVisit).toHaveBeenCalledTimes(1);
    expect((await getVisitOutboxSummary(userId)).entries).toHaveLength(0);
  });

  it('backs off transient errors before retrying successfully', async () => {
    const userId = `backoff-${crypto.randomUUID()}`;
    await enqueueVisitStart(userId, 'org-test', startInput(crypto.randomUUID()));
    startVisit.mockRejectedValueOnce(Object.assign(new Error('gateway unavailable'), { status: 503 }));

    await drainVisitOutbox(userId);
    await drainVisitOutbox(userId);
    expect(startVisit).toHaveBeenCalledTimes(1);

    const waiting = (await getVisitOutboxSummary(userId)).entries[0];
    vi.spyOn(Date, 'now').mockReturnValue(waiting.nextAttemptAt + 1);
    await drainVisitOutbox(userId);

    expect(startVisit).toHaveBeenCalledTimes(2);
    expect((await getVisitOutboxSummary(userId)).entries).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it('dead-letters a business-rule failure and allows explicit discard', async () => {
    const userId = `failed-${crypto.randomUUID()}`;
    const entry = await enqueueVisitStart(userId, 'org-test', startInput(crypto.randomUUID()));
    startVisit.mockRejectedValueOnce(Object.assign(new Error('customer is inactive'), { code: '23514' }));

    await drainVisitOutbox(userId);
    expect((await getVisitOutboxSummary(userId)).failed).toBe(1);

    await discardFailedVisitOutboxEntry(userId, entry.id);
    expect((await getVisitOutboxSummary(userId)).entries).toHaveLength(0);
  });

  it('isolates queues by authenticated user', async () => {
    const firstUser = `user-a-${crypto.randomUUID()}`;
    const secondUser = `user-b-${crypto.randomUUID()}`;
    await enqueueVisitStart(firstUser, 'org-test', startInput(crypto.randomUUID()));
    await enqueueVisitStart(secondUser, 'org-test', startInput(crypto.randomUUID()));

    await drainVisitOutbox(firstUser);

    expect((await getVisitOutboxSummary(firstUser)).entries).toHaveLength(0);
    expect((await getVisitOutboxSummary(secondUser)).pending).toBe(1);
  });

  it('allows different users to drain independently at the same time', async () => {
    const firstUser = `parallel-a-${crypto.randomUUID()}`;
    const secondUser = `parallel-b-${crypto.randomUUID()}`;
    await enqueueVisitStart(firstUser, 'org-test', startInput(crypto.randomUUID()));
    await enqueueVisitStart(secondUser, 'org-test', startInput(crypto.randomUUID()));

    await Promise.all([drainVisitOutbox(firstUser), drainVisitOutbox(secondUser)]);

    expect(startVisit).toHaveBeenCalledTimes(2);
    expect((await getVisitOutboxSummary(firstUser)).entries).toHaveLength(0);
    expect((await getVisitOutboxSummary(secondUser)).entries).toHaveLength(0);
  });
});
