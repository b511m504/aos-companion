import { patchNfcPipelineMetrics } from '../../nfcRuntime/nfcBridgeHeartbeat.js'
import { stampEffectDescriptors } from '../effectDescriptor.js'
import { shouldExecuteEffect, shouldSimulateEffect } from './policies.js'

const pendingEffects = []
let executedEffects = 0
let simulatedEffects = 0
let suppressedEffects = 0

function syncMetrics() {
  patchNfcPipelineMetrics({
    runtimeEffectPending: pendingEffects.length,
    runtimeEffectExecuted: executedEffects,
    runtimeEffectSimulated: simulatedEffects,
    runtimeEffectSuppressed: suppressedEffects,
  })
}

function cssEscapeSelector(id) {
  const s = String(id || '')
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s)
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function runEffect(effect, ctx) {
  const payload = effect?.payload || {}
  switch (effect?.type) {
    case 'OVERLAY_NOTIFY':
      if (!ctx?.silent) {
        console.warn('SPEARHEAD_RUNTIME_EFFECT overlay_notify', {
          message: payload?.message || '',
          tx: ctx?.action?.transactionId,
        })
      }
      break
    case 'NFC_UI_SCROLL_PACKAGE_NFC': {
      const entityId = String(payload?.entityId || '').trim()
      if (typeof requestAnimationFrame === 'undefined' || !entityId) break
      requestAnimationFrame(() => {
        const sel = `.pkg-nfc-hit[data-package-nfc-entity="${cssEscapeSelector(entityId)}"]`
        const el = typeof document !== 'undefined' ? document.querySelector(sel) : null
        el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      })
      break
    }
    case 'NFC_UI_SCROLL_ENTITY': {
      const entityId = String(payload?.entityId || '').trim()
      if (typeof requestAnimationFrame === 'undefined' || !entityId) break
      requestAnimationFrame(() => {
        const sel = `[data-entity-card="${cssEscapeSelector(entityId)}"]`
        const el = typeof document !== 'undefined' ? document.querySelector(sel) : null
        el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      })
      break
    }
    case 'PERSIST_SYNC':
      // deterministic no-op hook; persistence I/O is intentionally outside pure transition
      break
    default:
      break
  }
}

/**
 * Pure policy simulation for offline replay (no DOM, no queue).
 * @param {object[]} effects
 * @param {object} [ctx]
 */
export function simulateReplayEffectsOnly(effects, ctx = {}) {
  const list = Array.isArray(effects) ? effects : []
  const replayCtx = { ...ctx, replayed: true }
  let executed = 0
  let simulated = 0
  let suppressed = 0
  for (const raw of list) {
    const effect = {
      type: String(raw?.type || ''),
      replayPolicy: String(raw?.replayPolicy || 'simulate'),
      payload: raw?.payload && typeof raw.payload === 'object' ? raw.payload : {},
    }
    if (shouldExecuteEffect(effect, replayCtx)) executed += 1
    else if (shouldSimulateEffect(effect, replayCtx)) simulated += 1
    else suppressed += 1
  }
  return { executed, simulated, suppressed, total: executed + simulated + suppressed }
}

export function scheduleRuntimeEffects(effects, ctx = {}) {
  const action = ctx?.action && typeof ctx.action === 'object' ? ctx.action : {}
  const list = stampEffectDescriptors(effects, action)
  for (const effect of list) {
    pendingEffects.push({
      type: String(effect?.type || ''),
      replayPolicy: String(effect?.replayPolicy || 'simulate'),
      payload: effect?.payload && typeof effect.payload === 'object' ? { ...effect.payload } : {},
      effectId: effect.effectId,
      transactionId: effect.transactionId,
      causedByAction: effect.causedByAction,
    })
  }
  syncMetrics()

  while (pendingEffects.length > 0) {
    const effect = pendingEffects.shift()
    if (shouldExecuteEffect(effect, ctx)) {
      runEffect(effect, ctx)
      executedEffects += 1
    } else if (shouldSimulateEffect(effect, ctx)) {
      simulatedEffects += 1
      if (!ctx?.silent) {
        console.warn('SPEARHEAD_RUNTIME_EFFECT simulated', {
          type: effect.type,
          tx: ctx?.action?.transactionId,
        })
      }
    } else {
      suppressedEffects += 1
    }
  }
  syncMetrics()
}

export function getRuntimeEffectsStats() {
  return {
    pending: pendingEffects.length,
    executed: executedEffects,
    simulated: simulatedEffects,
    suppressed: suppressedEffects,
  }
}

