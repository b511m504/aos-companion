import { patchNfcPipelineMetrics } from '../nfcRuntime/nfcBridgeHeartbeat.js'
import { runtimeClock } from './runtimeClock.js'

const MAX_ENTRIES = 128

/** @type {Array<Record<string, unknown>>} */
const entries = []
let activeReplaySessionId = ''
let lastJournalPressureLogAt = 0

let resolvedTotal = 0
let rejectedTotal = 0
let failedTotal = 0
let invariantWarningTotal = 0
let totalTransitions = 0

function syncOverlayMetrics() {
  patchNfcPipelineMetrics({
    runtimeJournalSize: entries.length,
    runtimeJournalResolved: resolvedTotal,
    runtimeJournalRejections: rejectedTotal,
    runtimeJournalFailed: failedTotal,
    runtimeJournalTotal: totalTransitions,
    runtimeInvariantWarningTotal: invariantWarningTotal,
  })
}

function maybeJournalPressureWatchdog() {
  if (entries.length < 120) return
  const now = runtimeClock.now()
  if (now - lastJournalPressureLogAt < 6000) return
  lastJournalPressureLogAt = now
  entries.push({
    t: now,
    outcome: 'diag',
    kind: 'watchdog_journal_pressure',
    depth: entries.length,
  })
  while (entries.length > MAX_ENTRIES) entries.shift()
}

/**
 * Lightweight diagnostic / phase events (do not advance transition counters).
 * @param {string} kind e.g. `subscriber_error`, `dispatch_phase`
 * @param {Record<string, unknown>} [payload]
 */
export function journalRuntimeEvent(kind, payload = {}) {
  const p = payload && typeof payload === 'object' ? payload : { detail: payload }
  entries.push({
    t: runtimeClock.now(),
    outcome: 'diag',
    ...p,
    kind: String(kind || 'unknown'),
  })
  while (entries.length > MAX_ENTRIES) entries.shift()
  syncOverlayMetrics()
  maybeJournalPressureWatchdog()
}

/**
 * @param {{ action?: object, outcome: string, reason?: string }} rec
 */
export function journalRuntimeTransition(rec) {
  entries.push({
    t: runtimeClock.now(),
    outcome: rec.outcome,
    type: rec.action?.type,
    transactionId: rec.action?.transactionId,
    uid: rec.action?.uid,
    actionSequence: rec.action?.actionSequence,
    runtimeEpoch: rec.action?.runtimeEpoch,
    reason: rec.reason,
    stateHash: rec.stateHash,
    sourcePath: rec.action?.payload?.sourcePath || '',
    replayed: Boolean(rec.replayed),
    replaySessionId: rec.replaySessionId || activeReplaySessionId || '',
    originatedFromSuspendResume: Boolean(rec.originatedFromSuspendResume),
  })
  while (entries.length > MAX_ENTRIES) entries.shift()
  totalTransitions += 1
  if (rec.outcome === 'resolved') resolvedTotal += 1
  if (rec.outcome === 'rejected') rejectedTotal += 1
  if (rec.outcome === 'failed') failedTotal += 1
  syncOverlayMetrics()
  maybeJournalPressureWatchdog()
}

/** @param {number} n */
export function journalInvariantWarnings(n) {
  if (n > 0) {
    invariantWarningTotal += n
    syncOverlayMetrics()
  }
}

export function getRuntimeJournalSnapshot() {
  return [...entries]
}

export function resetRuntimeJournalCounters() {
  resolvedTotal = 0
  rejectedTotal = 0
  failedTotal = 0
  totalTransitions = 0
  invariantWarningTotal = 0
  entries.length = 0
  syncOverlayMetrics()
}

export function setRuntimeReplaySessionId(id) {
  activeReplaySessionId = String(id || '')
}
