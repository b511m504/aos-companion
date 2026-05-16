import type { EventRule } from "@/models/runtimeTypes"
import type { RuntimeEventName } from "@/runtime/runtimeConstants"

/**
 * Precomputed trigger → rules (same relative order as legacy full scan: priority desc, stable id tie-break).
 */
export class CompiledRuleIndex {
  private readonly byTrigger = new Map<string, EventRule[]>()

  constructor(rules: readonly EventRule[]) {
    const sorted = [...rules].sort((a, b) => {
      const dp = (b.priority ?? 0) - (a.priority ?? 0)
      if (dp !== 0) return dp
      return a.id.localeCompare(b.id)
    })
    for (const r of sorted) {
      const t = r.trigger as string
      const arr = this.byTrigger.get(t)
      if (arr) arr.push(r)
      else this.byTrigger.set(t, [r])
    }
  }

  /** Rules for trigger, filtered by appliesToSystems (same semantics as RuntimeEngine). */
  rulesForTrigger(trigger: RuntimeEventName, systemId: string | null): EventRule[] {
    const list = this.byTrigger.get(trigger) ?? []
    return list.filter((r) => {
      if (r.appliesToSystems?.length) {
        if (!systemId || !r.appliesToSystems.includes(systemId)) return false
      }
      return true
    })
  }

  /** Package partition: rule ids per trigger (diagnostics). */
  triggerPartitions(): Record<string, string[]> {
    const out: Record<string, string[]> = {}
    for (const [k, v] of this.byTrigger) {
      out[k] = v.map((r) => r.id)
    }
    return out
  }
}

export function compileRules(rules: readonly EventRule[]): CompiledRuleIndex {
  return new CompiledRuleIndex(rules)
}
