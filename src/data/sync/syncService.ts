import * as Network from 'expo-network';

import { getDatabase } from '@/data/db/database';
import { isSupabaseConfigured, supabase } from '@/data/sync/supabase';

export interface SyncState {
  isOnline: boolean;
  isConfigured: boolean;
  isAuthenticated: boolean;
  pendingCount: number;
  failedCount: number;
  lastError?: string;
  skippedReason?: 'offline' | 'not_configured' | 'not_authenticated';
  lastRunAt?: string;
}

type ParsedSyncError = {
  message: string;
  statusCode?: number;
};

function coerceErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error) {
    return error;
  }
  return 'Unknown sync error';
}

function extractMessageFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const record = payload as Record<string, unknown>;
  const error = typeof record.error === 'string' ? record.error.trim() : '';
  const message = typeof record.message === 'string' ? record.message.trim() : '';
  const details = typeof record.details === 'string' ? record.details.trim() : '';
  const hint = typeof record.hint === 'string' ? record.hint.trim() : '';

  if (error && details) {
    return `${error}: ${details}`;
  }

  const candidates = [error, message, details, hint];
  for (const value of candidates) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

async function parseSyncError(error: unknown): Promise<ParsedSyncError> {
  const fallback = coerceErrorMessage(error);
  if (!error || typeof error !== 'object') {
    return { message: fallback };
  }

  const maybeError = error as { context?: unknown };
  const context = maybeError.context as
    | {
        status?: number;
        clone?: () => { json?: () => Promise<unknown>; text?: () => Promise<string> };
        json?: () => Promise<unknown>;
        text?: () => Promise<string>;
      }
    | undefined;

  if (!context) {
    return { message: fallback };
  }

  const statusCode = typeof context.status === 'number' ? context.status : undefined;

  const readTarget = typeof context.clone === 'function' ? context.clone() : context;
  try {
    if (typeof readTarget.json === 'function') {
      const payload = await readTarget.json();
      const detailed = extractMessageFromPayload(payload);
      if (detailed) {
        return { message: detailed, statusCode };
      }
    }
  } catch {
    // Continue to text fallback.
  }

  try {
    if (typeof readTarget.text === 'function') {
      const text = (await readTarget.text())?.trim();
      if (text) {
        return { message: text, statusCode };
      }
    }
  } catch {
    // Ignore and use fallback below.
  }

  return { message: fallback, statusCode };
}

export async function runBackgroundSync(): Promise<SyncState> {
  const network = await Network.getNetworkStateAsync();
  const db = await getDatabase();
  const pending = await db.getAllAsync<{
    id: string;
    entity_type: string;
    entity_id: string;
    operation: string;
    payload_json: string;
    idempotency_key: string;
    attempt_count: number;
  }>("SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 25");

  const state: SyncState = {
    isOnline: Boolean(network.isConnected && network.isInternetReachable !== false),
    isConfigured: isSupabaseConfigured,
    isAuthenticated: false,
    pendingCount: pending.length,
    failedCount: 0,
    lastRunAt: new Date().toISOString(),
  };

  if (!state.isConfigured || !supabase) {
    return { ...state, skippedReason: 'not_configured' };
  }

  if (!state.isOnline) {
    return { ...state, skippedReason: 'offline' };
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    return {
      ...state,
      skippedReason: 'not_authenticated',
      lastError: sessionError?.message ?? 'No active Supabase session',
    };
  }

  let failedCount = 0;
  let firstError: string | undefined;

  for (const item of pending) {
    try {
      const { error } = await supabase.functions.invoke('sync-upsert', {
        body: {
          entityType: item.entity_type,
          entityId: item.entity_id,
          operation: item.operation,
          idempotencyKey: item.idempotency_key,
          payload: JSON.parse(item.payload_json),
        },
      });
      if (error) {
        throw error;
      }
      await db.runAsync("UPDATE sync_queue SET status = 'synced', updated_at = ? WHERE id = ?", [
        new Date().toISOString(),
        item.id,
      ]);
    } catch (error) {
      const parsed = await parseSyncError(error);
      const message = parsed.message;

      if (message.includes('sync_events_idempotency_key_key')) {
        await db.runAsync("UPDATE sync_queue SET status = 'synced', last_error = NULL, updated_at = ? WHERE id = ?", [
          new Date().toISOString(),
          item.id,
        ]);
        continue;
      }

      failedCount += 1;
      if (!firstError) {
        firstError = message;
      }
      await db.runAsync(
        "UPDATE sync_queue SET status = 'pending', attempt_count = attempt_count + 1, last_error = ?, updated_at = ? WHERE id = ?",
        [message, new Date().toISOString(), item.id],
      );

      if (parsed.statusCode === 401 || parsed.statusCode === 403) {
        return {
          ...state,
          isAuthenticated: true,
          skippedReason: 'not_authenticated',
          failedCount,
          lastError: message,
        };
      }
    }
  }

  const remaining = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'",
  );
  return {
    ...state,
    isAuthenticated: true,
    pendingCount: remaining?.count ?? 0,
    failedCount,
    lastError: firstError,
  };
}
