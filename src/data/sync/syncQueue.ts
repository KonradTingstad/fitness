import { getDatabase } from '@/data/db/database';
import { createId } from '@/data/db/ids';

export type SyncOperation = 'insert' | 'update' | 'delete' | 'upsert';

export async function enqueueSync(
  entityType: string,
  entityId: string,
  operation: SyncOperation,
  payload: unknown,
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const idempotencyKey = `${entityType}:${entityId}:${operation}:${now}`;
  await db.runAsync(
    `INSERT OR IGNORE INTO sync_queue
    (id, entity_type, entity_id, operation, payload_json, idempotency_key, status, attempt_count, last_error, next_retry_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      createId('sync'),
      entityType,
      entityId,
      operation,
      JSON.stringify(payload),
      idempotencyKey,
      'pending',
      0,
      null,
      null,
      now,
      now,
    ],
  );
}

export async function getPendingSyncCount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'");
  return row?.count ?? 0;
}
