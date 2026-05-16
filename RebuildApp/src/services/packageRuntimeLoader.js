/**
 * Manifest-driven package runtime loader.
 * Keeps runtime generic: entities/actions/mappings are data, not hardcoded rules.
 */

const PACKAGE_ROOT = '/packages'

function asArray(v) {
  return Array.isArray(v) ? v : []
}

function trimString(v) {
  return String(v || '').trim()
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`fetch_failed:${res.status}:${url}`)
  }
  return res.json()
}

function toUidKey(uid) {
  return trimString(uid).toUpperCase()
}

function normalizeEntityRow(row, idx) {
  const id = trimString(row?.id)
  if (!id) return null
  return {
    id,
    type: trimString(row?.type || 'entity'),
    name: trimString(row?.name || id),
    wounds: Number(row?.wounds) || 0,
    keywords: asArray(row?.keywords).map((k) => trimString(k)).filter(Boolean),
    runtimeEntityId: trimString(row?.runtimeEntityId || id),
    ordinal: idx,
  }
}

function normalizeActionRow(row, idx) {
  const id = trimString(row?.id)
  if (!id) return null
  const kind = trimString(row?.kind || 'mutation')
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {}
  return { id, kind, payload, ordinal: idx }
}

function normalizeMappingRow(row, idx) {
  const uid = toUidKey(row?.uid)
  const entityId = trimString(row?.entityId)
  if (!uid || !entityId) return null
  return {
    uid,
    entityId,
    runtimeEntityId: trimString(row?.runtimeEntityId || ''),
    actionId: trimString(row?.actionId || ''),
    ordinal: idx,
  }
}

function indexById(rows) {
  const out = Object.create(null)
  for (const row of rows) {
    out[row.id] = row
  }
  return out
}

/**
 * @param {string} packageId
 * @returns {Promise<{
 *   ok: true,
 *   packageDefinition: {
 *     id: string,
 *     version: string,
 *     name: string,
 *     entitiesById: Record<string, any>,
 *     actionsById: Record<string, any>,
 *     uidMappings: Record<string, any>,
 *   }
 * } | { ok: false, error: string }>}
 */
export async function loadPackageRuntimeDefinition(packageId) {
  const id = trimString(packageId)
  if (!id) return { ok: false, error: 'missing_package_id' }

  const base = `${PACKAGE_ROOT}/${encodeURIComponent(id)}`
  let manifest
  try {
    manifest = await fetchJson(`${base}/manifest.json`)
  } catch (err) {
    return { ok: false, error: String(err?.message || err) }
  }

  const manifestId = trimString(manifest?.id || id)
  const entityFiles = asArray(manifest?.entityFiles).filter(Boolean)
  const actionFiles = asArray(manifest?.actionFiles).filter(Boolean)
  const mappingFiles = asArray(manifest?.mappingFiles).filter(Boolean)
  if (!entityFiles.length) return { ok: false, error: 'manifest_missing_entity_files' }

  try {
    const entityRows = []
    for (const file of entityFiles) {
      const data = await fetchJson(`${base}/${file}`)
      for (const [idx, row] of asArray(data).entries()) {
        const n = normalizeEntityRow(row, idx)
        if (n) entityRows.push(n)
      }
    }

    const actionRows = []
    for (const file of actionFiles) {
      const data = await fetchJson(`${base}/${file}`)
      for (const [idx, row] of asArray(data).entries()) {
        const n = normalizeActionRow(row, idx)
        if (n) actionRows.push(n)
      }
    }

    const mappingRows = []
    for (const file of mappingFiles) {
      const data = await fetchJson(`${base}/${file}`)
      for (const [idx, row] of asArray(data).entries()) {
        const n = normalizeMappingRow(row, idx)
        if (n) mappingRows.push(n)
      }
    }

    const entitiesById = indexById(entityRows)
    const actionsById = indexById(actionRows)
    const uidMappings = Object.create(null)
    for (const m of mappingRows) {
      const ent = entitiesById[m.entityId]
      if (!ent) continue
      uidMappings[m.uid] = {
        uid: m.uid,
        entityId: m.entityId,
        runtimeEntityId: m.runtimeEntityId || ent.runtimeEntityId || m.entityId,
        actionId: m.actionId || '',
      }
    }

    return {
      ok: true,
      packageDefinition: {
        id: manifestId,
        version: trimString(manifest?.version || '0.0.0'),
        name: trimString(manifest?.name || manifestId),
        entitiesById,
        actionsById,
        uidMappings,
      },
    }
  } catch (err) {
    return { ok: false, error: String(err?.message || err) }
  }
}

export function resolveSemanticMappingFromPackageDefinition(definition, uid) {
  if (!definition || typeof definition !== 'object') return null
  const key = toUidKey(uid)
  if (!key) return null
  const map = definition.uidMappings && typeof definition.uidMappings === 'object'
    ? definition.uidMappings
    : null
  if (!map) return null
  return map[key] || null
}
