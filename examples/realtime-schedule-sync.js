/**
 * Realtime Schedule Synchronization
 *
 * Simplified public example based on FieldOS installation scheduling.
 *
 * Supabase Realtime is the primary update path. A small polling loop is
 * intentionally kept as a reliability fallback for weak cellular service,
 * sleeping mobile browsers, or missed websocket events.
 */

export function createScheduleSync({
  supabase,
  fetchSchedule,
  renderSchedule,
  pollIntervalMs = 10000,
}) {
  let channel = null;
  let pollTimer = null;
  let debounceTimer = null;

  let refreshRunning = false;
  let refreshPending = false;

  async function refresh() {
    if (refreshRunning) {
      refreshPending = true;
      return;
    }

    refreshRunning = true;

    try {
      const schedule = await fetchSchedule();
      renderSchedule(schedule);
    } finally {
      refreshRunning = false;

      if (refreshPending) {
        refreshPending = false;
        queueRefresh(100);
      }
    }
  }

  function queueRefresh(delayMs = 250) {
    clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      refresh().catch(console.error);
    }, delayMs);
  }

  function startPoll() {
    clearInterval(pollTimer);

    pollTimer = setInterval(() => {
      if (
        document.visibilityState === 'visible' &&
        navigator.onLine !== false
      ) {
        queueRefresh(0);
      }
    }, pollIntervalMs);
  }

  function start() {
    stop();
    startPoll();

    if (!supabase || navigator.onLine === false) {
      return;
    }

    channel = supabase
      .channel(`schedule-sync-${Math.random().toString(36).slice(2)}`)

      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'installation_slots',
        },
        () => queueRefresh(100)
      )

      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'installation_bookings',
        },
        () => queueRefresh(100)
      )

      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        () => queueRefresh(100)
      )

      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          queueRefresh(0);
        }

        if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          // Polling is already running and becomes the fallback path.
          console.warn(
            'Realtime schedule channel unavailable; polling remains active.'
          );
        }
      });
  }

  function stop() {
    clearTimeout(debounceTimer);
    clearInterval(pollTimer);

    debounceTimer = null;
    pollTimer = null;

    if (channel) {
      try {
        supabase.removeChannel(channel);
      } catch {
        // Cleanup should not block the application.
      }
    }

    channel = null;
  }

  const handleOnline = () => {
    start();
  };

  const handleVisibility = () => {
    if (
      document.visibilityState === 'visible' &&
      navigator.onLine !== false
    ) {
      queueRefresh(0);
    }
  };

  window.addEventListener('online', handleOnline);
  document.addEventListener('visibilitychange', handleVisibility);

  return {
    start,
    stop() {
      stop();
      window.removeEventListener('online', handleOnline);
      document.removeEventListener(
        'visibilitychange',
        handleVisibility
      );
    },
    refresh: queueRefresh,
  };
}
