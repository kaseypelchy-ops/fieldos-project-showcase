/**
 * Offline Synchronization Queue
 *
 * Simplified public example based on FieldOS mobile field behavior.
 *
 * Work that cannot reach the database is persisted in the browser and
 * replayed sequentially when connectivity returns.
 */

const STORAGE_KEY = 'field_app_offline_queue_v1';

function queueId() {
  return `oq_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

export function readQueue() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(tasks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks || []));
}

export function queueOfflineRpc({ rpc, payload, label }) {
  const tasks = readQueue();

  tasks.push({
    id: queueId(),
    type: 'rpc',
    rpc,
    payload: payload || {},
    label: label || rpc,
    created_at: new Date().toISOString(),
    attempts: 0,
    last_error: null,
  });

  writeQueue(tasks);

  return tasks.length;
}

function normalizeRpcResult(data) {
  if (Array.isArray(data)) {
    return data[0] || {};
  }

  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  return data && typeof data === 'object' ? data : {};
}

async function executeTask(supabase, task) {
  if (!task.rpc) {
    throw new Error('Unsupported offline task type.');
  }

  const { data, error } = await supabase.rpc(task.rpc, {
    p_payload: task.payload || {},
  });

  if (error) throw error;

  return normalizeRpcResult(data);
}

/**
 * Tasks are intentionally replayed one at a time.
 *
 * This makes queue state predictable and avoids sending multiple dependent
 * field operations concurrently after a device reconnects.
 */
export async function processOfflineQueue({
  supabase,
  onTaskSynced,
  onQueueChanged,
}) {
  if (navigator.onLine === false) {
    return {
      complete: false,
      remaining: readQueue().length,
    };
  }

  const queue = readQueue();

  if (!queue.length) {
    return {
      complete: true,
      remaining: 0,
    };
  }

  const remaining = [];
  let synced = 0;

  for (const task of queue) {
    try {
      const result = await executeTask(supabase, task);

      synced += 1;
      await onTaskSynced?.(task, result);
    } catch (error) {
      remaining.push({
        ...task,
        attempts: Number(task.attempts || 0) + 1,
        last_error: String(error?.message || error || 'Sync failed')
          .slice(0, 500),
      });
    }
  }

  writeQueue(remaining);
  await onQueueChanged?.(remaining);

  return {
    complete: remaining.length === 0,
    synced,
    remaining: remaining.length,
  };
}

/**
 * Production FieldOS also reconciles schedule and address state after queue
 * completion so the local phone reflects the authoritative database state.
 */
export function startAutomaticSync(options) {
  const sync = () => {
    if (navigator.onLine !== false) {
      processOfflineQueue(options).catch(console.error);
    }
  };

  window.addEventListener('online', sync);

  return () => {
    window.removeEventListener('online', sync);
  };
}
