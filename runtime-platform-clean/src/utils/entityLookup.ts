import type { ArmyList, Unit } from "@/models/types"

/** Resolve a unit by stable `id` only — never by array index or display name. */
export function findUnitByEntityId(list: ArmyList, entityId: string): Unit | undefined {
  if (!entityId.trim()) return undefined
  return list.units.find((u) => u.id === entityId)
}

export function entityIdSet(list: ArmyList): Set<string> {
  return new Set(list.units.map((u) => u.id))
}
