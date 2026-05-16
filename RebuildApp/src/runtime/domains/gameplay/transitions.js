/**
 * Pure gameplay transitions — mutate only `gameplay` slice via returned patch.
 */

import { GAMEPLAY_ACTION_TYPES } from '../../../domain/gameplayActionTypes.js'
import {
  appendGameplayTimeline,
  cloneGameplayState,
  createInitialGameplayState,
} from '../../../domain/gameState.js'
import {
  createEntityRecord,
  getEntity,
  registerEntityDeterministic,
  tombstoneEntity,
  ENTITY_TYPES,
  resolveEntityIdByUid,
} from '../../../domain/entityRegistry.js'
import { applyEntityEnteredZone, applyEntityLeftZone } from '../../../domain/zones.js'
import { validateGameplayAction } from '../../../domain/gameplayValidation.js'
import { applyObjectiveFlowOnEntityScan } from '../../../domain/objectives.js'
import { mergeDemoScenarioIntoGameplay } from '../../../domain/demoScenario.js'
import { patchAppendAdHocUnit } from '../../adHocRosterPatch.js'

function rosterSelectionPatchFromScan(prevState, entityId) {
  const id = String(entityId || '').trim()
  if (!id) return {}
  const units = prevState.activeRoster?.units
  if (!Array.isArray(units) || !units.length) {
    return {
      selectedEntity: id,
      selectedEntityId: id,
      selectedEntityName: id,
      selectedEntityIndex: null,
      nfcUiHighlightEntityId: id,
    }
  }
  const idx = units.findIndex((u) => u.id === id)
  if (idx < 0) {
    return {
      selectedEntity: id,
      selectedEntityId: id,
      selectedEntityName: id,
      selectedEntityIndex: null,
      nfcUiHighlightEntityId: id,
    }
  }
  const u = units[idx]
  return {
    selectedEntity: id,
    selectedEntityId: id,
    selectedEntityName: u.name,
    selectedEntityIndex: idx,
    nfcUiHighlightEntityId: id,
  }
}

/**
 * @param {object} prevState
 * @param {object} action
 */
