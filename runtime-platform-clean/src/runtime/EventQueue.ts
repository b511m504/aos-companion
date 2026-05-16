import type { Assignment } from "@/models/types"
import type { RuntimeEvent } from "@/models/runtimeTypes"
import type { RuntimeChainFrame } from "@/runtime/targetResolution"

export type QueuedRuntimeEvent = {
  event: RuntimeEvent
  assignments: readonly Assignment[]
  /** Null only for synthetic root; follow-ups carry the root chain. */
  chain: RuntimeChainFrame | null
  chainDepth: number
  enqueuedAt: number
  /** Logical time step for deterministic dedupe / replay (optional for legacy stress paths). */
  logicalEnqueuedAt: number
  /** Outer dispatch sequence; follow-ups inherit from chain.rootDispatchSeq. */
  rootDispatchSeq: number
}

/**
 * FIFO queue for runtime events. Follow-ups enqueue here instead of recursive dispatch.
 */
export class EventQueue {
  private items: QueuedRuntimeEvent[] = []

  enqueue(item: QueuedRuntimeEvent) {
    this.items.push(item)
  }

  dequeue(): QueuedRuntimeEvent | undefined {
    return this.items.shift()
  }

  get length(): number {
    return this.items.length
  }

  snapshot(): QueuedRuntimeEvent[] {
    return this.items.map((q) => ({
      event: { type: q.event.type, payload: { ...q.event.payload } },
      assignments: q.assignments,
      chain: q.chain,
      chainDepth: q.chainDepth,
      enqueuedAt: q.enqueuedAt,
      logicalEnqueuedAt: q.logicalEnqueuedAt,
      rootDispatchSeq: q.rootDispatchSeq
    }))
  }

  /** Replace queue contents (deterministic restore). Items are copied. */
  restoreSnapshot(items: readonly QueuedRuntimeEvent[]) {
    this.items = items.map((q) => ({
      event: { type: q.event.type, payload: { ...q.event.payload } },
      assignments: q.assignments,
      chain: q.chain
        ? {
            rootEvent: { type: q.chain.rootEvent.type, payload: { ...q.chain.rootEvent.payload } },
            rootPrimaryEntityId: q.chain.rootPrimaryEntityId,
            effectSubjectId: q.chain.effectSubjectId,
            rootDispatchSeq: q.chain.rootDispatchSeq
          }
        : null,
      chainDepth: q.chainDepth,
      enqueuedAt: q.enqueuedAt,
      logicalEnqueuedAt: q.logicalEnqueuedAt,
      rootDispatchSeq: q.rootDispatchSeq
    }))
  }

  clear() {
    this.items = []
  }
}
