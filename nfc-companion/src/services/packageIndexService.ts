import { viteBaseUrl } from "@/runtime/viteEnv"

export type PackageSummary = {
  packageId: string
  manifest: Record<string, unknown> | null
  ruleFileCount: number
  tags: string[]
  group: "skeleton" | "other"
  adapters: string[]
  /** From manifest when present */
  name?: string
  version?: string | number
  entityTypes?: string[]
  supportsNfc?: boolean
  systemId?: string
}

function siteBase(): string {
  const base = viteBaseUrl()
  return base.replace(/\/?$/, "/")
}

async function fetchJson(path: string): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  const url = `${siteBase()}${path}`.replace(/\/{2,}/g, "/")
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return { ok: false, error: `${path} (${res.status})` }
    return { ok: true, value: await res.json() }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" }
  }
}

function packageIdsFromRegistry(registry: unknown): string[] {
  if (typeof registry !== "object" || registry === null) return []
  const refs = (registry as { eventRefs?: unknown }).eventRefs
  if (!Array.isArray(refs)) return []
  const ids = new Set<string>()
  for (const r of refs) {
    if (typeof r !== "object" || r === null) continue
    const p = (r as { path?: unknown }).path
    if (typeof p !== "string") continue
    const m = p.match(/^packages\/([^/]+)\//)
    if (m?.[1]) ids.add(m[1])
  }
  return [...ids].sort((a, b) => a.localeCompare(b))
}

function tagsForId(id: string): string[] {
  const t: string[] = []
  if (id.includes("skeleton")) t.push("skeleton")
  if (id.includes("warhammer") || id.includes("wh40k") || id.includes("40k")) t.push("mass")
  if (id.includes("sigmar") || id.includes("aos")) t.push("fantasy")
  if (id.includes("kill_team") || id.includes("killteam")) t.push("skirmish")
  if (id.includes("rpg")) t.push("rpg")
  if (id.includes("dungeon") || id.includes("crypt")) t.push("dungeon")
  if (id.includes("board")) t.push("board")
  if (id.includes("card")) t.push("cards")
  if (id.includes("strategy")) t.push("strategy")
  return t.length ? t : ["package"]
}

function adaptersFromManifest(m: Record<string, unknown> | null): string[] {
  if (!m) return []
  const ia = m.importAdapters as Record<string, unknown> | undefined
  if (!ia || typeof ia !== "object") return []
  return Object.keys(ia).sort()
}

/**
 * Dynamic package index from `packages/package_registry.json` + per-package `manifest.json`.
 */
export async function buildPackageIndex(): Promise<{ ok: true; packages: PackageSummary[] } | { ok: false; error: string }> {
  const reg = await fetchJson("packages/package_registry.json")
  if (!reg.ok) return { ok: false, error: reg.error }
  const root = reg.value as { schemaVersion?: unknown; eventRefs?: unknown }
  if (root.schemaVersion !== 1) return { ok: false, error: "package_registry schemaVersion" }
  const ids = packageIdsFromRegistry(root)
  const refs = Array.isArray(root.eventRefs) ? root.eventRefs : []
  const ruleCountByPkg = new Map<string, number>()
  for (const r of refs) {
    if (typeof r !== "object" || r === null) continue
    const path = (r as { path?: string }).path
    if (typeof path !== "string") continue
    const m = path.match(/^packages\/([^/]+)\//)
    if (!m?.[1]) continue
    ruleCountByPkg.set(m[1], (ruleCountByPkg.get(m[1]) ?? 0) + 1)
  }

  const packages: PackageSummary[] = []
  for (const id of ids) {
    const man = await fetchJson(`packages/${id}/manifest.json`)
    const manifest = man.ok && typeof man.value === "object" && man.value !== null ? (man.value as Record<string, unknown>) : null
    packages.push({
      packageId: id,
      manifest,
      ruleFileCount: ruleCountByPkg.get(id) ?? 0,
      tags: tagsForId(id),
      group: id.includes("skeleton") ? "skeleton" : "other",
      adapters: adaptersFromManifest(manifest),
      name: typeof manifest?.name === "string" ? manifest.name : undefined,
      version: manifest?.version as number | string | undefined,
      entityTypes: Array.isArray(manifest?.entityTypes)
        ? (manifest!.entityTypes as unknown[]).filter((x): x is string => typeof x === "string")
        : undefined,
      supportsNfc: typeof manifest?.supportsNFC === "boolean" ? manifest.supportsNFC : undefined,
      systemId: typeof manifest?.systemId === "string" ? manifest.systemId : undefined
    })
  }
  return { ok: true, packages }
}
