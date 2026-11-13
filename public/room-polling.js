const PLAYING_INTERVAL = 1500;
const WAITING_INTERVAL = 3000;

export function startRoomPolling(refresh, isConnected, isPlaying) {
  let timer;
  let refreshing = false;

  function schedule() {
    clearTimeout(timer);
    const delay = isPlaying() ? PLAYING_INTERVAL : WAITING_INTERVAL;
    timer = setTimeout(poll, delay);
  }

  async function poll() {
    if (refreshing) return;
    clearTimeout(timer);
    refreshing = true;
    try {
      if (isConnected()) await refresh();
    } finally {
      refreshing = false;
      schedule();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isConnected()) void poll();
  });
  schedule();
}
