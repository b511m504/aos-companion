import type { RuntimeEntityRecord } from "@/models/runtimeTypes"
import { fnv1a32Hex } from "@/runtime/hash/fnv1a32"
import { stableStringify } from "@/runtime/hash/stableStringify"

/** Canonical entity store hash: order-independent on entity id. */
export function hashEntityStore(entities: readonly RuntimeEntityRecord[]): string {
  const sorted = [...entities].sort((a, b) => a.id.localeCompare(b.id))
  const body = sorted.map((e) => stableStringify(e)).join("\n")
  return fnv1a32Hex(body)
}
