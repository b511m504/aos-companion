import type { RuntimeEvent, RuntimeEventName } from "@/models/runtimeTypes"

type Handler = (event: RuntimeEvent) => void

/** Optional external tap — engine also processes rules directly. */
export class EventBus {
  private handlers = new Map<RuntimeEventName, Set<Handler>>()

  on(type: RuntimeEventName, fn: Handler): () => void {
    let set = this.handlers.get(type)
    if (!set) {
      set = new Set()
      this.handlers.set(type, set)
    }
    set.add(fn)
    return () => set!.delete(fn)
  }

  emit(event: RuntimeEvent) {
    const set = this.handlers.get(event.type)
    if (!set) return
    for (const h of set) h(event)
  }
}
