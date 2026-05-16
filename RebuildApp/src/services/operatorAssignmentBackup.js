/**
 * Portable NFC assignment backup (roster-bound identity only).
 * Schema is versioned for forward-compatible imports.
 */

import { normalizeUid } from './operatorAssignmentService.js'

export const OPERATOR_ASSIGNMENT_BACKUP_SCHEMA = 1
export const SUPPORTED_ASSIGNMENT_BACKUP_SCHEMA_MAX = 1

/**
 * @param {unknown} raw
 * @returns {{ ok: boolean, errors: string[], bundle?: object, normalized?: Array<{ entityId: string, uidNorm: string }> }}
 */
export function validateAssignmentBundle(raw) {
  const errors = []
  let o = raw
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw)
    } catch {
      return { ok: false, errors: ['Invalid JSON'] }
    }
  }
  if (!o || typeof o !== 'object') {
    return { ok: false, errors: ['Expected an object'] }
  }
  const sv = Number(o.schemaVersion)
  if (!Number.isFinite(sv) || sv < 1) {
    errors.push('Missing or invalid schemaVersion')
  }
  if (sv > SUPPORTED_ASSIGNMENT_BACKUP_SCHEMA_MAX) {
    errors.push(`Backup schema ${sv} is newer than this app supports (max ${SUPPORTED_ASSIGNMENT_BACKUP_SCHEMA_MAX})`)
  }
  const packageKey = String(o.packageKey || '').trim()
  if (!packageKey.startsWith('operator:')) {
    errors.push('packageKey must be an operator session key (operator:…)')
  }
  const rosterId = String(o.rosterId || '').trim()
  if (!rosterId) {
    errors.push('Missing rosterId')
  }
  const assignments = o.assignments
  if (!Array.isArray(assignments)) {
    errors.push('assignments must be an array')
    return { ok: false, errors }
  }
  const normalized = []
  for (let i = 0; i < assignments.length; i += 1) {
    const row = assignments[i]
    if (!row || typeof row !== 'object') {
      errors.push(`assignments[${i}] is not an object`)
      continue
    }
    const entityId = String(row.entityId ?? '').trim()
    const uidNorm = normalizeUid(row.uid)
    if (!entityId) {
      errors.push(`assignments[${i}]: missing entityId`)
      continue
    }
    if (!uidNorm) {
      errors.push(`assignments[${i}]: missing or invalid uid`)
      continue
    }
    normalized.push({ entityId, uidNorm })
  }
  if (errors.length) return { ok: false, errors }
  return { ok: true, errors: [], bundle: o, normalized }
}

function slugRosterId(name) {
  const s = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return s || 'roster'
}

/**
 * @param {{
 *   packageKey: string,
 *   rosterId?: string,
 *   rosterName?: string,
 *   nfcAssignments: Record<string, { uid?: string, assignedAt?: number, scanCount?: number, package?: string, writable?: boolean }>,
 *   entities: Array<{ entityId: string }>,
 * }} input
 */
export function exportAssignmentBundle(input) {
  const packageKey = String(input.packageKey || '').trim()
  const entities = Array.isArray(input.entities) ? input.entities : []
  const nfc = input.nfcAssignments && typeof input.nfcAssignments === 'object' ? input.nfcAssignments : {}
  const rosterId = String(input.rosterId || '').trim() || slugRosterId(input.rosterName)
  const assignments = []
  for (const e of entities) {
    const uidNorm = normalizeUid(nfc[e.entityId]?.uid)
    if (!uidNorm) continue
    assignments.push({ entityId: e.entityId, uid: uidNorm })
  }
  const payload = {
    schemaVersion: OPERATOR_ASSIGNMENT_BACKUP_SCHEMA,
    packageKey,
    rosterId,
    rosterName: String(input.rosterName || '').trim() || undefined,
    exportedAt: new Date().toISOString(),
    assignments,
  }
  return JSON.stringify(payload, null, 0)
}

