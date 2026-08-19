/**
 * PWA Update Coordinator
 *
 * Simplified public example based on FieldOS release/update safeguards.
 * The goal is to converge on the required build without destroying pending
 * field work or trapping a user in an infinite reload loop.
 */

const RELOAD_GUARD_KEY = 'fieldos_update_reload_guard_public_v1';
const GUARD_WINDOW_MS = 5 * 60 * 1000;

function readGuard() {
  try {
    return JSON.parse(sessionStorage.getItem(RELOAD_GUARD_KEY) || 'null');
  } catch {
    return null;
  }
}

function writeGuard(build) {
  sessionStorage.setItem(
    RELOAD_GUARD_KEY,
    JSON.stringify({ build, at: Date.now() })
  );
}

function clearGuard() {
  sessionStorage.removeItem(RELOAD_GUARD_KEY);
}

function alreadyReloadedRecently(targetBuild) {
  const guard = readGuard();

  return Boolean(
    guard &&
    guard.build === targetBuild &&
    Number.isFinite(guard.at) &&
    Date.now() - guard.at < GUARD_WINDOW_MS
  );
}

export async function checkRequiredBuild({
  currentBuild,
  hasPendingOfflineWork,
  fetchRequiredBuild,
  showUpdateDeferred,
  showDeploymentStillSettling,
}) {
  const targetBuild = await fetchRequiredBuild();

  if (!targetBuild || targetBuild === currentBuild) {
    clearGuard();
    return { status: 'current', build: currentBuild };
  }

  if (hasPendingOfflineWork()) {
    showUpdateDeferred?.(targetBuild);
    return { status: 'deferred', targetBuild };
  }

  if (alreadyReloadedRecently(targetBuild)) {
    // The server may still be serving a partially deployed asset set.
    // Stop repeated reloads and allow a later retry instead.
    showDeploymentStillSettling?.(targetBuild);
    return { status: 'guarded', targetBuild };
  }

  writeGuard(targetBuild);
  window.location.reload();

  return { status: 'reloading', targetBuild };
}
