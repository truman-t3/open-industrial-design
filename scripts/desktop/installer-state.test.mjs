// SPDX-License-Identifier: MPL-2.0
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  idleInstallation,
  beginInstallation,
  requestCancellation,
  receiveInstallerEvent as receive,
} from './installer-state.mjs';

const runId = 'install-run-001';
const begin = () => beginInstallation(idleInstallation(), runId);
const event = (fields) => ({ runId, sequence: 0, ...fields });

test('installation starts indeterminate and refuses a concurrent run', () => {
  const state = begin();
  assert.equal(state.percent, null);
  assert.equal(state.launchAllowed, false);
  assert.throws(() => beginInstallation(state, 'install-run-002'), /still active/);
  assert.throws(() => beginInstallation(idleInstallation(), ''), /run ID/);
});

test('stage progress is monotonic, capped and never grants launch permission', () => {
  let state = receive(
    begin(),
    event({ type: 'progress', stage: 'preparing', completed: 80, total: 100 }),
  );
  assert.equal(state.percent, 80);
  state = receive(
    state,
    event({ sequence: 1, type: 'progress', stage: 'preparing', completed: 20, total: 100 }),
  );
  assert.equal(state.percent, 80);
  state = receive(
    state,
    event({ sequence: 2, type: 'progress', stage: 'preparing', completed: 100, total: 100 }),
  );
  assert.equal(state.percent, 99);
  assert.equal(state.phase, 'running');
  assert.equal(state.launchAllowed, false);
  state = receive(
    state,
    event({ sequence: 3, type: 'stage', stage: 'extracting', cancellable: true }),
  );
  assert.equal(state.percent, null);
});

test('malformed, unknown, out-of-order and wrong-stage events are ignored', () => {
  const state = receive(begin(), event({ type: 'stage', stage: 'installing', cancellable: false }));
  for (const value of [
    null,
    {},
    event({ type: 'exit', code: 0, verified: true }),
    event({ sequence: 2, runId: 'another-run', type: 'exit', code: 0, verified: true }),
    event({ sequence: 2.5, type: 'exit', code: 0, verified: true }),
    event({ sequence: 2, type: 'unknown' }),
    event({ sequence: 2, type: 'stage', stage: 'extracting' }),
    event({ sequence: 2, type: 'progress', stage: 'preparing', completed: 1, total: 2 }),
    event({ sequence: 2, type: 'progress', stage: 'installing', completed: 1, total: 0 }),
    event({ sequence: 2, type: 'progress', stage: 'installing', completed: NaN, total: 2 }),
    event({ sequence: 2, type: 'progress', stage: 'installing', completed: 3, total: 2 }),
  ])
    assert.equal(receive(state, value), state);
  assert.equal(requestCancellation(state), state);
});

test('cancellation waits for host confirmation and never implies rollback', () => {
  const pending = requestCancellation(begin());
  assert.equal(pending.phase, 'cancelling');
  assert.equal(pending.launchAllowed, false);
  assert.equal(requestCancellation(pending), pending);
  assert.throws(() => beginInstallation(pending, 'install-run-002'), /still active/);
  const ended = receive(pending, event({ type: 'exit', code: 1, cancelled: true }));
  assert.equal(ended.phase, 'cancelled');
  assert.equal(ended.launchAllowed, false);
  assert.equal(
    receive(ended, event({ sequence: 2, type: 'exit', code: 0, verified: true })),
    ended,
  );
});

test('process success without verification is a failure, not success', () => {
  for (const verified of [undefined, false, 'true', 1]) {
    const ended = receive(begin(), event({ type: 'exit', code: 0, verified }));
    assert.equal(ended.phase, 'failed');
    assert.equal(ended.error, 'verification-failed');
    assert.equal(ended.launchAllowed, false);
  }
  assert.equal(
    receive(begin(), event({ type: 'exit', code: '0', verified: true })).phase,
    'running',
  );
});

test('verified success can win the cancellation race', () => {
  const ended = receive(
    requestCancellation(begin()),
    event({ type: 'exit', code: 0, verified: true }),
  );
  assert.equal(ended.phase, 'complete');
  assert.equal(ended.percent, 100);
  assert.equal(ended.launchAllowed, true);
});

test('retry rejects previous run messages and raw error data never enters UI state', () => {
  const ended = receive(
    begin(),
    event({ type: 'exit', code: 1, error: 'arbitrary backend output', log: 'private log' }),
  );
  assert.equal(ended.error, 'engine-failed');
  assert.ok(!JSON.stringify(ended).includes('private'));
  assert.throws(() => beginInstallation(ended, runId), /fresh/);
  const retry = beginInstallation(ended, 'install-run-002');
  assert.equal(
    receive(retry, event({ sequence: 99, type: 'exit', code: 0, verified: true })),
    retry,
  );
  assert.equal(
    receive(retry, { runId: retry.runId, sequence: 0, type: 'exit', code: 1, error: 'disk-full' })
      .error,
    'disk-full',
  );
});
