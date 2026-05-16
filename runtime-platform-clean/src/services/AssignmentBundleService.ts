import type {
  ArmyList,
  Assignment,
  AssignmentExportBundle,
  AssignmentExportRow,
  ImportMergeStrategy
} from "@/models/types"
import { AssignmentRegistry } from "@/services/AssignmentRegistry"
import { assignmentFromExportRow } from "@/services/assignmentValidation"
import { normalizeUid } from "@/utils/uid"

export type ParsedBundle = { ok: true; bundle: AssignmentExportBundle } | { ok: false; errors: string[] }

export type ImportPreviewRowStatus =
  | "ok"
  | "invalid_uid"
  | "unknown_entity"
  | "uid_conflict_current"
  | "uid_conflict_batch"
  | "entity_conflict_batch"

export type ImportPreviewRow = {
  index: number
  row: AssignmentExportRow
  status: ImportPreviewRowStatus
  detail?: string
  resolved?: Assignment
}

export type ImportPreview = {
  rows: ImportPreviewRow[]
  /** All rows must be ok for strict apply. */
  canApplyStrict: boolean
  /** Rows that can be merged without touching non-listed entities (safe_partial). */
  applicable: Assignment[]
  rejected: ImportPreviewRow[]
}

export function parseAssignmentBundleJson(raw: string): ParsedBundle {
  const errors: string[] = []
  let data: unknown
  try {
    data = JSON.parse(raw) as unknown
  } catch {
    return { ok: false, errors: ["Invalid JSON"] }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, errors: ["Root must be an object"] }
  }
  const o = data as Record<string, unknown>
  if (o.schemaVersion !== 1) errors.push('schemaVersion must be 1')
  for (const k of ["exportedAt", "gameSystemId", "factionId", "listId"] as const) {
    if (typeof o[k] !== "string" || !(o[k] as string).trim()) errors.push(`Missing string: ${k}`)
  }
  if (!Array.isArray(o.assignments)) errors.push("assignments must be an array")
  if (errors.length) return { ok: false, errors }

  const assignments = (o.assignments as unknown[]).map((r, i) => {
    if (!r || typeof r !== "object" || Array.isArray(r)) {
      errors.push(`assignments[${i}] must be an object`)
      return null
    }
    const row = r as Record<string, unknown>
    if (typeof row.tagUid !== "string" || typeof row.entityId !== "string" || typeof row.displayName !== "string") {
      errors.push(`assignments[${i}] requires tagUid, entityId, displayName strings`)
      return null
    }
    const out: AssignmentExportRow = {
      tagUid: row.tagUid,
      entityId: row.entityId,
      displayName: row.displayName
    }
    if (typeof row.entityType === "string") out.entityType = row.entityType
    if (typeof row.assignedAt === "string") out.assignedAt = row.assignedAt
    if (typeof row.factionId === "string") out.factionId = row.factionId
    if (typeof row.gameSystemId === "string") out.gameSystemId = row.gameSystemId
    if (typeof row.packageId === "string") out.packageId = row.packageId
    if (typeof row.templateId === "string") out.templateId = row.templateId
    return out
  })
  if (errors.length) return { ok: false, errors }

  const bundle: AssignmentExportBundle = {
    schemaVersion: 1,
    exportedAt: o.exportedAt as string,
    gameSystemId: o.gameSystemId as string,
    factionId: o.factionId as string,
    listId: o.listId as string,
    assignments: assignments.filter(Boolean) as AssignmentExportRow[]
  }

  const idErrors = validateBundleIdentityConsistency(bundle)
  if (idErrors.length) return { ok: false, errors: idErrors }

  return { ok: true, bundle }
}

function validateBundleIdentityConsistency(bundle: AssignmentExportBundle): string[] {
  const errors: string[] = []
  const uidToEntity = new Map<string, string>()
  const entityToUid = new Map<string, string>()
  bundle.assignments.forEach((row, i) => {
    const uid = normalizeUid(row.tagUid)
    const eid = row.entityId.trim()
    if (!uid) errors.push(`assignments[${i}]: empty or invalid UID`)
    if (!eid) errors.push(`assignments[${i}]: empty entityId`)
    if (!uid || !eid) return
    const prevE = uidToEntity.get(uid)
    if (prevE && prevE !== eid) {
      errors.push(`assignments[${i}]: UID ${uid} also targets entity ${prevE}`)
    }
    uidToEntity.set(uid, eid)
    const prevU = entityToUid.get(eid)
    if (prevU && prevU !== uid) {
      errors.push(`assignments[${i}]: entity ${eid} also has UID ${prevU}`)
    }
    entityToUid.set(eid, uid)
  })
  return errors
}

