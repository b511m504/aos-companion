/**
 * Normalizes imported content into RuntimeEntity records.
 * UI and NFC layers must not consume raw package JSON — only entities from here / registry.
 */

/**
 * @typedef {object} RuntimeEntity
 * @property {string} entityId
 * @property {string} entityType
 * @property {string} systemId
 * @property {{ name: string, subtitle?: string, icon?: string|null }} display
 * @property {Record<string, unknown>} fields
 * @property {{ nfcBindable: boolean, woundTrackable: boolean, activatable: boolean }} capabilities
 * @property {{ required: boolean }} certification
 * @property {Array<{ type: string, source: string, target: string }>} relationships
 */

/**
 * @param {object} unitLike — legacy `{ id, name, wounds }` row
 * @param {string} systemId
 * @param {number} [ordinal]
 * @returns {RuntimeEntity}
 */
export function createRuntimeEntityFromLegacyUnit(unitLike, systemId, ordinal = 0) {
  const id = String(unitLike.id ?? `entity_${ordinal}`)
  const rawType = unitLike.entityType ?? unitLike.kind ?? 'UNIT'
  const entityType = String(rawType)
    .toUpperCase()
    .replace(/\s+/g, '_')
  return {
    entityId: id,
    entityType,
    systemId,
    display: {
      name: String(unitLike.name ?? 'Entity'),
      subtitle: unitLike.subtitle != null ? String(unitLike.subtitle) : '',
      icon: unitLike.icon ?? null,
    },
    fields: {
      wounds: Number(unitLike.wounds) || 0,
    },
    capabilities: {
      nfcBindable: unitLike.nfcBindable !== false,
      woundTrackable: unitLike.woundTrackable !== false,
      activatable: unitLike.activatable !== false,
    },
    certification: {
      required: unitLike.certificationRequired !== false,
    },
    relationships: [],
  }
}

/**
 * @param {Array<object>} units legacy rows
 * @param {string} systemId
 * @returns {RuntimeEntity[]}
 */
export function buildRuntimeEntitiesFromLegacyUnits(units, systemId) {
  if (!Array.isArray(units)) return []
  return units.map((u, i) => createRuntimeEntityFromLegacyUnit(u, systemId, i))
}

/**
 * Merge entity-level relationships from package graph (minimal Phase 1).
 * @param {RuntimeEntity[]} entities
 * @param {Array<{ type: string, source: string, target: string }>} edges
 */
export function attachEntityRelationshipPlaceholders(entities, edges) {
  const byId = new Set(entities.map((e) => e.entityId))
  const list = Array.isArray(edges) ? edges : []
  for (const e of entities) {
    const mine = list.filter((r) => r.source === e.entityId || r.target === e.entityId)
    e.relationships = mine.filter(
      (r) => byId.has(r.source) && byId.has(r.target)
    )
  }
}
