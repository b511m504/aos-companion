/**
 * Certification helpers — prefer runtime registry + entity graph (not raw roster JSON).
 */
import {
  getNfcBindableEntities,
  getNextUnassignedEntity,
} from '../runtime/entitySelectors.js'

export function isUnitCertified(state, entityId) {
  return Boolean(state.nfcAssignments?.[entityId]?.uid)
}

export function getUnitAssignedUid(state, entityId) {
  const uid = state.nfcAssignments?.[entityId]?.uid
  return uid != null && uid !== '' ? uid : null
}

export function getCertificationProgress(state) {
  const bindable = getNfcBindableEntities(state)
  const total = bindable.length
  let certified = 0
  for (const e of bindable) {
    if (state.nfcAssignments?.[e.entityId]?.uid) certified += 1
  }
  const percent = total > 0 ? Math.round((certified / total) * 100) : 0
  return {
    certified,
    total,
    percent,
    remaining: Math.max(0, total - certified),
  }
}

/** @deprecated prefer getNextUnassignedEntity — kept for callers expecting {id,name} */
export function getNextUnassignedUnit(state) {
  const e = getNextUnassignedEntity(state)
  if (!e) return null
  return { id: e.entityId, name: e.display?.name ?? e.entityId }
}

/** Current runtime: which entity (if any) holds this physical tag id */
export function getPhysicalTagOwner(state, tagId) {
  const key = String(tagId ?? '').trim()
  if (!key) return null
  const b = state.assignedTags?.[key]
  if (!b) return null
  return b.entityId ?? b.unitId ?? null
}

/** Historical memory only (never implies active linkage). */
export function isHistoricallyKnownTag(state, tagId) {
  const key = String(tagId ?? '').trim()
  if (!key) return false
  return Boolean(state.nfcHistoricalTags?.[key])
}

/** Active runtime assignment only (authoritative linkage in this session). */
export function isActivelyAssignedTag(state, tagId) {
  return getRuntimeAssignedUnit(state, tagId) != null
}

/** Active runtime owner for a tag id, or null if unassigned this session. */
export function getRuntimeAssignedUnit(state, tagId) {
  return getPhysicalTagOwner(state, tagId)
}

/** Historical record for a tag id (scan-time context only). */
export function getHistoricalTagMemory(state, tagId) {
  const key = String(tagId ?? '').trim()
  if (!key) return null
  return state.nfcHistoricalTags?.[key] ?? null
}

/** Card-local conflict targeting: only target card may render conflict visuals. */
export function getConflictTargetState(state, cardId) {
  const c = state.activeNfcConflict
  if (!c) return 'none'
  return c.targetUnitId === cardId ? 'current' : 'other'
}

/** Entity-level historical marker for neutral "known tag" presentation. */
export function hasHistoricalMemoryForEntity(state, entityId) {
  if (!entityId) return false
  const map = state.nfcHistoricalTags || {}
  return Object.values(map).some((entry) => entry?.entityId === entityId)
}

/** Compact display (e.g. 04:A3:7F… or stub-tag…); not a raw dump. */
export function compactUidPreview(uid) {
  const s = String(uid || '')
  if (!s) return ''
  if (s.length <= 14) return s
  return `${s.slice(0, 8)}…${s.slice(-5)}`
}

export function isAssignmentErrorForUnit(state, entityId) {
  if (state.nfcIdentityModal) return false
  const r = state.lastAssignmentResult
  if (!r || r.ok) return false
  const target =
    r.requestedEntityId ?? r.requestedUnitId ?? state.selectedEntityId ?? state.selectedUnitId
  if (target !== entityId) return false
  const phase = state.nfcScanPhase || 'waiting'
  return ['write_failure', 'unsupported_tag'].includes(phase)
}

export function isScanSuccessForUnit(state, entityId) {
  const r = state.lastAssignmentResult
  if (!r?.ok) return false
  const id = r.entityId ?? r.unitId
  if (id !== entityId || state.nfcScanPhase !== 'scan_success') return false
  return true
}

/** Amber transfer-out pulse on entity that lost a tag to reassignment */
export function isPhysicalUnlinkPulse(state, entityId) {
  return state.nfcPulseUnlinkedEntityId === entityId
}

/** Lookup / jump-to focus ring */
export function isPhysicalLookupHighlight(state, entityId) {
  return state.nfcUiHighlightEntityId === entityId
}
