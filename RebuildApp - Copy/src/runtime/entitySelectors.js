/**
 * Canonical reads against `state.runtimeRegistry` — avoid ad-hoc traversal in UI.
 */

/** @param {object} state app snapshot */
export function getRuntimeEntity(state, entityId) {
  if (!entityId || !state.runtimeRegistry?.entities) return null
  return state.runtimeRegistry.entities.find((e) => e.entityId === entityId) ?? null
}

/** Entities that participate in NFC certification for this list */
export function getNfcBindableEntities(state) {
  const list = state.runtimeRegistry?.entities
  if (!list?.length) return []
  return list.filter(
    (e) => e.capabilities?.nfcBindable && e.certification?.required !== false
  )
}

export function getCertifiedEntities(state) {
  const bindable = getNfcBindableEntities(state)
  return bindable.filter((e) => Boolean(state.nfcAssignments?.[e.entityId]?.uid))
}

export function getEntityDisplayName(state, entityId) {
  const e = getRuntimeEntity(state, entityId)
  return e?.display?.name ?? entityId ?? ''
}

export function getEntityField(state, entityId, fieldKey) {
  const e = getRuntimeEntity(state, entityId)
  if (!e?.fields) return undefined
  return e.fields[fieldKey]
}

/** Next entity that still needs NFC certification */
export function getNextUnassignedEntity(state) {
  const bindable = getNfcBindableEntities(state)
  return bindable.find((e) => !state.nfcAssignments?.[e.entityId]?.uid) ?? null
}
