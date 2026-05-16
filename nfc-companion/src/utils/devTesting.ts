import type { ArmyList, Assignment, AssignmentExportBundle } from "@/models/types"
import { generateRandomNormalizedUid } from "@/utils/uid"
import { entityIdSet } from "@/utils/entityLookup"
import { AssignmentRegistry } from "@/services/AssignmentRegistry"

export function devRandomUid(): string {
  return generateRandomNormalizedUid()
}

/** Assign random tags to the first N units (dev / scaling checks). */
export function devBulkRandomAssignments(params: {
  list: ArmyList
  factionId: string
  gameSystemId: string
  count: number
}): Assignment[] {
  const n = Math.min(params.count, params.list.units.length)
  const out: Assignment[] = []
  const now = new Date().toISOString()
  for (let i = 0; i < n; i++) {
    const u = params.list.units[i]!
    out.push({
      tagUid: generateRandomNormalizedUid(),
      entityId: u.id,
      entityType: "unit",
      displayName: u.name,
      factionId: params.factionId,
      gameSystemId: params.gameSystemId,
      assignedAt: now
    })
  }
  return out
}

export function devMockExportBundleJson(params: {
  list: ArmyList
  factionId: string
  gameSystemId: string
}): string {
  const bundle: AssignmentExportBundle = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    gameSystemId: params.gameSystemId,
    factionId: params.factionId,
    listId: params.list.id,
    assignments: params.list.units.slice(0, 3).map((u) => ({
      tagUid: generateRandomNormalizedUid(),
      entityId: u.id,
      displayName: u.name
    }))
  }
  return JSON.stringify(bundle, null, 2)
}

/** Repeated registry integrity checks (scaling validation). */
export function devStressRegistryIterations(params: {
  list: ArmyList
  factionId: string
  gameSystemId: string
  iterations: number
}): { ok: boolean; lastError?: string } {
  const allow = entityIdSet(params.list)
  try {
    for (let i = 0; i < params.iterations; i++) {
      const assigns = devBulkRandomAssignments({
        list: params.list,
        factionId: params.factionId,
        gameSystemId: params.gameSystemId,
        count: params.list.units.length
      })
      const reg = AssignmentRegistry.fromAssignments(assigns)
      const rep = reg.validateRegistryIntegrity({ allowedEntityIds: allow })
      if (!rep.ok) return { ok: false, lastError: rep.issues.map((x) => x.detail).join("; ") }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, lastError: e instanceof Error ? e.message : String(e) }
  }
}
