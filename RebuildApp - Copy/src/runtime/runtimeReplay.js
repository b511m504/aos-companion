import { hashRuntimeStateShape } from './runtimeStateHash.js'
import { recordReplayPerf } from './runtimePerf.js'
import { setRuntimeReplaySessionId } from './runtimeEventJournal.js'
import { runtimeClock } from './runtimeClock.js'
import { compressReplayEvents, expandReplayEvents } from './runtimeReplayCompression.js'
import { updateRuntimeMemoryPressure } from './runtimeMemory.js'

let replaySessionSeq = 0

/**
 * Deterministic replay of recorded runtime actions (in-memory / tests).
 * @param {{ dispatchRuntimeAction: (action: object) => object }} store
 * @param {object[]} events
 * @param {{ verifyDeterminism?: boolean }} options
 * @returns {object[]}
 */
export function replayRuntimeActions(store, events, options = {}) {
  if (!store || typeof store.dispatchRuntimeAction !== 'function') {
    console.warn('SPEARHEAD_RUNTIME_REPLAY missing dispatchRuntimeAction')
    return []
  }
  const verifyDeterminism = Boolean(options?.verifyDeterminism)
  const checkpointInterval = Math.max(1, Number(options?.checkpointInterval || 10))
  replaySessionSeq += 1
  const replaySessionId = `rpl_${runtimeClock.now()}_${replaySessionSeq}`
  setRuntimeReplaySessionId(replaySessionId)
  const raw = Array.isArray(events) ? events : []
  const maybeCompressed = options?.compress ? compressReplayEvents(raw) : raw
  const list = options?.compress ? expandReplayEvents(maybeCompressed) : maybeCompressed
  updateRuntimeMemoryPressure({ replayCacheSize: maybeCompressed.length })
  const out = []
  const seenBySeq = new Map()
  const checkpointHashes = new Map()
  let earliestCheckpointDivergence = null
  const t0 = runtimeClock.now()
  const batchSize =
    typeof store.dispatchRuntimeActionBatch === 'function'
      ? Math.max(1, Number(options?.batchSize || 1))
      : 1

  function verify(ev, res) {
    if (!(verifyDeterminism && res?.handled)) return
    const seq = Number(ev?.actionSequence || 0)
    const hash = hashRuntimeStateShape(store.getState())
    if (ev?.expectedStateHash && ev.expectedStateHash !== hash) {
      console.warn('SPEARHEAD_RUNTIME_REPLAY divergence', {
        actionSequence: seq,
        expectedHash: ev.expectedStateHash,
        actualHash: hash,
      })
      if (typeof store.attemptRuntimeRecoveryHook === 'function') {
        store.attemptRuntimeRecoveryHook({
          reason: 'replay_divergence',
          action: ev,
          runtimeEpoch: store.getState()?.runtimeEpoch,
        })
      }
    }
    if (seq <= 0) return
    const prior = seenBySeq.get(seq)
    if (prior && prior !== hash) {
      console.warn('SPEARHEAD_RUNTIME_REPLAY divergence', {
        actionSequence: seq,
        previousHash: prior,
        nextHash: hash,
      })
    } else if (!prior) {
      seenBySeq.set(seq, hash)
    }
    if (seq % checkpointInterval === 0 && ev?.expectedCheckpointHash && ev.expectedCheckpointHash !== hash) {
      console.warn('SPEARHEAD_RUNTIME_REPLAY checkpoint_divergence', {
        actionSequence: seq,
        expectedCheckpointHash: ev.expectedCheckpointHash,
        actualHash: hash,
      })
      if (typeof store.attemptRuntimeRecoveryHook === 'function') {
        store.attemptRuntimeRecoveryHook({
          reason: 'checkpoint_divergence',
          action: ev,
          runtimeEpoch: store.getState()?.runtimeEpoch,
        })
      }
    }
    if (seq % checkpointInterval === 0) {
      const priorCheckpoint = checkpointHashes.get(seq)
      if (priorCheckpoint && priorCheckpoint !== hash) {
        if (earliestCheckpointDivergence == null || seq < earliestCheckpointDivergence) {
          earliestCheckpointDivergence = seq
        }
        console.warn('SPEARHEAD_RUNTIME_REPLAY checkpoint_divergence', {
          actionSequence: seq,
          previousCheckpointHash: priorCheckpoint,
          actualHash: hash,
        })
      } else if (!priorCheckpoint) {
        checkpointHashes.set(seq, hash)
      }
    }
  }

  if (batchSize === 1) {
    for (const ev of list) {
      try {
        const res = store.dispatchRuntimeAction(ev, {
          replayed: true,
          replaySessionId,
          originatedFromSuspendResume: Boolean(options?.originatedFromSuspendResume),
        })
        out.push(res)
        verify(ev, res)
      } catch (e) {
        out.push({ handled: true, outcome: 'failed', error: String(e?.message || e) })
      }
    }
  } else {
    for (let i = 0; i < list.length; i += batchSize) {
      const chunk = list.slice(i, i + batchSize)
      const resList = store.dispatchRuntimeActionBatch(chunk, {
        replayed: true,
        replaySessionId,
        originatedFromSuspendResume: Boolean(options?.originatedFromSuspendResume),
      })
      for (let j = 0; j < chunk.length; j += 1) {
        const ev = chunk[j]
        const res = resList[j]
        out.push(res)
        verify(ev, res)
      }
    }
  }
  const elapsedSec = Math.max(0.001, (runtimeClock.now() - t0) / 1000)
  recordReplayPerf(list.length / elapsedSec)
  if (earliestCheckpointDivergence != null) {
    console.warn('SPEARHEAD_RUNTIME_REPLAY divergence', {
      earliestCheckpointDivergence,
      checkpointInterval,
    })
  }
  updateRuntimeMemoryPressure({ replayCacheSize: maybeCompressed.length })
  setRuntimeReplaySessionId('')
  return out
}
