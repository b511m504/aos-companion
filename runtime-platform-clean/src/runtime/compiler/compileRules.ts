import type { EventRule } from "@/models/runtimeTypes"
import { CompiledRuleIndex } from "@/runtime/compiler/CompiledRuleIndex"

export { CompiledRuleIndex } from "@/runtime/compiler/CompiledRuleIndex"

export function compileRules(rules: readonly EventRule[]): CompiledRuleIndex {
  return new CompiledRuleIndex(rules)
}
