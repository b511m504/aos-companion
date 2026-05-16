import { patchNfcPipelineMetrics } from '../nfcRuntime/nfcBridgeHeartbeat.js'

const perf = {
  transitionCount: 0,
  transitionTotalMs: 0,
  transitionWorstMs: 0,
  selectorRecomputeCount: 0,
  replayActionsPerSec: 0,
  queueDrainCount: 0,
  queueDrainTotalMs: 0,
}

function updateOverlay() {
  const avgTransitionMs =
    perf.transitionCount > 0 ? perf.transitionTotalMs / perf.transitionCount : 0
  patchNfcPipelineMetrics({
    avgTransitionMs,
    worstTransitionMs: perf.transitionWorstMs,
    replayActionsPerSec: perf.replayActionsPerSec,
    selectorRecomputeCount: perf.selectorRecomputeCount,
    avgQueueDrainLatencyMs:
      perf.queueDrainCount > 0 ? perf.queueDrainTotalMs / perf.queueDrainCount : 0,
  })
}

export function recordTransitionPerf(ms, action) {
  const v = Math.max(0, Number(ms) || 0)
  perf.transitionCount += 1
  perf.transitionTotalMs += v
  if (v > perf.transitionWorstMs) perf.transitionWorstMs = v
  if (v > 16) {
    console.warn('SPEARHEAD_RUNTIME_PERF slow_transition', {
      ms: Math.round(v),
      type: action?.type,
      tx: action?.transactionId,
    })
  }
  updateOverlay()
}

export function recordSelectorPerf(name, ms) {
  const v = Math.max(0, Number(ms) || 0)
  perf.selectorRecomputeCount += 1
  if (v > 4) {
    console.warn('SPEARHEAD_RUNTIME_PERF slow_selector', { selector: name, ms: Math.round(v) })
  }
  updateOverlay()
}

export function recordReplayPerf(actionsPerSec) {
  perf.replayActionsPerSec = Math.max(0, Number(actionsPerSec) || 0)
  updateOverlay()
}

export function recordQueueDrainLatency(ms) {
  const v = Math.max(0, Number(ms) || 0)
  perf.queueDrainCount += 1
  perf.queueDrainTotalMs += v
  updateOverlay()
}

