import { GAMEPLAY_ACTION_TYPES, isGameplayActionType } from '../../../domain/gameplayActionTypes.js'
import { validateGameplayAction } from '../../../domain/gameplayValidation.js'

const looseAlways = new Set([
  GAMEPLAY_ACTION_TYPES.ENTITY_SCAN_DETECTED,
  GAMEPLAY_ACTION_TYPES.UI_SET,
  GAMEPLAY_ACTION_TYPES.ENTITY_REGISTERED,
])

const looseRuntimeScreenOnly = new Set([
  GAMEPLAY_ACTION_TYPES.SCENARIO_APPLIED,
  GAMEPLAY_ACTION_TYPES.PHASE_CHANGED,
  GAMEPLAY_ACTION_TYPES.TURN_ADVANCED,
  GAMEPLAY_ACTION_TYPES.ROUND_ADVANCED,
  GAMEPLAY_ACTION_TYPES.ENTITY_REMOVED,
  GAMEPLAY_ACTION_TYPES.ENTITY_MOVED,
  GAMEPLAY_ACTION_TYPES.ENTITY_ENTERED_ZONE,
  GAMEPLAY_ACTION_TYPES.ENTITY_LEFT_ZONE,
  GAMEPLAY_ACTION_TYPES.OBJECTIVE_CAPTURE_STARTED,
  GAMEPLAY_ACTION_TYPES.OBJECTIVE_CAPTURE_COMPLETED,
  GAMEPLAY_ACTION_TYPES.AURA_APPLIED,
  GAMEPLAY_ACTION_TYPES.AURA_REMOVED,
])

export function guardGameplayAction(state, action) {
  if (!isGameplayActionType(action?.type)) return { ok: false, reason: 'not_gameplay_action' }

  if (looseAlways.has(action.type)) {
    return validateGameplayAction(state?.gameplay, action)
  }

  if (looseRuntimeScreenOnly.has(action.type)) {
    if (state?.appMode !== 'runtime' || state?.currentScreen !== 'runtime') {
      return { ok: false, reason: 'gameplay_not_match_runtime' }
    }
    return validateGameplayAction(state?.gameplay, action)
  }

  if (state?.appMode !== 'runtime' || state?.currentScreen !== 'runtime') {
    return { ok: false, reason: 'gameplay_not_match_runtime' }
  }
  return validateGameplayAction(state?.gameplay, action)
}
