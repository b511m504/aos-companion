import {
  buildRuntimeEntitiesFromLegacyUnits,
  attachEntityRelationshipPlaceholders,
} from '../../runtime/runtimeEntityFactory.js'

export const systemId = 'generic'
export const displayName = 'Generic tabletop'

export const supportedEntityTypes = ['unit', 'model']

export const uiCapabilities = {
  wounds: true,
  activation: true,
  nfc: true,
}

/**
 * @param {unknown} raw
 * @returns {{ ok: boolean, errors?: string[] }}
 */
export function validatePackage(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['Package must be a JSON object'] }
  }
  const o = /** @type {Record<string, unknown>} */ (raw)
  if (!o.name && !o.listName) {
    return { ok: false, errors: ['Missing list name'] }
  }
  if (!Array.isArray(o.units)) {
    return { ok: false, errors: ['Missing units array'] }
  }
  for (let i = 0; i < o.units.length; i++) {
    const u = o.units[i]
    if (!u || typeof u !== 'object' || !/** @type {{id?:unknown}} */ (u).id) {
      return { ok: false, errors: [`units[${i}] needs id`] }
    }
  }
  return { ok: true }
}

/**
 * Shape consumed by buildRuntimeEntities — internal normalized content package.
 */
export function normalizePackage(raw) {
  const o = /** @type {Record<string, unknown>} */ (raw)
  const listName = String(o.name ?? o.listName ?? 'List')
  const units = Array.isArray(o.units) ? o.units : []
  const relationships = Array.isArray(o.relationships) ? o.relationships : []
  return {
    systemId,
    listName,
    units,
    relationships,
  }
}

export function buildRuntimeEntities(normalized) {
  const entities = buildRuntimeEntitiesFromLegacyUnits(normalized.units, systemId)
  attachEntityRelationshipPlaceholders(entities, normalized.relationships)
  return entities
}