/**
 * Compare backup to current roster; does not mutate.
 * @param {object} bundle validated bundle object
 * @param {{ entities: Array<{ entityId: string }>, nfcAssignments: Record<string, { uid?: string }>, packageKey: string }} ctx
 */
export function previewAssignmentBundleImport(bundle, ctx) {
  const v = validateAssignmentBundle(bundle)
  if (!v.ok) return { ok: false, errors: v.errors }
  if (String(bundle.packageKey || '').trim() !== String(ctx.packageKey || '').trim()) {
    return {
      ok: false,
      errors: ['This backup was exported for a different session (packageKey mismatch).'],
    }
  }
  const entities = Array.isArray(ctx.entities) ? ctx.entities : []
  const entityIds = new Set(entities.map((e) => e.entityId))
  const nfc = ctx.nfcAssignments && typeof ctx.nfcAssignments === 'object' ? { ...ctx.nfcAssignments } : {}
  const normalized = v.normalized || []
  const toApply = []
  const conflicts = []
  const unknownEntityIds = []
  for (const row of normalized) {
    if (!entityIds.has(row.entityId)) {
      unknownEntityIds.push(row.entityId)
      continue
    }
    const current = normalizeUid(nfc[row.entityId]?.uid)
    if (current && current !== row.uidNorm) {
      conflicts.push({ entityId: row.entityId, currentUid: current, importUid: row.uidNorm })
    } else {
      toApply.push(row)
    }
  }
  return {
    ok: true,
    toApply,
    conflicts,
    unknownEntityIds,
    normalized,
  }
}

/**
 * Apply validated rows onto nfcAssignments; returns new maps.
 * @param {'merge_safe' | 'replace_all'} mode
 */
export function mergeImportedAssignmentRows(nfcAssignments, rows, entities, packageKey, mode) {
  const ents = Array.isArray(entities) ? entities : []
  const entityIds = new Set(ents.map((e) => e.entityId))
  const next = { ...(nfcAssignments && typeof nfcAssignments === 'object' ? nfcAssignments : {}) }
  const now = Date.now()
  const applyRow = (row) => {
    if (!entityIds.has(row.entityId)) return
    const prev = next[row.entityId] || {}
    if (mode === 'merge_safe') {
      const cur = normalizeUid(prev.uid)
      if (cur && cur !== row.uidNorm) return
    }
    next[row.entityId] = {
      ...prev,
      uid: row.uidNorm,
      assignedAt: now,
      writable: true,
      scanCount: Number(prev.scanCount) || 1,
      package: packageKey,
    }
  }
  for (const row of rows) {
    applyRow(row)
  }
  return next
}

/**
 * @param {unknown} raw
 * @param {{ entities: Array<{ entityId: string }>, nfcAssignments: Record<string, { uid?: string }>, packageKey: string, mode: 'merge_safe' | 'replace_all' }} ctx
 */
export function importAssignmentBundle(raw, ctx) {
  let parsed = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { ok: false, errors: ['Invalid JSON'] }
    }
  }
  const v = validateAssignmentBundle(parsed)
  if (!v.ok) return { ok: false, errors: v.errors }
  const preview = previewAssignmentBundleImport(parsed, ctx)
  if (!preview.ok) return { ok: false, errors: preview.errors || ['Preview failed'] }
  const rows =
    ctx.mode === 'replace_all' ? preview.normalized.filter((r) => ctx.entities.some((e) => e.entityId === r.entityId)) : preview.toApply
  if (ctx.mode === 'merge_safe' && preview.conflicts.length > 0 && rows.length === 0) {
    return {
      ok: false,
      code: 'NEEDS_OVERWRITE',
      conflicts: preview.conflicts,
      message: 'Some units already have different tags. Choose replace or cancel.',
    }
  }
  const nextNfc = mergeImportedAssignmentRows(ctx.nfcAssignments, rows, ctx.entities, ctx.packageKey, ctx.mode)
  return {
    ok: true,
    nfcAssignments: nextNfc,
    appliedCount: rows.length,
    conflictsSkipped: ctx.mode === 'merge_safe' ? preview.conflicts.length : 0,
  }
}
