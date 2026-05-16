/**
 * Deterministic validation for gameplay actions (no side effects).
 */

import { GAMEPLAY_ACTION_TYPES, isGameplayActionType } from './gameplayActionTypes.js'
import { getEntity, resolveEntityIdByUid } from './entityRegistry.js'

/**
 * @param {import('./gameState.js').GameplayState} gameplay
 * @param {object} action
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateGameplayAction(gameplay, action) {
  if (!action || typeof action.type !== 'string' || !isGameplayActionType(action.type)) {
    return { ok: false, reason: 'invalid_gameplay_type' }
  }
  const g = gameplay && typeof gameplay === 'object' ? gameplay : null
  if (!g) return { ok: false, reason: 'missing_gameplay_state' }

  const reg = g.entityRegistry
  const uid = String(action.uid || action.payload?.uid || '').trim()
  const entityId = String(action.entityId || action.payload?.entityId || '').trim()

  switch (action.type) {
    case GAMEPLAY_ACTION_TYPES.UI_SET: {
      const p = action.payload && typeof action.payload === 'object' ? action.payload : {}
      if (!p || typeof p !== 'object') return { ok: false, reason: 'invalid_ui_payload' }
      return { ok: true }
    }
    case GAMEPLAY_ACTION_TYPES.PHASE_CHANGED: {
      const ph = String(action.payload?.phase || '').trim()
      if (!ph) return { ok: false, reason: 'missing_phase' }
      return { ok: true }
    }
    case GAMEPLAY_ACTION_TYPES.TURN_ADVANCED: {
      const t = Number(action.payload?.turn)
      if (!Number.isFinite(t) || t < 1) return { ok: false, reason: 'invalid_turn' }
      return { ok: true }
    }
    case GAMEPLAY_ACTION_TYPES.ROUND_ADVANCED: {
      const r = Number(action.payload?.round)
      if (!Number.isFinite(r) || r < 1) return { ok: false, reason: 'invalid_round' }
      return { ok: true }
    }
    case GAMEPLAY_ACTION_TYPES.ENTITY_SCAN_DETECTED: {
      if (!uid) return { ok: false, reason: 'missing_uid' }
      return { ok: true }
    }
    case GAMEPLAY_ACTION_TYPES.SCENARIO_APPLIED: {
      const preset = String(action.payload?.preset || '').trim()
      if (!preset) return { ok: false, reason: 'missing_preset' }
      return { ok: true }
    }
    case GAMEPLAY_ACTION_TYPES.ENTITY_REGISTERED: {
      if (!uid || !entityId) return { ok: false, reason: 'missing_uid_or_entityId' }
      return { ok: true }
    }
    case GAMEPLAY_ACTION_TYPES.ENTITY_REMOVED: {
      if (!entityId) return { ok: false, reason: 'missing_entityId' }
      if (!getEntity(reg, entityId)) return { ok: false, reason: 'unknown_entity' }
      return { ok: true }
    }
    case GAMEPLAY_ACTION_TYPES.ENTITY_MOVED: {
      if (!entityId) return { ok: false, reason: 'missing_entityId' }
      if (!getEntity(reg, entityId)) return { ok: false, reason: 'unknown_entity' }
      return { ok: true }
    }
    case GAMEPLAY_ACTION_TYPES.ENTITY_ENTERED_ZONE:
    case GAMEPLAY_ACTION_TYPES.ENTITY_LEFT_ZONE: {
      const zoneId = String(action.payload?.zoneId || '').trim()
      if (!zoneId || !entityId) return { ok: false, reason: 'missing_zone_or_entity' }
      if (!g.zones?.[zoneId]) return { ok: false, reason: 'unknown_zone' }
      if (!getEntity(reg, entityId)) return { ok: false, reason: 'unknown_entity' }
      return { ok: true }
    }
    case GAMEPLAY_ACTION_TYPES.OBJECTIVE_CAPTURE_STARTED:
    case GAMEPLAY_ACTION_TYPES.OBJECTIVE_CAPTURE_COMPLETED: {
      const oid = String(action.payload?.objectiveId || '').trim()
      if (!oid) return { ok: false, reason: 'missing_objectiveId' }
      return { ok: true }
    }
    case GAMEPLAY_ACTION_TYPES.AURA_APPLIED:
    case GAMEPLAY_ACTION_TYPES.AURA_REMOVED: {
      const auraId = String(action.payload?.auraId || '').trim()
      if (!auraId) return { ok: false, reason: 'missing_auraId' }
      return { ok: true }
    }
    default:
      return { ok: false, reason: 'unhandled_gameplay_type' }
  }
}

/**
 * @param {object} state full store state slice read
 * @param {object} action
 */
export function guardGameplayDispatch(state, action) {
  const gameplay = state?.gameplay
  return validateGameplayAction(gameplay, action)
}

/** NFC resolution helper — read-only. */
export function resolveGameplayEntityIdForUid(gameplay, uid) {
  return resolveEntityIdByUid(gameplay?.entityRegistry, uid)
}
