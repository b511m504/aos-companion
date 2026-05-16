import type { AssignmentConflict } from "@/models/types"
import type { AssignmentRegistry } from "@/services/AssignmentRegistry"
import { normalizeUid } from "@/utils/uid"

export type ConflictCheckResult =
  | { status: "ok" }
  | { status: "conflict"; conflict: AssignmentConflict }

export function checkUidConflict(params: {
  registry: AssignmentRegistry
  rawUid: string
  targetEntityId: string
  targetDisplayName: string
}): ConflictCheckResult {
  const uid = normalizeUid(params.rawUid)
  if (!uid) return { status: "ok" }

  const existing = params.registry.findByUid(uid)
  if (!existing) return { status: "ok" }
  if (existing.entityId === params.targetEntityId) return { status: "ok" }

  return {
    status: "conflict",
    conflict: {
      tagUid: uid,
      existing,
      proposedEntityId: params.targetEntityId,
      proposedDisplayName: params.targetDisplayName
    }
  }
}

export function applyReassignment(params: {
  registry: AssignmentRegistry
  conflict: AssignmentConflict
}): void {
  params.registry.removeByEntity(params.conflict.existing.entityId)
}