export function exportAssignmentBundleJson(params: {
  assignments: readonly Assignment[]
  listId: string
  factionId: string
  gameSystemId: string
}): string {
  const bundle: AssignmentExportBundle = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    gameSystemId: params.gameSystemId,
    factionId: params.factionId,
    listId: params.listId,
    assignments: params.assignments.map((a) => ({
      tagUid: normalizeUid(a.tagUid),
      entityId: a.entityId,
      displayName: a.displayName,
      entityType: a.entityType,
      assignedAt: a.assignedAt,
      factionId: a.factionId,
      gameSystemId: a.gameSystemId,
      ...(a.packageId ? { packageId: a.packageId } : {}),
      ...(a.templateId ? { templateId: a.templateId } : {})
    }))
  }
  return JSON.stringify(bundle, null, 2)
}

export function previewAssignmentBundleImport(params: {
  bundle: AssignmentExportBundle
  currentAssignments: readonly Assignment[]
  list: ArmyList
  factionId: string
  gameSystemId: string
}): ImportPreview {
  const rows: ImportPreviewRow[] = []
  const rejected: ImportPreviewRow[] = []
  const applicable: Assignment[] = []

  const currentReg = AssignmentRegistry.fromAssignments(params.currentAssignments)
  const uidToEntity = new Map<string, string>()
  const entityToUid = new Map<string, string>()

  params.bundle.assignments.forEach((row, index) => {
    const uid = normalizeUid(row.tagUid)
    const eid = row.entityId.trim()
    let status: ImportPreviewRowStatus = "ok"
    let detail: string | undefined
    let resolved: Assignment | undefined

    if (!uid) {
      status = "invalid_uid"
      detail = "Empty or non-normalizable UID"
    } else if (!eid) {
      status = "unknown_entity"
      detail = "Empty entity id"
    } else {
      const prevE = uidToEntity.get(uid)
      if (prevE && prevE !== eid) {
        status = "uid_conflict_batch"
        detail = `UID already used for entity ${prevE} in this bundle`
      }
      const prevU = entityToUid.get(eid)
      if (prevU && prevU !== uid) {
        status = "entity_conflict_batch"
        detail = `Entity already mapped to ${prevU} elsewhere in this bundle`
      }
    }

    if (status === "ok") {
      const built = assignmentFromExportRow(row, {
        list: params.list,
        factionId: params.factionId,
        gameSystemId: params.gameSystemId
      })
      if (!built.ok) {
        status = "unknown_entity"
        detail = built.error
      } else {
        resolved = built.assignment
        const cur = currentReg.findByUid(uid)
        if (cur && cur.entityId !== resolved.entityId) {
          status = "uid_conflict_current"
          detail = `UID in use by ${cur.displayName} (${cur.entityId})`
        }
      }
    }

    if (status === "ok" && resolved) {
      uidToEntity.set(uid, eid)
      entityToUid.set(eid, uid)
    }

    const pr: ImportPreviewRow = { index, row, status, detail, resolved }
    rows.push(pr)
    if (status !== "ok") rejected.push(pr)
    else if (resolved) applicable.push(resolved)
  })

  return {
    rows,
    canApplyStrict: rejected.length === 0,
    applicable,
    rejected
  }
}

export function applyAssignmentImportPreview(params: {
  preview: ImportPreview
  strategy: ImportMergeStrategy
  currentAssignments: readonly Assignment[]
}): { next: Assignment[]; applied: number; skipped: number; error?: string } {
  if (params.strategy === "strict") {
    if (!params.preview.canApplyStrict) {
      return {
        next: [...params.currentAssignments],
        applied: 0,
        skipped: params.preview.rejected.length,
        error: "Strict import rejected: fix conflicts or use safe partial merge."
      }
    }
    const reg = AssignmentRegistry.fromAssignments(params.currentAssignments)
    for (const a of params.preview.applicable) {
      const up = reg.upsert(a)
      if (!up.ok) {
        return {
          next: [...params.currentAssignments],
          applied: 0,
          skipped: params.preview.applicable.length,
          error: `Strict import failed on upsert: ${up.error}`
        }
      }
    }
    return { next: reg.getAll(), applied: params.preview.applicable.length, skipped: 0 }
  }

  const reg = AssignmentRegistry.fromAssignments(params.currentAssignments)
  let applied = 0
  for (const a of params.preview.applicable) {
    const cur = reg.findByUid(a.tagUid)
    if (cur && cur.entityId !== a.entityId) {
      continue
    }
    const r = reg.upsert(a)
    if (r.ok) applied++
  }
  const skipped = params.preview.applicable.length - applied + params.preview.rejected.length
  return { next: reg.getAll(), applied, skipped }
}
