import type { RuntimeEngine } from "@/runtime/RuntimeEngine"
import { RUNTIME_LIMITS } from "@/runtime/runtimeConstants"

export type InvariantViolation = {
  id: string
  detail: string
}

/**
 * Structural checks that do not mutate engine state.
 */
export function checkRuntimeInvariants(engine: RuntimeEngine): InvariantViolation[] {
  const v: InvariantViolation[] = []
  const q = engine.getQueueSnapshot()
  if (q.length > RUNTIME_LIMITS.MAX_QUEUE_STEPS) {
    v.push({ id: "queue_size", detail: `queue length ${q.length} exceeds MAX_QUEUE_STEPS` })
  }
  for (let i = 1; i < q.length; i++) {
    const cur = q[i]!
    if (cur.chainDepth < 0) v.push({ id: "chain_depth", detail: "negative chainDepth in queue snapshot" })
    if (cur.chainDepth > RUNTIME_LIMITS.MAX_CHAIN_DEPTH) {
      v.push({ id: "chain_depth", detail: `chainDepth ${cur.chainDepth} exceeds limit` })
    }
  }
  const ents = engine.stateStore.getAll()
  const seen = new Set<string>()
  for (const e of ents) {
    if (seen.has(e.id)) v.push({ id: "entity_dup", detail: `duplicate entity id ${e.id}` })
    seen.add(e.id)
  }
  const integ = engine.getSnapshotIntegrity()
  if (!integ.fullStateHash || integ.fullStateHash.length < 4) {
    v.push({ id: "integrity_hash", detail: "snapshot integrity hash missing or degenerate" })
  }
  return v
}
