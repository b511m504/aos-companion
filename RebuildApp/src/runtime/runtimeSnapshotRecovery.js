/**
 * Export / import deterministic snapshot bundles for recovery and offline replay.
 */

import { replayRuntimeSession } from './replayRuntimeSession.js'
import { hashRuntimeState } from './hashRuntimeState.js'
import { assertSerializable } from './assertSerializable.js'

export const RUNTIME_SNAPSHOT_BUNDLE_VERSION = 1

/**
 * @param {object} state store getState() snapshot
 * @param {object[]} [actions] optional recorded runtime actions for replay
 * @param {{ hashMode?: 'shape' | 'full' }} [opts]
 */
export function exportRuntimeSnapshotBundle(state, actions = [], opts = {}) {
  const hashMode = opts.hashMode === 'full' ? 'full' : 'shape'
  const baseline = state && typeof state === 'object' ? JSON.parse(JSON.stringify(state)) : {}
  const actionList = Array.isArray(actions) ? actions.map((a) => JSON.parse(JSON.stringify(a))) : []
  return {
    v: RUNTIME_SNAPSHOT_BUNDLE_VERSION,
    exportedAt: Date.now(),
    baselineHash: hashRuntimeState(baseline, { mode: hashMode }),
    expectedFinalHash: hashRuntimeState(
      replayRuntimeSession({ initialState: baseline, actions: actionList, hashMode, skipRuntimeGuards: false, skipDomainGuard: false }).finalState,
      { mode: hashMode }
    ),
    baseline,
    actions: actionList,
    hashMode,
  }
}

/**
 * @param {unknown} bundle
 * @returns {{ ok: boolean, bundle?: object, errors?: string[] }}
 */
export function parseRuntimeSnapshotBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') return { ok: false, errors: ['not_object'] }
  const v = Number(bundle.v)
  if (v !== RUNTIME_SNAPSHOT_BUNDLE_VERSION) return { ok: false, errors: [`bad_version:${bundle.v}`] }
  const ser = assertSerializable(bundle, { path: 'bundle', maxDepth: 48 })
  if (!ser.ok) return { ok: false, errors: ser.errors }
  return { ok: true, bundle }
}

/**
 * Replay actions from a snapshot bundle (baseline + actions).
 * @param {object} bundle from exportRuntimeSnapshotBundle / parseRuntimeSnapshotBundle
 * @param {Parameters<typeof replayRuntimeSession>[0]} [extra]
 */
export function replayFromSnapshotBundle(bundle, extra = {}) {
  const parsed = parseRuntimeSnapshotBundle(bundle)
  if (!parsed.ok || !parsed.bundle) {
    return {
      ok: false,
      errors: parsed.errors || ['parse_failed'],
      finalState: null,
      finalHash: '',
      transitionCount: 0,
    }
  }
  const b = parsed.bundle
  const hashMode = b.hashMode === 'full' ? 'full' : 'shape'
  const out = replayRuntimeSession({
    initialState: b.baseline,
    actions: b.actions || [],
    hashMode,
    ...extra,
  })
  const storedBaselineHash = String(b.baselineHash || '')
  const baselineIntegrity =
    !storedBaselineHash || hashRuntimeState(b.baseline, { mode: hashMode }) === storedBaselineHash
  const expectedFinalHash = b.expectedFinalHash != null ? String(b.expectedFinalHash) : ''
  const finalHashMatch = !expectedFinalHash || expectedFinalHash === out.finalHash
  const parity = replayRuntimeSession({
    initialState: JSON.parse(JSON.stringify(b.baseline)),
    actions: JSON.parse(JSON.stringify(b.actions || [])),
    hashMode,
    ...extra,
  })
  const replayParity = out.finalHash === parity.finalHash && out.transitionCount === parity.transitionCount
  return {
    ok: baselineIntegrity && finalHashMatch && replayParity,
    hashMatch: finalHashMatch,
    baselineIntegrity,
    replayParity,
    expectedHash: expectedFinalHash || storedBaselineHash,
    ...out,
  }
}
