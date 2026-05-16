import { RUNTIME_ACTION_TYPES } from '../../runtimeActionSchema.js'
import { guardEntityAction } from './guards.js'
import { auditEntityDomain } from './invariants.js'
import { selectActiveRuntimeEntitySet } from './selectors.js'
import { transitionResolveTag } from './transitions.js'
import { entityReplayExpectation } from './replay.js'

export const entitiesDomain = {
  name: 'entities',
  handles(actionType) {
    return (
      actionType === RUNTIME_ACTION_TYPES.RUNTIME_RESOLVE_TAG ||
      actionType === RUNTIME_ACTION_TYPES.RUNTIME_NFC_SCAN ||
      actionType === RUNTIME_ACTION_TYPES.PACKAGE_SEMANTIC_ACTION
    )
  },
  guard: guardEntityAction,
  transition(prevState, action) {
    return transitionResolveTag(prevState, action)
  },
  invariants(state) {
    return auditEntityDomain(state)
  },
  selectors: {
    selectActiveRuntimeEntitySet,
  },
  replayExpectation: entityReplayExpectation,
  serializeSnapshot(state) {
    return {
      activeEntities: selectActiveRuntimeEntitySet(state),
      runtimeResolvedTag: state?.runtimeResolvedTag || null,
      runtimeResolvedUnitId: state?.runtimeResolvedUnit?.id || null,
    }
  },
  recover({ reason }) {
    return {
      reason,
      patch: {
        runtimeGateWarning: `Entities domain recovery: ${reason}`,
      },
    }
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