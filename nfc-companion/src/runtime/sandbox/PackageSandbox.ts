import { RUNTIME_LIMITS } from "@/runtime/runtimeConstants"

export type PackageCapabilities = {
  spawnEntities?: boolean
  timers?: boolean
  persistentEffects?: boolean
  maxChainDepthOverride?: number | null
  /** Cap follow-up emits chained under one root outer dispatch (flush cycle). */
  maxEmitsPerRootDispatch?: number | null
  /** Cap upsert_entity successes evaluated in a single queued event step. */
  maxSpawnedEntitiesPerTick?: number | null
  /** Max queue length before soft halt (containment). */
  maxQueueLength?: number | null
}

export type MergedSandboxConfig = {
  maxChainDepth: number
  maxFollowUpsPerRoot: number
  maxRuleCount: number
  maxEmitsPerRootDispatch: number
  maxSpawnedEntitiesPerTick: number
  maxQueueLength: number
}

const DEFAULT_FOLLOWUPS = 8000
const DEFAULT_MAX_EMITS_ROOT = 100_000
const DEFAULT_MAX_SPAWN_TICK = 10_000
const DEFAULT_MAX_QUEUE = 500_000

export function mergeSandboxConfig(
  manifests: Array<{ capabilities?: PackageCapabilities } | null | undefined>
): MergedSandboxConfig {
  let maxChainDepth: number = RUNTIME_LIMITS.MAX_CHAIN_DEPTH as number
  let maxFollowUpsPerRoot = DEFAULT_FOLLOWUPS
  let maxRuleCount = 50_000
  let maxEmitsPerRootDispatch = DEFAULT_MAX_EMITS_ROOT
  let maxSpawnedEntitiesPerTick = DEFAULT_MAX_SPAWN_TICK
  let maxQueueLength = DEFAULT_MAX_QUEUE
  for (const m of manifests) {
    const c = m?.capabilities
    if (!c) continue
    if (typeof c.maxChainDepthOverride === "number" && Number.isFinite(c.maxChainDepthOverride) && c.maxChainDepthOverride > 0) {
      maxChainDepth = Math.min(maxChainDepth, Math.floor(c.maxChainDepthOverride))
    }
    if (typeof c.maxEmitsPerRootDispatch === "number" && Number.isFinite(c.maxEmitsPerRootDispatch) && c.maxEmitsPerRootDispatch > 0) {
      maxEmitsPerRootDispatch = Math.min(maxEmitsPerRootDispatch, Math.floor(c.maxEmitsPerRootDispatch))
    }
    if (typeof c.maxSpawnedEntitiesPerTick === "number" && Number.isFinite(c.maxSpawnedEntitiesPerTick) && c.maxSpawnedEntitiesPerTick > 0) {
      maxSpawnedEntitiesPerTick = Math.min(maxSpawnedEntitiesPerTick, Math.floor(c.maxSpawnedEntitiesPerTick))
    }
    if (typeof c.maxQueueLength === "number" && Number.isFinite(c.maxQueueLength) && c.maxQueueLength > 0) {
      maxQueueLength = Math.min(maxQueueLength, Math.floor(c.maxQueueLength))
    }
  }
  return { maxChainDepth, maxFollowUpsPerRoot, maxRuleCount, maxEmitsPerRootDispatch, maxSpawnedEntitiesPerTick, maxQueueLength }
}

export function enforceRuleCount(ruleCount: number, limit: number): { ok: true } | { ok: false; error: string } {
  if (ruleCount > limit) return { ok: false, error: `Rule count ${ruleCount} exceeds sandbox limit ${limit}` }
  return { ok: true }
}
