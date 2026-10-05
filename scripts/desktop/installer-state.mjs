// SPDX-License-Identifier: MPL-2.0
/**
 * Host-side installer state contract. Not an installer and not a renderer IPC API.
 * Only the native installation host may supply events. A renderer must not be
 * allowed to provide exit codes, verification results or executable paths.
 * Percentages describe a stage, never an invented estimate of total work.
 */
const stages = ['preparing', 'extracting', 'installing', 'verifying'];
const active = new Set(['running', 'cancelling']);
const errorCodes = new Set([
  'permission-denied',
  'disk-full',
  'runtime-unavailable',
  'verification-failed',
  'engine-failed',
]);

export function idleInstallation() {
  return {
    runId: null,
    sequence: -1,
    phase: 'idle',
    stage: null,
    percent: null,
    error: null,
    canCancel: false,
    launchAllowed: false,
  };
}

export function beginInstallation(previous, runId) {
  if (active.has(previous.phase)) throw new Error('Installation is still active');
  if (typeof runId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(runId) || runId === previous.runId)
    throw new Error('A fresh installation run ID is required');
  return {
    ...idleInstallation(),
    runId,
    phase: 'running',
    stage: 'preparing',
    canCancel: true,
  };
}

/** This requests cancellation; only the host's exit event settles it. */
export function requestCancellation(state) {
  if (state.phase !== 'running' || !state.canCancel) return state;
  return { ...state, phase: 'cancelling', canCancel: false };
}

export function receiveInstallerEvent(state, event) {
  if (
    !active.has(state.phase) ||
    !event ||
    typeof event !== 'object' ||
    event.runId !== state.runId ||
    !Number.isSafeInteger(event.sequence) ||
    event.sequence <= state.sequence
  )
    return state;

  if (event.type === 'stage') {
    const next = stages.indexOf(event.stage);
    if (next < 0 || next < stages.indexOf(state.stage)) return state;
    return {
      ...state,
      sequence: event.sequence,
      stage: event.stage,
      percent: next === stages.indexOf(state.stage) ? state.percent : null,
      canCancel: state.phase === 'running' && event.cancellable === true,
    };
  }

  if (event.type === 'progress') {
    if (
      event.stage !== state.stage ||
      !Number.isFinite(event.completed) ||
      !Number.isFinite(event.total) ||
      event.completed < 0 ||
      event.total <= 0 ||
      event.completed > event.total
    )
      return state;
    const percent = Math.min(99, Math.floor((event.completed / event.total) * 100));
    // Within a stage, reordered or revised counters cannot move progress backwards.
    return { ...state, sequence: event.sequence, percent: Math.max(state.percent ?? 0, percent) };
  }

  if (event.type === 'exit') {
    if (!Number.isSafeInteger(event.code)) return state;
    // Success requires both process completion and the host's post-install check.
    // Cancellation may lose a race to successful installation; report that honestly.
    const succeeded = event.code === 0 && event.verified === true;
    const cancelled = !succeeded && event.cancelled === true && state.phase === 'cancelling';
    return {
      ...state,
      sequence: event.sequence,
      phase: succeeded ? 'complete' : cancelled ? 'cancelled' : 'failed',
      percent: succeeded ? 100 : state.percent,
      error:
        succeeded || cancelled
          ? null
          : event.code === 0
            ? 'verification-failed'
            : errorCodes.has(event.error)
              ? event.error
              : 'engine-failed',
      canCancel: false,
      launchAllowed: succeeded,
    };
  }
  return state;
}
