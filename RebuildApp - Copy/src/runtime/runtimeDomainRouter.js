import { entitiesDomain } from './domains/entities/index.js'
import { gameplayDomain } from './domains/gameplay/index.js'
import { assignmentsDomain } from './domains/assignments/index.js'
import { packagesDomain } from './domains/packages/index.js'
import { scenariosDomain } from './domains/scenarios/index.js'
import { sessionsDomain } from './domains/sessions/index.js'

const domains = [entitiesDomain, gameplayDomain, assignmentsDomain, packagesDomain, scenariosDomain, sessionsDomain]

export function getRuntimeDomains() {
  return domains
}

export function resolveRuntimeDomain(actionType) {
  return domains.find((d) => d.handles(actionType)) || null
}

export function getRuntimeDomainOwnership() {
  return domains.map((d) => ({
    name: d.name,
    hasGuard: typeof d.guard === 'function',
    hasTransition: typeof d.transition === 'function',
    hasInvariants: typeof d.invariants === 'function',
    hasSelectors: Boolean(d.selectors && typeof d.selectors === 'object'),
    hasReplayExpectation: typeof d.replayExpectation === 'function',
    hasSnapshotSerializer: typeof d.serializeSnapshot === 'function',
    hasRecovery: typeof d.recover === 'function',
    hasInitialize: typeof d.initialize === 'function',
    hasSuspend: typeof d.suspend === 'function',
    hasResume: typeof d.resume === 'function',
    hasReset: typeof d.reset === 'function',
  }))
}

export function runRuntimeDomainLifecycle(hookName, state, context = {}) {
  const patches = []
  for (const d of domains) {
    const fn = d?.[hookName]
    if (typeof fn !== 'function') continue
    const out = fn(state, context)
    if (out && typeof out === 'object') patches.push({ domain: d.name, patch: out })
  }
  return patches
}