import type { QueuedRuntimeEvent } from "@/runtime/EventQueue"
import { fnv1a32Hex } from "@/runtime/hash/fnv1a32"
import { stableStringify } from "@/runtime/hash/stableStringify"

/**
 * FIFO queue fingerprint (order-sensitive). Uses shallow copies compatible with EventQueue.snapshot().
 */
export function hashQueueState(queue: readonly QueuedRuntimeEvent[]): string {
  const wire = queue.map((q) => ({
    event: q.event,
    chainDepth: q.chainDepth,
    logicalEnqueuedAt: q.logicalEnqueuedAt,
    rootDispatchSeq: q.rootDispatchSeq,
    enqueuedAt: q.enqueuedAt,
    assignmentEntityIds: q.assignments.map((a) => a.entityId).join(",")
  }))
  return fnv1a32Hex(stableStringify(wire))
}
