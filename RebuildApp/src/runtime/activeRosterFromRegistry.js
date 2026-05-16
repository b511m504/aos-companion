/**
 * Presentation-only view for legacy screens: roster viewer expects `{ name, units[] }`.
 * Built from canonical runtimeRegistry — not from raw import JSON.
 */

/**
 * @param {{ entities: import('./runtimeEntityFactory.js').RuntimeEntity[], metadata?: { listName?: string } } | null} registry
 * @returns {{ name: string, units: Array<{ id: string, name: string, wounds: number, entityType: string }> } | null}
 */
export function activeRosterShapeFromRegistry(registry) {
  if (!registry?.entities?.length) return null
  const name = registry.metadata?.listName || 'List'
  const units = registry.entities.map((e) => ({
    id: e.entityId,
    name: e.display?.name ?? e.entityId,
    wounds: Number(e.fields?.wounds) || 0,
    entityType: String(e.entityType || 'UNIT').toUpperCase(),
  }))
  return { name, units }
}
