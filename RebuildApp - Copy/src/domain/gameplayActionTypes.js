/**
 * Gameplay domain actions — distinct from NFC transport / roster `RUNTIME_*` actions.
 * All dispatched through `dispatchRuntimeAction` → gameplay domain transition.
 */

export const GAMEPLAY_ACTION_TYPES = Object.freeze({
  ENTITY_SCAN_DETECTED: 'GAMEPLAY_ENTITY_SCAN_DETECTED',
  /** Deterministic scenario seed (demo / tutorial) — merges objectives, zones, timeline. */
  SCENARIO_APPLIED: 'GAMEPLAY_SCENARIO_APPLIED',
  /** Merge-only UI slice (register modal, scan feedback) — replay-safe. */
  UI_SET: 'GAMEPLAY_UI_SET',
  PHASE_CHANGED: 'GAMEPLAY_PHASE_CHANGED',
  TURN_ADVANCED: 'GAMEPLAY_TURN_ADVANCED',
  ROUND_ADVANCED: 'GAMEPLAY_ROUND_ADVANCED',
  ENTITY_REGISTERED: 'GAMEPLAY_ENTITY_REGISTERED',
  ENTITY_REMOVED: 'GAMEPLAY_ENTITY_REMOVED',
  ENTITY_MOVED: 'GAMEPLAY_ENTITY_MOVED',
  ENTITY_ENTERED_ZONE: 'GAMEPLAY_ENTITY_ENTERED_ZONE',
  ENTITY_LEFT_ZONE: 'GAMEPLAY_ENTITY_LEFT_ZONE',
  OBJECTIVE_CAPTURE_STARTED: 'GAMEPLAY_OBJECTIVE_CAPTURE_STARTED',
  OBJECTIVE_CAPTURE_COMPLETED: 'GAMEPLAY_OBJECTIVE_CAPTURE_COMPLETED',
  AURA_APPLIED: 'GAMEPLAY_AURA_APPLIED',
  AURA_REMOVED: 'GAMEPLAY_AURA_REMOVED',
})

/** @param {string} type */
export function isGameplayActionType(type) {
  return String(type || '').startsWith('GAMEPLAY_')
}

/**
 * @param {string} type
 * @param {object} fields passed through to action (must be JSON-serializable)
 */
export function createGameplayAction(type, fields = {}) {
  const f = fields && typeof fields === 'object' ? fields : {}
  return {
    type: String(type || ''),
    ...f,
  }
}
