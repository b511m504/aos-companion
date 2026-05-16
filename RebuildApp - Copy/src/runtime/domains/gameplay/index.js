import { isGameplayActionType } from '../../../domain/gameplayActionTypes.js'
import { transitionGameplay, auditGameplayDomain } from './transitions.js'
import { guardGameplayAction } from './guards.js'

export const gameplayDomain = {
  name: 'gameplay',
  handles(actionType) {
    return isGameplayActionType(actionType)
  },
  guard: guardGameplayAction,
  transition: transitionGameplay,
  invariants(state) {
    return auditGameplayDomain(state)
  },
  selectors: {},
  replayExpectation(result) {
    return { handled: Boolean(result?.handled), outcome: String(result?.outcome || '') }
  },
  serializeSnapshot(state) {
    const g = state?.gameplay
    return {
      phase: g?.phase || '',
      turn: Number(g?.turn) || 0,
      entityCount: g?.entityRegistry?.entitiesById ? Object.keys(g.entityRegistry.entitiesById).length : 0,
      timelineTail: Array.isArray(g?.timeline) ? g.timeline.slice(-6).map((e) => e.type) : [],
    }
  },
  recover({ reason }) {
    return { reason, patch: { runtimeGateWarning: `Gameplay recovery: ${reason}` } }
  },
  initialize() {
    return null
  },
  suspend() {
    return null
  },
  resume() {
    return null
  },
  reset() {
    return null
  },
}
