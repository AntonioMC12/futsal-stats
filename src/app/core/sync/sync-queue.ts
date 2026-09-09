import { Table } from 'dexie';
import { createId } from '../utils/id';
import {
  mergeSyncOperation,
  SyncOperation,
  SyncQueueRecord,
  syncDedupeKey,
} from './sync-operation';

export async function enqueueSyncOperation(
  queue: Table<SyncQueueRecord, string>,
  operation: SyncOperation,
  now = Date.now(),
): Promise<void> {
  const dedupeKey = syncDedupeKey(operation);
  const existing = await queue.where('dedupeKey').equals(dedupeKey).first();
  const updatedAt = Math.max(now, (existing?.updatedAt ?? now - 1) + 1);
  await queue.put({
    id: existing?.id ?? createId(),
    dedupeKey,
    operation: mergeSyncOperation(existing?.operation, operation),
    status: 'pending',
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt,
  });
}

export function retryDelayMs(attempt: number): number {
  return Math.min(300_000, 1_000 * 2 ** Math.max(0, attempt - 1));
}
