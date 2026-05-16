import type { RuntimeEntityRecord } from "@/models/runtimeTypes"
import type { QueuedRuntimeEvent } from "@/runtime/EventQueue"
import type { SeededRandomState } from "@/runtime/random/SeededRandom"
import { fnv1a32Hex } from "@/runtime/hash/fnv1a32"
import { hashEntityStore } from "@/runtime/hash/hashEntityStore"
import { hashQueueState } from "@/runtime/hash/hashQueueState"
import { stableStringify } from "@/runtime/hash/stableStringify"

export type SnapshotIntegrityHashes = {
  entityCanonicalHash: string
  queueHash: string
  rngHash: string
  fullStateHash: string
}

export function hashRngState(state: SeededRandomState): string {
  return fnv1a32Hex(stableStringify(state))
}

export function computeSnapshotIntegrity(params: {
  entities: readonly RuntimeEntityRecord[]
  queue: readonly QueuedRuntimeEvent[]
  rng: SeededRandomState
  logicalClock: number
  rootDispatchCounter: number
}): SnapshotIntegrityHashes {
  const entityCanonicalHash = hashEntityStore(params.entities)
  const queueHash = hashQueueState(params.queue)
  const rngHash = hashRngState(params.rng)
  const fullStateHash = fnv1a32Hex(
    stableStringify({
      e: entityCanonicalHash,
      q: queueHash,
      r: rngHash,
      lc: params.logicalClock,
      rd: params.rootDispatchCounter
    })
  )
  return { entityCanonicalHash, queueHash, rngHash, fullStateHash }
}
