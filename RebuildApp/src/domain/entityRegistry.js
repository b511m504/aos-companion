/**
 * Canonical gameplay entity registry — pure, serializable, replay-safe.
 * NFC transport must never mutate this directly; only gameplay transitions may apply patches.
 */

export const ENTITY_TYPES = Object.freeze({
  MINIATURE: 'miniature',
  TERRAIN: 'terrain',
  OBJECTIVE: 'objective',
  TOKEN: 'token',
  AURA_EMITTER: 'auraEmitter',
})

/**
 * @returns {import('./gameState.js').GameplayEntityRegistry}
 */
export function emptyEntityRegistry() {
  return {
    entitiesById: Object.create(null),
    entityIdByUid: Object.create(null),
    /** Monotonic counter for deterministic ordering metadata (not wall-clock). */
    registrationSeq: 0,
  }
}

/**
 * @param {string} entityId
 * @param {string} uid
 * @param {string} entityType
 * @param {string} ownerId
 * @param {number} revision
 * @param {Record<string, unknown>} state
 * @param {Record<string, unknown>} metadata
 * @param {number} createdAtSeq
 * @param {number} updatedAtSeq
 */
export function createEntityRecord(
  entityId,
  uid,
  entityType,
  ownerId,
  revision,
  state,
  metadata,
  createdAtSeq,
  updatedAtSeq
) {
  return {
    entityId: String(entityId || ''),
    uid: String(uid || '').trim(),
    entityType: String(entityType || ''),
    ownerId: String(ownerId || ''),
    revision: Math.max(0, Number(revision) || 0),
    state: state && typeof state === 'object' ? { ...state } : {},
    metadata: metadata && typeof metadata === 'object' ? { ...metadata } : {},
    tombstone: false,
    createdAt: Math.max(0, Number(createdAtSeq) || 0),
    updatedAt: Math.max(0, Number(updatedAtSeq) || 0),
  }
}

/**
 * @param {import('./gameState.js').GameplayEntityRegistry} reg
 * @param {string} entityId
 */
export function getEntity(reg, entityId) {
  const id = String(entityId || '')
  if (!id) return null
  const e = reg?.entitiesById?.[id]
  if (!e || e.tombstone) return null
  return e
}

/**
 * @param {import('./gameState.js').GameplayEntityRegistry} reg
 * @param {string} uid
 */
export function resolveEntityIdByUid(reg, uid) {
  const u = String(uid || '').trim()
  if (!u) return null
  const id = reg?.entityIdByUid?.[u]
  return id ? String(id) : null
}

/**
 * Deterministic registration with UID uniqueness: newer revision wins; same revision → registrationSeq tie-break.
 * @param {import('./gameState.js').GameplayEntityRegistry} reg
 * @param {ReturnType<typeof createEntityRecord>} incoming
 * @returns {{ registry: import('./gameState.js').GameplayEntityRegistry, outcome: 'registered'|'replaced'|'rejected', reason?: string, previousEntityId?: string }}
 */
export function registerEntityDeterministic(reg, incoming) {
  const registry = cloneRegistry(reg)
  const uid = String(incoming.uid || '').trim()
  const eid = String(incoming.entityId || '')
  if (!uid || !eid) return { registry, outcome: 'rejected', reason: 'missing_uid_or_entityId' }

  const existingId = registry.entityIdByUid[uid]
  if (existingId && existingId !== eid) {
    const prev = registry.entitiesById[existingId]
    if (prev && !prev.tombstone) {
      const pr = Number(prev.revision) || 0
      const ir = Number(incoming.revision) || 0
      if (ir < pr) {
        return { registry: cloneRegistry(reg), outcome: 'rejected', reason: 'stale_revision', previousEntityId: existingId }
      }
      if (ir === pr && Number(incoming.updatedAt || 0) < Number(prev.updatedAt || 0)) {
        return { registry: cloneRegistry(reg), outcome: 'rejected', reason: 'stale_update_seq', previousEntityId: existingId }
      }
      registry.entitiesById[existingId] = { ...prev, tombstone: true, updatedAt: incoming.updatedAt }
    }
  }

  const priorSame = registry.entitiesById[eid]
  if (priorSame && !priorSame.tombstone) {
    const pr = Number(priorSame.revision) || 0
    const ir = Number(incoming.revision) || 0
    if (ir < pr) return { registry: cloneRegistry(reg), outcome: 'rejected', reason: 'stale_entity_revision' }
  }

  registry.registrationSeq += 1
  registry.entitiesById[eid] = { ...incoming, tombstone: false }
  registry.entityIdByUid[uid] = eid

  const outcome = priorSame && !priorSame.tombstone ? 'replaced' : 'registered'
  return { registry, outcome }
}

/**
 * @param {import('./gameState.js').GameplayEntityRegistry} reg
 * @param {string} entityId
 * @param {number} updatedAtSeq
 */
export function tombstoneEntity(reg, entityId, updatedAtSeq) {
  const registry = cloneRegistry(reg)
  const id = String(entityId || '')
  const cur = registry.entitiesById[id]
  if (!cur || cur.tombstone) return registry
  registry.entitiesById[id] = {
    ...cur,
    tombstone: true,
    updatedAt: Math.max(Number(cur.updatedAt) || 0, Number(updatedAtSeq) || 0),
  }
  const uid = String(cur.uid || '').trim()
  if (uid && registry.entityIdByUid[uid] === id) {
    delete registry.entityIdByUid[uid]
  }
  return registry
}

/** @param {import('./gameState.js').GameplayEntityRegistry} reg */
function cloneRegistry(reg) {
  const base = reg && typeof reg === 'object' ? reg : emptyEntityRegistry()
  const entitiesById = { ...base.entitiesById }
  for (const k of Object.keys(entitiesById)) {
    const e = entitiesById[k]
    entitiesById[k] = e && typeof e === 'object' ? { ...e } : e
  }
  return {
    entitiesById,
    entityIdByUid: { ...base.entityIdByUid },
    registrationSeq: Number(base.registrationSeq) || 0,
  }
}
