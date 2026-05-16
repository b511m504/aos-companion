import { defaultCanonicalStates, type CanonicalEntityStates } from "@/models/runtimeTypes"

/** Apply generic overlay keys onto canonical runtime state (import pipeline only). */
export function mergeRuntimeStateOverlay(overlay: Record<string, unknown> | undefined): Partial<CanonicalEntityStates> {
  if (!overlay || typeof overlay !== "object") return {}
  const o = overlay as Record<string, unknown>
  const out: Partial<CanonicalEntityStates> = {}
  if (typeof o.health === "number" && Number.isFinite(o.health)) out.health = o.health
  if (typeof o.resource === "number" && Number.isFinite(o.resource)) out.resource = o.resource
  if (typeof o.cooldown === "number" && Number.isFinite(o.cooldown)) out.cooldown = o.cooldown
  if (typeof o.activated === "boolean") out.activated = o.activated
  if (typeof o.owner === "string") out.owner = o.owner
  if (typeof o.position === "string") out.position = o.position
  if (Array.isArray(o.statuses)) out.statuses = o.statuses.filter((x): x is string => typeof x === "string")
  if (Array.isArray(o.inventory)) out.inventory = o.inventory.filter((x): x is string => typeof x === "string")
  if (o.objective === null || typeof o.objective === "string") out.objective = o.objective as string | null
  return out
}

export function runtimeEntityStatesFromUnitOverlay(overlay: Record<string, unknown> | undefined): CanonicalEntityStates {
  return defaultCanonicalStates({ health: 5, resource: 0, owner: "player1", ...mergeRuntimeStateOverlay(overlay) })
}
