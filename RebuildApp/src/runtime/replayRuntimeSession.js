/**
 * Pure session replay: no store subscribers, no DOM effects — policy simulation only.
 * Use for regression / hash verification against recorded actions.
 */

import { resolveRuntimeDomain } from './runtimeDomainRouter.js'
import { assertRuntimeTransition } from './runtimeGuards.js'
import { validateRuntimeTransitionResultShape } from './runtimeTransitionShape.js'
import { simulateReplayEffectsOnly } from './effects/scheduler.js'
import { hashRuntimeState } from './hashRuntimeState.js'

function deepCloneState(s) {
  try {
    return JSON.parse(JSON.stringify(s))
  } catch {
    try {
      if (typeof structuredClone === 'function') return structuredClone(s)
    } catch {
      /* ignore */
    }
    return { ...(s && typeof s === 'object' ? s : {}) }
  }
}

function normalizeAction(state, action) {
  return {
    ...action,
    runtimeEpoch:
      action?.runtimeEpoch != null ? Number(action.runtimeEpoch) : Number(state?.runtimeEpoch || 0),
    actionSequence:
      action?.actionSequence != null
        ? Number(action.actionSequence)
        : Number(state?.runtimeActionSequence || 0) + 1,
  }
}

/**
 * @param {{
 *   initialState: object,
 *   actions: object[],
 *   domain?: { handles: (t: string) => boolean, guard?: Function, transition: Function } | null,
 *   skipRuntimeGuards?: boolean,
 *   skipDomainGuard?: boolean,
 *   hashMode?: 'shape' | 'full',
 * }} args
 * @returns {{
 *   finalState: object,
 *   finalHash: string,
 *   transitionCount: number,
 *   effectSimTotals: { executed: number, simulated: number, suppressed: number },
 *   steps: Array<{ index: number, type?: string, skipped?: boolean, reason?: string }>,
 * }}
 */
export function replayRuntimeSession(args = {}) {
  const initialState = args.initialState && typeof args.initialState === 'object' ? args.initialState : {}
  const actions = Array.isArray(args.actions) ? args.actions : []
  const domainFilter = args.domain || null
  const skipRuntimeGuards = Boolean(args.skipRuntimeGuards)
  const skipDomainGuard = Boolean(args.skipDomainGuard)
  const hashMode = args.hashMode === 'full' ? 'full' : 'shape'

  let state = deepCloneState(initialState)
  let transitionCount = 0
  const effectTotals = { executed: 0, simulated: 0, suppressed: 0 }
  /** @type {Array<{ index: number, type?: string, skipped?: boolean, reason?: string }>} */
  const steps = []

  actions.forEach((raw, index) => {
    const normalized = normalizeAction(state, raw)
    const type = String(normalized?.type || '')
    const domain =
      domainFilter && typeof domainFilter.handles === 'function' && domainFilter.handles(type)
        ? domainFilter
        : !domainFilter
          ? resolveRuntimeDomain(type)
          : null

    if (!domain || typeof domain.transition !== 'function') {
      steps.push({ index, type, skipped: true, reason: domainFilter ? 'domain_filter_mismatch' : 'no_domain' })
      return
    }

    if (!skipRuntimeGuards) {
      const guard = assertRuntimeTransition(state, normalized)
      if (!guard.ok) {
        steps.push({ index, type, skipped: true, reason: `runtime_guard:${guard.reason}` })
        return
      }
    }
    if (!skipDomainGuard && typeof domain.guard === 'function') {
      const dg = domain.guard(state, normalized)
      if (!dg.ok) {
        steps.push({ index, type, skipped: true, reason: `domain_guard:${dg.reason}` })
        return
      }
    }

    const transitionResult = domain.transition(state, normalized)
    const shapeCode = validateRuntimeTransitionResultShape(transitionResult)
    if (shapeCode) {
      steps.push({ index, type, skipped: true, reason: `invalid_shape:${shapeCode}` })
      return
    }
    if (!transitionResult?.handled) {
      steps.push({ index, type, skipped: true, reason: 'not_handled' })
      return
    }

    if (transitionResult.patch && typeof transitionResult.patch === 'object') {
      Object.assign(state, transitionResult.patch)
    }
    const sim = simulateReplayEffectsOnly(transitionResult.effects, {
      action: normalized,
      replayed: true,
      silent: true,
    })
    effectTotals.executed += sim.executed
    effectTotals.simulated += sim.simulated
    effectTotals.suppressed += sim.suppressed
    transitionCount += 1
    steps.push({ index, type, skipped: false })
  })

  const finalHash = hashRuntimeState(state, { mode: hashMode })
  return {
    finalState: state,
    finalHash,
    transitionCount,
    effectSimTotals: effectTotals,
    steps,
  }
}
