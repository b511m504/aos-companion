import type { ArmyList, Assignment, AssignmentExportRow } from "@/models/types"
import { findUnitByEntityId } from "@/utils/entityLookup"
import { isValidUid, normalizeUid } from "@/utils/uid"

export function validateAssignmentShape(a: Assignment): string | null {
  const uid = normalizeUid(a.tagUid)
  if (!isValidUid(uid)) return "Invalid tag UID"
  if (!a.entityId.trim()) return "Missing entity id"
  if (!a.displayName.trim()) return "Missing display name"
  if (!a.factionId.trim()) return "Missing faction id"
  if (!a.gameSystemId.trim()) return "Missing game system id"
  if (!a.entityType.trim()) return "Missing entity type"
  return null
}

export function buildAssignmentForEntity(params: {
  list: ArmyList
  entityId: string
  tagUidRaw: string
  factionId: string
  gameSystemId: string
}): { ok: true; assignment: Assignment } | { ok: false; error: string } {
  const unit = findUnitByEntityId(params.list, params.entityId)
  if (!unit) return { ok: false, error: "Unknown entity id for list" }
  const tagUid = normalizeUid(params.tagUidRaw)
  const a: Assignment = {
    tagUid,
    entityId: unit.id,
    entityType: unit.entityType?.trim() || "unit",
    displayName: unit.name,
    factionId: params.factionId,
    gameSystemId: params.gameSystemId,
    assignedAt: new Date().toISOString(),
    packageId: unit.packageId,
    templateId: unit.templateId
  }
  const err = validateAssignmentShape(a)
  if (err) return { ok: false, error: err }
  return { ok: true, assignment: a }
}

export function assignmentFromExportRow(
  row: AssignmentExportRow,
  ctx: { factionId: string; gameSystemId: string; list: ArmyList }
): { ok: true; assignment: Assignment } | { ok: false; error: string } {
  const unit = findUnitByEntityId(ctx.list, row.entityId)
  if (!unit) return { ok: false, error: `Unknown entity ${row.entityId}` }
  const tagUid = normalizeUid(row.tagUid)
  const a: Assignment = {
    tagUid,
    entityId: unit.id,
    entityType: row.entityType?.trim() || unit.entityType?.trim() || "unit",
    displayName: row.displayName?.trim() || unit.name,
    factionId: row.factionId?.trim() || ctx.factionId,
    gameSystemId: row.gameSystemId?.trim() || ctx.gameSystemId,
    assignedAt: row.assignedAt?.trim() || new Date().toISOString(),
    packageId: row.packageId?.trim() || unit.packageId,
    templateId: row.templateId?.trim() || unit.templateId
  }
  const err = validateAssignmentShape(a)
  if (err) return { ok: false, error: err }
  return { ok: true, assignment: a }
}
