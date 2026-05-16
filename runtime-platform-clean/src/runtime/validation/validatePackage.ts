import type { EventRule, RuntimeEntityRecord } from "@/models/runtimeTypes"
import { validateRuleDiagnostics } from "@/runtime/ruleValidation"
import type { PackageCapabilities } from "@/runtime/sandbox/PackageSandbox"

function simpleHash(s: string): string {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16)
}

export function digestEntitySnapshot(entities: readonly RuntimeEntityRecord[]): string {
  const sorted = [...entities].sort((a, b) => a.id.localeCompare(b.id))
  return simpleHash(JSON.stringify(sorted))
}

export function fingerprintRuleset(rules: readonly EventRule[]): string {
  const parts = rules.map((r) => `${r.id}:${r.trigger}:${r.priority ?? 0}`)
  parts.sort()
  return simpleHash(parts.join("|"))
}

export type PackageManifestShape = {
  packageId?: string
  capabilities?: PackageCapabilities
  [key: string]: unknown
}

export type RulesetValidationResult = { ok: true } | { ok: false; errors: string[] }

/** Full ruleset: duplicate ids, per-rule diagnostics, optional emit cycle heuristics. */
export function validateRuleset(rules: readonly EventRule[], fileLabel = "ruleset"): RulesetValidationResult {
  const errors: string[] = []
  const seen = new Set<string>()
  for (const r of rules) {
    if (seen.has(r.id)) errors.push(`Duplicate rule id: ${r.id}`)
    seen.add(r.id)
    errors.push(...validateRuleDiagnostics(r, `${fileLabel}:${r.id}`))
  }
  errors.push(...detectEmitCycles(rules))
  return errors.length ? { ok: false, errors } : { ok: true }
}

export function validateManifest(manifest: unknown): RulesetValidationResult {
  const errors: string[] = []
  if (typeof manifest !== "object" || manifest === null) {
    return { ok: false, errors: ["manifest must be object"] }
  }
  const m = manifest as PackageManifestShape
  if (typeof m.packageId !== "string" || !m.packageId.trim()) errors.push("manifest.packageId required")
  if (m.capabilities?.maxChainDepthOverride !== undefined && m.capabilities.maxChainDepthOverride !== null) {
    const v = m.capabilities.maxChainDepthOverride
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) errors.push("capabilities.maxChainDepthOverride invalid")
  }
  if (m.capabilities?.maxEmitsPerRootDispatch !== undefined && m.capabilities.maxEmitsPerRootDispatch !== null) {
    const v = m.capabilities.maxEmitsPerRootDispatch
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) errors.push("capabilities.maxEmitsPerRootDispatch invalid")
  }
  if (m.capabilities?.maxSpawnedEntitiesPerTick !== undefined && m.capabilities.maxSpawnedEntitiesPerTick !== null) {
    const v = m.capabilities.maxSpawnedEntitiesPerTick
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) errors.push("capabilities.maxSpawnedEntitiesPerTick invalid")
  }
  if (m.capabilities?.maxQueueLength !== undefined && m.capabilities.maxQueueLength !== null) {
    const v = m.capabilities.maxQueueLength
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) errors.push("capabilities.maxQueueLength invalid")
  }
  return errors.length ? { ok: false, errors } : { ok: true }
}

/** Emit graph: rule trigger T, action emits E — flag if rule emits its own trigger (self-loop). */
function detectEmitCycles(rules: readonly EventRule[]): string[] {
  const warnings: string[] = []
  for (const r of rules) {
    for (const a of r.actions) {
      if (a.type !== "emit_event") continue
      if (a.event === r.trigger) {
        warnings.push(`emit self-loop: rule ${r.id} emits its own trigger ${r.trigger}`)
      }
    }
  }
  return warnings
}
