import type { Assignment } from "@/models/types"
import type { Condition, RuntimeEntityRecord, RuntimeEvent, RuntimeExecutionContext } from "@/models/runtimeTypes"
import type { StateStore } from "@/runtime/StateStore"
import type { RuntimeChainFrame } from "@/runtime/targetResolution"

import type { SeededRandom } from "@/runtime/random/SeededRandom"

export type EvaluationContext = {
  event: RuntimeEvent
  execution: RuntimeExecutionContext
  chain: RuntimeChainFrame
  stateStore: StateStore
  /** Primary subject of the *current* event (payload entityId / targetEntityId). */
  primaryEntityId: string | null
  assignments: ReadonlyMap<string, Assignment>
  /** Deterministic RNG for random_below and future data-driven tables. */
  rng: SeededRandom
}

function getEntity(ctx: EvaluationContext, entityId: string | undefined): RuntimeEntityRecord | undefined {
  const id = entityId ?? ctx.primaryEntityId
  if (!id) return undefined
  return ctx.stateStore.getEntity(id)
}

function readStateValue(entity: RuntimeEntityRecord, key: string): unknown {
  const s = entity.states as Record<string, unknown>
  return s[key]
}

export function evaluateCondition(ctx: EvaluationContext, condition: Condition): { ok: boolean; detail: string } {
  switch (condition.type) {
    case "entity_exists": {
      const id = condition.entityId ?? ctx.primaryEntityId
      const ex = id ? ctx.stateStore.getEntity(id) : undefined
      return {
        ok: Boolean(ex),
        detail: id ? `entity_exists(${id}) → ${ex ? "yes" : "no"}` : "entity_exists → no entity id in context"
      }
    }
    case "entity_has_tag": {
      const ent = getEntity(ctx, condition.entityId)
      if (!ent) return { ok: false, detail: `entity_has_tag(${condition.tag}) → no entity` }
      const ok = ent.tags.includes(condition.tag)
      return { ok, detail: `entity_has_tag(${condition.tag}) on ${ent.id} → ${ok}` }
    }
    case "state_equals": {
      const ent = ctx.stateStore.getEntity(condition.target)
      if (!ent) return { ok: false, detail: `state_equals → unknown target ${condition.target}` }
      const cur = readStateValue(ent, condition.key as string)
      const ok = cur === condition.value
      return { ok, detail: `state_equals ${condition.target}.${String(condition.key)} (${JSON.stringify(cur)} vs ${JSON.stringify(condition.value)})` }
    }
    case "state_greater_than": {
      const ent = ctx.stateStore.getEntity(condition.target)
      if (!ent) return { ok: false, detail: `state_greater_than → unknown target ${condition.target}` }
      const cur = readStateValue(ent, condition.key as string)
      const n = typeof cur === "number" ? cur : NaN
      const ok = n > condition.value
      return { ok, detail: `state_greater_than ${condition.target}.${String(condition.key)} (${n} > ${condition.value})` }
    }
    case "status_present": {
      const ent = ctx.stateStore.getEntity(condition.target)
      if (!ent) return { ok: false, detail: `status_present → unknown ${condition.target}` }
      const ok = ent.states.statuses.includes(condition.status)
      return { ok, detail: `status_present(${condition.status}) on ${condition.target} → ${ok}` }
    }
    case "owner_matches": {
      const ent = ctx.stateStore.getEntity(condition.target)
      if (!ent) return { ok: false, detail: `owner_matches → unknown ${condition.target}` }
      const ok = ent.states.owner === condition.owner
      return { ok, detail: `owner_matches ${condition.target}.owner === ${condition.owner} → ${ok}` }
    }
    case "random_below": {
      const t = condition.threshold
      if (typeof t !== "number" || !Number.isFinite(t) || t < 0 || t > 1) {
        return { ok: false, detail: "random_below threshold must be in [0,1]" }
      }
      const roll = ctx.rng.nextFloat()
      const ok = roll < t
      return { ok, detail: `random_below roll=${roll.toFixed(6)} < ${t} → ${ok}` }
    }
    default: {
      const c = condition as { type: string }
      return { ok: false, detail: `unsupported condition type: ${c.type}` }
    }
  }
}

export function evaluateAllConditions(ctx: EvaluationContext, conditions: Condition[]): { ok: boolean; details: string[] } {
  const details: string[] = []
  for (const c of conditions) {
    const r = evaluateCondition(ctx, c)
    details.push(r.detail)
    if (!r.ok) return { ok: false, details }
  }
  return { ok: true, details }
}