export function transitionGameplay(prevState, action) {
  const gameplay = prevState?.gameplay && typeof prevState.gameplay === 'object' ? prevState.gameplay : createInitialGameplayState()
  const v = validateGameplayAction(gameplay, action)
  if (!v.ok) {
    return {
      handled: true,
      outcome: 'rejected',
      reason: v.reason,
      actionLabel: `gameplay rejected: ${v.reason}`,
      patch: {
        gameplay: appendGameplayTimeline(gameplay, 'gameplay_validation_failed', {
          type: action?.type,
          reason: v.reason,
          transactionId: action?.transactionId,
        }),
      },
      effects: [],
    }
  }

  let next = cloneGameplayState(gameplay)
  const labelBase = `gameplay ${action.type}`

  switch (action.type) {
    case GAMEPLAY_ACTION_TYPES.ENTITY_SCAN_DETECTED: {
      const uid = String(action.uid || action.payload?.uid || '').trim()
      const ridFromPayload = action.payload?.resolvedEntityId != null ? String(action.payload.resolvedEntityId).trim() : ''
      const fromReg = resolveEntityIdByUid(next.entityRegistry, uid)
      const effectiveEntityId = ridFromPayload || (fromReg ? String(fromReg) : '')

      next = appendGameplayTimeline(next, action.type, {
        uid,
        resolvedEntityId: effectiveEntityId || null,
        tx: action.transactionId,
      })

      const scanSeq = next.eventSeq
      next.lastScan = { uid, entityId: effectiveEntityId || null, scanSeq }

      if (!effectiveEntityId) {
        next.ui = {
          registerOpen: true,
          registerUid: uid,
          feedback: { kind: 'unknown_registry', uid, scanSeq },
        }
        return {
          handled: true,
          outcome: 'resolved',
          actionLabel: labelBase,
          patch: { gameplay: next },
          effects: [],
        }
      }

      next.ui = {
        registerOpen: false,
        registerUid: '',
        feedback: { kind: 'scan_resolved', uid, entityId: effectiveEntityId, scanSeq },
      }

      const objOut = applyObjectiveFlowOnEntityScan(next, effectiveEntityId)
      next = objOut.gameplay
      for (const n of objOut.timelineNotes) {
        if (n.kind === 'OBJECTIVE_CAPTURE_STARTED') {
          next = appendGameplayTimeline(next, GAMEPLAY_ACTION_TYPES.OBJECTIVE_CAPTURE_STARTED, {
            objectiveId: n.objectiveId,
            entityId: n.entityId,
          })
        } else if (n.kind === 'OBJECTIVE_CAPTURE_COMPLETED') {
          next = appendGameplayTimeline(next, GAMEPLAY_ACTION_TYPES.OBJECTIVE_CAPTURE_COMPLETED, {
            objectiveId: n.objectiveId,
            entityId: n.entityId,
          })
        } else if (n.kind === 'zone_enter_implicit') {
          next = appendGameplayTimeline(next, GAMEPLAY_ACTION_TYPES.ENTITY_ENTERED_ZONE, {
            zoneId: n.zoneId,
            entityId: n.entityId,
          })
        }
      }

      const rosterPatch = rosterSelectionPatchFromScan(prevState, effectiveEntityId)
      return {
        handled: true,
        outcome: 'resolved',
        actionLabel: labelBase,
        patch: { gameplay: next, ...rosterPatch },
        effects: [],
      }
    }
    case GAMEPLAY_ACTION_TYPES.UI_SET: {
      const p = action.payload && typeof action.payload === 'object' ? action.payload : {}
      const cur = next.ui || { registerOpen: false, registerUid: '', feedback: null }
      next.ui = {
        registerOpen: p.registerOpen !== undefined ? Boolean(p.registerOpen) : cur.registerOpen,
        registerUid: p.registerUid !== undefined ? String(p.registerUid || '') : cur.registerUid,
        feedback:
          p.feedback !== undefined
            ? p.feedback && typeof p.feedback === 'object'
              ? { ...p.feedback }
              : p.feedback
            : cur.feedback,
      }
      next = appendGameplayTimeline(next, action.type, {
        keys: Object.keys(p),
        tx: action.transactionId,
      })
      return {
        handled: true,
        outcome: 'resolved',
        actionLabel: labelBase,
        patch: { gameplay: next },
        effects: [],
      }
    }
    case GAMEPLAY_ACTION_TYPES.PHASE_CHANGED: {
      const ph = String(action.payload?.phase || '').trim()
      next.phase = ph
      next = appendGameplayTimeline(next, action.type, { phase: ph, tx: action.transactionId })
      return {
        handled: true,
        outcome: 'resolved',
        actionLabel: labelBase,
        patch: { gameplay: next },
        effects: [],
      }
    }
    case GAMEPLAY_ACTION_TYPES.TURN_ADVANCED: {
      const t = Number(action.payload?.turn)
      next.turn = t
      next = appendGameplayTimeline(next, action.type, { turn: t, tx: action.transactionId })
      return {
        handled: true,
        outcome: 'resolved',
        actionLabel: labelBase,
        patch: { gameplay: next },
        effects: [],
      }
    }
    case GAMEPLAY_ACTION_TYPES.ROUND_ADVANCED: {
      const r = Number(action.payload?.round)
      next.round = r
      next = appendGameplayTimeline(next, action.type, { round: r, tx: action.transactionId })
      return {
        handled: true,
        outcome: 'resolved',
        actionLabel: labelBase,
        patch: { gameplay: next },
        effects: [],
      }
    }
    case GAMEPLAY_ACTION_TYPES.SCENARIO_APPLIED: {
      const preset = String(action.payload?.preset || '').trim()
      const { gameplay: merged, applied } = mergeDemoScenarioIntoGameplay(next, preset)
      if (!applied) {
        next = appendGameplayTimeline(next, 'scenario_apply_rejected', { preset })
        return {
          handled: true,
          outcome: 'rejected',
          reason: 'unknown_preset',
          actionLabel: `${labelBase} rejected`,
          patch: { gameplay: next },
          effects: [],
        }
      }
      return {
        handled: true,
        outcome: 'resolved',
        actionLabel: labelBase,
        patch: { gameplay: merged },
        effects: [],
      }
    }
    case GAMEPLAY_ACTION_TYPES.ENTITY_REGISTERED: {
      const p = action.payload && typeof action.payload === 'object' ? action.payload : {}
      const entityId = String(action.entityId || p.entityId || '').trim()
      const uid = String(action.uid || p.uid || '').trim()
      const entityType = String(p.entityType || ENTITY_TYPES.MINIATURE)
      const ownerId = String(p.ownerId || '')
      const revision = Number(p.revision) || 0
      const seq = next.entityRegistry.registrationSeq + 1
      const rec = createEntityRecord(
        entityId,
        uid,
        entityType,
        ownerId,
        revision,
        p.state || {},
        p.metadata || {},
        seq,
        seq
      )
      const { registry, outcome, reason } = registerEntityDeterministic(next.entityRegistry, rec)
      if (outcome === 'rejected') {
        next = appendGameplayTimeline(next, 'entity_register_rejected', { entityId, uid, reason })
        return {
          handled: true,
          outcome: 'rejected',
          reason: reason || 'register_rejected',
          actionLabel: `${labelBase} rejected`,
          patch: { gameplay: next },
          effects: [],
        }
      }
      next.entityRegistry = registry
      if (String(next.ui?.registerUid || '') === uid) {
        next.ui = {
          ...next.ui,
          registerOpen: false,
          registerUid: '',
          feedback: { kind: 'registered', entityId, uid },
        }
      }
      next = appendGameplayTimeline(next, action.type, { entityId, uid, outcome })
      let rosterPatch = rosterSelectionPatchFromScan(prevState, entityId)
      const appendForces = p.appendToRuntimeForces !== false
      if (appendForces) {
        const displayName = String(p.displayName || entityId).trim() || entityId
        const wounds = p.wounds != null ? Number(p.wounds) : 3
        rosterPatch = {
          ...rosterPatch,
          ...patchAppendAdHocUnit(prevState, { entityId, name: displayName, wounds }),
        }
      }
      return {
        handled: true,
        outcome: 'resolved',
        actionLabel: labelBase,
        patch: { gameplay: next, ...rosterPatch },
        effects: [],
      }
    }
    case GAMEPLAY_ACTION_TYPES.ENTITY_REMOVED: {
      const entityId = String(action.entityId || action.payload?.entityId || '').trim()
      const seq = next.eventSeq + 1
      next.entityRegistry = tombstoneEntity(next.entityRegistry, entityId, seq)
      next = appendGameplayTimeline(next, action.type, { entityId, tx: action.transactionId })
      return {
        handled: true,
        outcome: 'resolved',
        actionLabel: labelBase,
        patch: { gameplay: next },
        effects: [],
      }
    }
    case GAMEPLAY_ACTION_TYPES.ENTITY_MOVED: {
      const entityId = String(action.entityId || action.payload?.entityId || '').trim()
      const p = action.payload && typeof action.payload === 'object' ? action.payload : {}
      const cur = getEntity(next.entityRegistry, entityId)
      if (!cur) {
        return { handled: true, outcome: 'rejected', reason: 'unknown_entity', patch: { gameplay: next }, effects: [] }
      }
      const updated = {
        ...cur,
        revision: (Number(cur.revision) || 0) + 1,
        state: { ...cur.state, position: p.position != null ? p.position : cur.state?.position },
        metadata: { ...cur.metadata, ...p.metadata },
        updatedAt: next.eventSeq + 1,
      }
      const reg = { ...next.entityRegistry, entitiesById: { ...next.entityRegistry.entitiesById, [entityId]: updated } }
      next.entityRegistry = reg
      next = appendGameplayTimeline(next, action.type, { entityId, tx: action.transactionId })
      return {
        handled: true,
        outcome: 'resolved',
        actionLabel: labelBase,
        patch: { gameplay: next },
        effects: [],
      }
    }
    case GAMEPLAY_ACTION_TYPES.ENTITY_ENTERED_ZONE: {
      const zoneId = String(action.payload?.zoneId || '').trim()
      const entityId = String(action.entityId || action.payload?.entityId || '').trim()
      next.zones = applyEntityEnteredZone(next.zones, zoneId, entityId)
      next = appendGameplayTimeline(next, action.type, { zoneId, entityId })
      return {
        handled: true,
        outcome: 'resolved',
        actionLabel: labelBase,
        patch: { gameplay: next },
        effects: [],
      }
    }
    case GAMEPLAY_ACTION_TYPES.ENTITY_LEFT_ZONE: {
      const zoneId = String(action.payload?.zoneId || '').trim()
      const entityId = String(action.entityId || action.payload?.entityId || '').trim()
      next.zones = applyEntityLeftZone(next.zones, zoneId, entityId)
      next = appendGameplayTimeline(next, action.type, { zoneId, entityId })
      return {
        handled: true,
        outcome: 'resolved',
        actionLabel: labelBase,
        patch: { gameplay: next },
        effects: [],
      }
    }
    case GAMEPLAY_ACTION_TYPES.OBJECTIVE_CAPTURE_STARTED:
    case GAMEPLAY_ACTION_TYPES.OBJECTIVE_CAPTURE_COMPLETED: {
      const oid = String(action.payload?.objectiveId || '').trim()
      const patch = typeof action.payload?.patch === 'object' && action.payload.patch ? action.payload.patch : {}
      const o = { ...(next.objectives[oid] || {}), ...patch }
      next.objectives = { ...next.objectives, [oid]: o }
      next = appendGameplayTimeline(next, action.type, { objectiveId: oid })
      return {
        handled: true,
        outcome: 'resolved',
        actionLabel: labelBase,
        patch: { gameplay: next },
        effects: [],
      }
    }
    case GAMEPLAY_ACTION_TYPES.AURA_APPLIED: {
      const auraId = String(action.payload?.auraId || '').trim()
      const emitter = String(action.payload?.emitterEntityId || '').trim()
      next.auraState = {
        aurasById: { ...next.auraState.aurasById, [auraId]: { ...action.payload } },
        indexByEmitter: { ...next.auraState.indexByEmitter },
      }
      if (emitter) {
        const arr = [...(next.auraState.indexByEmitter[emitter] || [])]
        if (!arr.includes(auraId)) arr.push(auraId)
        arr.sort()
        next.auraState.indexByEmitter[emitter] = arr
      }
      next = appendGameplayTimeline(next, action.type, { auraId, emitter })
      return {
        handled: true,
        outcome: 'resolved',
        actionLabel: labelBase,
        patch: { gameplay: next },
        effects: [],
      }
    }
    case GAMEPLAY_ACTION_TYPES.AURA_REMOVED: {
      const auraId = String(action.payload?.auraId || '').trim()
      const aurasById = { ...next.auraState.aurasById }
      delete aurasById[auraId]
      const indexByEmitter = { ...next.auraState.indexByEmitter }
      for (const k of Object.keys(indexByEmitter)) {
        indexByEmitter[k] = (indexByEmitter[k] || []).filter((id) => id !== auraId)
      }
      next.auraState = { aurasById, indexByEmitter }
      next = appendGameplayTimeline(next, action.type, { auraId })
      return {
        handled: true,
        outcome: 'resolved',
        actionLabel: labelBase,
        patch: { gameplay: next },
        effects: [],
      }
    }
    default:
      return { handled: false }
  }
}

export function auditGameplayDomain(state) {
  const issues = []
  const g = state?.gameplay
  if (!g?.entityRegistry?.entitiesById) return issues
  for (const [id, e] of Object.entries(g.entityRegistry.entitiesById)) {
    if (!e?.tombstone && e?.uid) {
      const mapped = g.entityRegistry.entityIdByUid[e.uid]
      if (mapped && mapped !== id) {
        issues.push({ severity: 'critical', message: `uid_map_conflict:${e.uid}` })
      }
    }
  }
  return issues
}
