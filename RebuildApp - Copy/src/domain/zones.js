/**
 * Deterministic zone index — spatial semantics for tabletop automation (logical, not mesh geometry).
 */

export const ZONE_TYPES = Object.freeze({
  DEPLOYMENT: 'deployment',
  OBJECTIVE_RANGE: 'objective_range',
  AURA: 'aura',
  TERRAIN_REGION: 'terrain_region',
  SCORING: 'scoring',
})

/**
 * @param {string} zoneId
 * @param {string} zoneType
 * @param {string[]} entitiesPresent
 * @param {string} ownership
 * @param {Record<string, unknown>} state
 */
export function createZoneRecord(zoneId, zoneType, entitiesPresent = [], ownership = '', state = {}) {
  return {
    zoneId: String(zoneId || ''),
    zoneType: String(zoneType || ''),
    entitiesPresent: Array.isArray(entitiesPresent) ? [...entitiesPresent] : [],
    ownership: String(ownership || ''),
    state: state && typeof state === 'object' ? { ...state } : {},
  }
}

/** @param {Record<string, import('./gameState.js').GameplayZone>} zones */
export function cloneZones(zones) {
  const z = zones && typeof zones === 'object' ? zones : {}
  const out = {}
  for (const k of Object.keys(z)) {
    const r = z[k]
    out[k] =
      r && typeof r === 'object'
        ? {
            ...r,
            entitiesPresent: Array.isArray(r.entitiesPresent) ? [...r.entitiesPresent] : [],
            state: r.state && typeof r.state === 'object' ? { ...r.state } : {},
          }
        : r
  }
  return out
}

/**
 * @param {Record<string, import('./gameState.js').GameplayZone>} zones
 * @param {string} zoneId
 * @param {string} entityId
 */
export function applyEntityEnteredZone(zones, zoneId, entityId) {
  const next = cloneZones(zones)
  const id = String(zoneId || '')
  const eid = String(entityId || '')
  if (!id || !eid || !next[id]) return next
  const z = next[id]
  const set = new Set(z.entitiesPresent || [])
  set.add(eid)
  next[id] = { ...z, entitiesPresent: [...set].sort() }
  return next
}

/**
 * @param {Record<string, import('./gameState.js').GameplayZone>} zones
 * @param {string} zoneId
 * @param {string} entityId
 */
export function applyEntityLeftZone(zones, zoneId, entityId) {
  const next = cloneZones(zones)
  const id = String(zoneId || '')
  const eid = String(entityId || '')
  if (!id || !eid || !next[id]) return next
  const z = next[id]
  next[id] = {
    ...z,
    entitiesPresent: (z.entitiesPresent || []).filter((x) => String(x) !== eid).sort(),
  }
  return next
}
