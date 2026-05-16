import type { StateStore } from "@/runtime/StateStore"

import type { RuntimeEvent } from "@/models/runtimeTypes"

/**
 * Carried through chained dispatches so actions can refer to the original NFC / selection subject
 * and an optional effect subject (e.g. trap damage applied to a different entity id).
 */
export type RuntimeChainFrame = {
  /** Depth-0 event that started this chain (NFC scan, selection, …). */
  rootEvent: RuntimeEvent
  /** Primary entity id from the root dispatch payload (scan/selection subject). */
  rootPrimaryEntityId: string | null
  /** Resolves JSON target token `selected_entity` — may differ from scan subject when payload overrides. */
  effectSubjectId: string | null
  /** Monotonic id for the outer dispatch that created this chain (follow-ups inherit). */
  rootDispatchSeq: number
}

export function createChainFrame(params: {
  rootEvent: RuntimeEvent
  primaryEntityId: string | null
  effectSubjectId: string | null
  rootDispatchSeq: number
}): RuntimeChainFrame {
  return {
    rootEvent: params.rootEvent,
    rootPrimaryEntityId: params.primaryEntityId,
    effectSubjectId: params.effectSubjectId,
    rootDispatchSeq: params.rootDispatchSeq
  }
}

/** Entity id literals pass through; reserved tokens are resolved against the chain frame. */
export function resolveTargetToken(
  token: string,
  chain: RuntimeChainFrame,
  currentPrimaryEntityId: string | null
): string | null {
  if (token === "selected_entity") return chain.effectSubjectId ?? currentPrimaryEntityId
  if (token === "triggering_entity") return chain.rootPrimaryEntityId ?? currentPrimaryEntityId
  return token
}

/**
 * Canonical multi-entity selection groups (data-driven JSON uses ids, not per-system branches).
 */
export function resolveTargetGroup(
  group: string,
  chain: RuntimeChainFrame,
  store: StateStore
): string[] {
  if (group === "nearby_allies") {
    const heroId = chain.rootPrimaryEntityId
    if (!heroId) return []
    const hero = store.getEntity(heroId)
    if (!hero) return []
    const owner = hero.states.owner
    return store
      .getAll()
      .filter((e) => e.id !== heroId && e.states.owner === owner && e.tags.includes("ally"))
      .map((e) => e.id)
  }
  return []
}
