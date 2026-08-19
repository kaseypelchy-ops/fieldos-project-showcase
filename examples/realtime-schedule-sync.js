/**
 * Realtime Schedule Synchronization
 *
 * Realtime provides fast change notifications; polling and focus/reconnect
 * reconciliation make the mobile UI converge after missed events.
 */

export function createScheduleSync({
  supabase,
  fetchSchedule,
  renderSchedule,
  pollIntervalMs = 10000,
}) {
  let channel;
  let pollTimer;
  let debounceTimer;
  let refreshRunning = false;
  let refreshPending = false;

  async function refresh() {
    if (refreshRunning) {
      refreshPending = true;
      return;
    }

    refreshRunning = true;

    try {
      renderSchedule(await fetchSchedule());
    } finally {
      refreshRunning = false;

      if (refreshPending) {
        refreshPending = false;
        queueRefresh(100);
      }
    }
  }

  function queueRefresh(delayMs = 200) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => refresh().catch(console.error), delayMs);
  }

  function start() {
    stop();

    pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) {
        queueRefresh(0);
      }
    }, pollIntervalMs);

    if (!supabase || navigator.onLine === false) return;

    channel = supabase
      .channel(`public-schedule-sync-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'installation_slots',
      }, () => queueRefresh(100))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'installation_bookings',
      }, () => queueRefresh(100))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') queueRefresh(0);
        if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
          console.warn('Realtime unavailable; polling remains active.');
        }
      });
  }

  function stop() {
    clearInterval(pollTimer);
    clearTimeout(debounceTimer);

    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
  }

  const onFocus = () => navigator.onLine !== false && queueRefresh(0);
  const onOnline = () => {
    start();
    queueRefresh(0);
  };

  window.addEventListener('focus', onFocus);
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') queueRefresh(0);
  });

  return { start, stop, refresh };
}
