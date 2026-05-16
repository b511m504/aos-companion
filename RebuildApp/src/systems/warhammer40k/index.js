import * as generic from '../generic/index.js'
import {
  buildRuntimeEntitiesFromLegacyUnits,
  attachEntityRelationshipPlaceholders,
} from '../../runtime/runtimeEntityFactory.js'

export const systemId = 'warhammer40k'
export const displayName = 'Warhammer 40,000'

export const supportedEntityTypes = ['unit', 'model']
export const uiCapabilities = { ...generic.uiCapabilities }

export function validatePackage(raw) {
  return generic.validatePackage(raw)
}

export function normalizePackage(raw) {
  const base = generic.normalizePackage(raw)
  return { ...base, systemId }
}

export function buildRuntimeEntities(normalized) {
  const entities = buildRuntimeEntitiesFromLegacyUnits(normalized.units, systemId)
  attachEntityRelationshipPlaceholders(entities, normalized.relationships)
  return entities
}
