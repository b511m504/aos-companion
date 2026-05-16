import { patchNfcPipelineMetrics } from '../nfcRuntime/nfcBridgeHeartbeat.js'

const selectorStats = new Map()
let totalRecomputes = 0
let stormWindowStart = 0
let stormCount = 0

function sync() {
  patchNfcPipelineMetrics({
    selectorRecomputeCount: totalRecomputes,
    selectorMemoCacheSize: selectorStats.size,
  })
}

export function recordSelectorInvalidate(selectorName, wasRecompute) {
  const now = Date.now()
  if (!stormWindowStart || now - stormWindowStart > 1000) {
    stormWindowStart = now
    stormCount = 0
  }
  if (wasRecompute) {
    totalRecomputes += 1
    stormCount += 1
    selectorStats.set(selectorName, (selectorStats.get(selectorName) || 0) + 1)
  }
  if (stormCount > 80) {
    console.warn('SPEARHEAD_RUNTIME_SELECTOR invalidation_storm', {
      windowMs: now - stormWindowStart,
      recomputes: stormCount,
    })
  }
  sync()
}

export function getSelectorInstrumentationSnapshot() {
  return {
    totalRecomputes,
    selectorMemoCacheSize: selectorStats.size,
    hotSelectors: [...selectorStats.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count })),
  }
}

