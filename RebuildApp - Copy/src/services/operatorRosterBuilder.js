import { buildRuntimeEntitiesFromLegacyUnits } from '../runtime/runtimeEntityFactory.js'

/**
 * @param {unknown} parsed
 * @returns {Array<{ instanceId: string, name: string, models: number }>}
 */
export function normalizeOperatorRosterRows(parsed) {
  if (Array.isArray(parsed)) {
    return parsed.map((row, i) => normalizeOneRow(row, i))
  }
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.units)) {
    return parsed.units.map((row, i) => normalizeOneRow(row, i))
  }
  throw new Error('Roster must be a JSON array or an object with a "units" array.')
}

function normalizeOneRow(row, index) {
  if (!row || typeof row !== 'object') {
    throw new Error(`Invalid unit at index ${index}`)
  }
  const instanceId = String(row.instanceId ?? row.id ?? '').trim()
  const name = String(row.name ?? '').trim()
  if (!instanceId) throw new Error(`Missing instanceId on row ${index}`)
  if (!name) throw new Error(`Missing name for "${instanceId}"`)
  const models = Math.max(1, Math.min(999, Number(row.models) || 1))
  return { instanceId, name, models }
}

/**
 * Build a minimal runtime registry the existing roster + NFC layers understand.
 * @param {Array<{ instanceId: string, name: string, models: number }>} rows
 * @param {{ listName?: string, systemId: string }} meta
 */
export function buildOperatorRuntimeRegistry(rows, meta) {
  const systemId = String(meta?.systemId || 'generic').trim() || 'generic'
  const listName = String(meta?.listName || 'Imported list').trim() || 'Imported list'
  const legacyUnits = rows.map((r) => ({
    id: r.instanceId,
    name: r.name,
    wounds: r.models,
    entityType: 'UNIT',
    nfcBindable: true,
    certificationRequired: true,
  }))
  const entities = buildRuntimeEntitiesFromLegacyUnits(legacyUnits, systemId)
  return {
    entities,
    relationships: [],
    metadata: {
      listName,
      systemId,
      source: 'operator_import',
    },
  }
}
