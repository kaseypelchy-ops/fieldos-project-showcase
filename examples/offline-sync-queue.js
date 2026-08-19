/**
 * Offline Synchronization Queue
 *
 * Simplified public example based on FieldOS mobile behavior.
 * Only connectivity-related failures should enter this queue.
 */

const STORAGE_KEY = 'fieldos_public_offline_queue_v1';

function readQueue() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue || []));
}

export function queueOfflineRpc({ rpc, payload, label }) {
  const queue = readQueue();

  queue.push({
    id: globalThis.crypto?.randomUUID?.() || `q_${Date.now()}`,
    type: 'rpc',
    rpc,
    payload,
    label: label || rpc,
    created_at: new Date().toISOString(),
    attempts: 0,
    last_error: null,
  });

  writeQueue(queue);
  return queue.length;
}

async function executeTask(supabase, task) {
  const { data, error } = await supabase.rpc(task.rpc, {
    p_payload: task.payload,
  });

  if (error) throw error;
  return data;
}

export async function processOfflineQueue({
  supabase,
  reconcileAfterSync,
  onQueueChanged,
}) {
  if (navigator.onLine === false) {
    return { complete: false, remaining: readQueue().length };
  }

  const pending = readQueue();
  const remaining = [];
  let synced = 0;

  for (const task of pending) {
    try {
      await executeTask(supabase, task);
      synced += 1;
    } catch (error) {
      remaining.push({
        ...task,
        attempts: Number(task.attempts || 0) + 1,
        last_error: String(error?.message || error || 'Sync failed').slice(0, 500),
      });
    }
  }

  writeQueue(remaining);
  onQueueChanged?.(remaining);

  // Shared state is always re-read after replay; local assumptions are stale.
  await reconcileAfterSync?.();

  return {
    complete: remaining.length === 0,
    synced,
    remaining: remaining.length,
  };
}

export function startAutomaticSync(options) {
  const sync = () => {
    if (navigator.onLine !== false) {
      processOfflineQueue(options).catch(console.error);
    }
  };

  window.addEventListener('online', sync);
  window.addEventListener('focus', sync);

  return () => {
    window.removeEventListener('online', sync);
    window.removeEventListener('focus', sync);
  };
}
