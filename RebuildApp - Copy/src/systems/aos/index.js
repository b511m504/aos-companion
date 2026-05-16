/**
 * Age of Sigmar (and compatible lists) — Phase 1 delegates entity building to generic row shape.
 * Future: warscroll-specific types, squad nesting, etc.
 */
import * as generic from '../generic/index.js'
import {
  buildRuntimeEntitiesFromLegacyUnits,
  attachEntityRelationshipPlaceholders,
} from '../../runtime/runtimeEntityFactory.js'

export const systemId = 'aos'
export const displayName = 'Age of Sigmar'

export const supportedEntityTypes = ['unit', 'warscroll']

export const uiCapabilities = {
  ...generic.uiCapabilities,
  commandPoints: false,
}

export function validatePackage(raw) {
  const base = generic.validatePackage(raw)
  if (!base.ok) return base
  return { ok: true }
}

export function normalizePackage(raw) {
  const base = generic.normalizePackage(raw)
  return {
    ...base,
    systemId,
  }
}

export function buildRuntimeEntities(normalized) {
  const entities = buildRuntimeEntitiesFromLegacyUnits(normalized.units, systemId)
  attachEntityRelationshipPlaceholders(entities, normalized.relationships)
  return entities
}
