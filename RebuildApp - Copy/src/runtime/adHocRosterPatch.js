/**
 * Pure helpers to merge ad-hoc units into runtime registry + roster shapes (used by gameplay transitions).
 */

import { createRuntimeEntityFromLegacyUnit } from './runtimeEntityFactory.js'
import { activeRosterShapeFromRegistry } from './activeRosterFromRegistry.js'

function runtimeGameplayRecord(entityId, displayName, woundsMax) {
  const w = Number(woundsMax) || 0
  return {
    entityId,
    unitId: entityId,
    name: displayName,
    woundsMax: w,
    woundsCurrent: w,
    activated: false,
    destroyed: false,
    statusEffects: [],
    lastResolvedTagId: null,
    lastResolvedAt: null,
    lastModifiedAt: null,
  }
}

function cloneRegistry(reg) {
  if (!reg) {
    return {
      entities: [],
      relationships: [],
      metadata: { systemId: 'generic', listName: 'On-table picks' },
    }
  }
  return {
    entities: reg.entities.map((e) => ({
      ...e,
      display: { ...e.display },
      fields: { ...e.fields },
      capabilities: { ...e.capabilities },
      certification: { ...e.certification },
      relationships: Array.isArray(e.relationships) ? [...e.relationships] : [],
    })),
    relationships: [...(reg.relationships || [])],
    metadata: { ...reg.metadata },
  }
}

/**
 * @param {object} prevState full store snapshot
 * @param {{ entityId: string, name: string, wounds?: number }} unitLike
 * @returns {object} patch keys for updateState
 */
export function patchAppendAdHocUnit(prevState, unitLike) {
  const entityId = String(unitLike.entityId || '').trim()
  const name = String(unitLike.name || entityId).trim()
  const wounds = Number(unitLike.wounds) || 3

  const er = cloneRegistry(prevState.runtimeRegistry)
  const systemId = er.metadata?.systemId || 'generic'
  const list = [...(er.entities || [])]
  const idx = list.findIndex((e) => e.entityId === entityId)
  const ordinal = idx >= 0 ? idx : list.length
  const ent = createRuntimeEntityFromLegacyUnit(
    { id: entityId, name, wounds, certificationRequired: false },
    systemId,
    ordinal
  )
  if (idx >= 0) list[idx] = ent
  else list.push(ent)
  er.entities = list
  if (!er.metadata.listName) er.metadata.listName = 'Your table'

  const roster = activeRosterShapeFromRegistry(er)
  const ruNew = { [entityId]: runtimeGameplayRecord(entityId, name, wounds) }
  const runtimeUnits = { ...(prevState.runtimeUnits || {}), ...ruNew }

  return {
    runtimeRegistry: er,
    activeRoster: roster,
    runtimeUnits,
    packageBrowseNfcEntityCount: er.entities.length,
  }
}
