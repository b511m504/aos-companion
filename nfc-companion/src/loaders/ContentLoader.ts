import type {
  ArmyList,
  ContentCatalog,
  ContentPackageManifest,
  Faction,
  FactionsFile,
  GameSystem,
  ListsFile,
  Unit
} from "@/models/types"
import { viteBaseUrl } from "@/runtime/viteEnv"

export type LoadResult<T> = { ok: true; value: T } | { ok: false; error: string }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function reqString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key]
  if (typeof v !== "string" || !v.trim()) return null
  return v
}

function reqNum(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key]
  if (typeof v !== "number" || !Number.isFinite(v)) return null
  return v
}

function reqArray(obj: Record<string, unknown>, key: string): unknown[] | null {
  const v = obj[key]
  if (!Array.isArray(v)) return null
  return v
}

function parseManifest(raw: unknown, ctx: string): LoadResult<ContentPackageManifest> {
  if (!isRecord(raw)) return { ok: false, error: `${ctx}: package must be an object` }
  const packageType = reqString(raw, "packageType")
  const systemId = reqString(raw, "systemId")
  const factionId = reqString(raw, "factionId")
  const contentVersion = reqString(raw, "contentVersion")
  const sv = reqNum(raw, "schemaVersion")
  if (!packageType) return { ok: false, error: `${ctx}: package.packageType required` }
  if (!systemId) return { ok: false, error: `${ctx}: package.systemId required` }
  if (factionId === null) return { ok: false, error: `${ctx}: package.factionId required (use * for multi)` }
  if (!contentVersion) return { ok: false, error: `${ctx}: package.contentVersion required` }
  if (sv !== 1) return { ok: false, error: `${ctx}: package.schemaVersion must be 1` }
  return {
    ok: true,
    value: {
      packageType,
      schemaVersion: 1,
      contentVersion,
      systemId,
      factionId: factionId as string
    }
  }
}

function parseGameSystem(raw: unknown): LoadResult<GameSystem> {
  if (!isRecord(raw)) return { ok: false, error: "System root must be an object" }
  const sv = reqNum(raw, "schemaVersion")
  if (sv !== 1) return { ok: false, error: "System schemaVersion must be 1" }
  const id = reqString(raw, "id")
  const name = reqString(raw, "name")
  const version = reqString(raw, "version")
  const description = reqString(raw, "description")
  const factionsPath = reqString(raw, "factionsPath")
  if (!id || !name || !version || !description || !factionsPath) {
    return { ok: false, error: "System missing required string field" }
  }
  return {
    ok: true,
    value: { schemaVersion: 1, id, name, version, description, factionsPath }
  }
}

function parseFaction(raw: unknown): LoadResult<Faction> {
  if (!isRecord(raw)) return { ok: false, error: "Faction must be an object" }
  const fSv = raw.schemaVersion
  if (fSv !== undefined && fSv !== 1) return { ok: false, error: "Faction schemaVersion must be 1 when present" }
  const id = reqString(raw, "id")
  const systemId = reqString(raw, "systemId")
  const name = reqString(raw, "name")
  const listsPath = reqString(raw, "listsPath")
  if (!id || !systemId || !name || !listsPath) return { ok: false, error: "Faction missing required field" }
  const out: Faction = { id, systemId, name, listsPath }
  return { ok: true, value: out }
}

function parseArmyList(raw: unknown): LoadResult<ArmyList> {
  if (!isRecord(raw)) return { ok: false, error: "List must be an object" }
  const lSv = raw.schemaVersion
  if (lSv !== undefined && lSv !== 1) return { ok: false, error: "List schemaVersion must be 1 when present" }
  const id = reqString(raw, "id")
  const name = reqString(raw, "name")
  const factionId = reqString(raw, "factionId")
  const unitsRaw = reqArray(raw, "units")
  if (!id || !name || !factionId || !unitsRaw) return { ok: false, error: "List missing id, name, factionId, or units" }
  const descRaw = raw.description
  const description =
    typeof descRaw === "string" && descRaw.trim() ? descRaw.trim() : undefined
  const unitIds = new Set<string>()
  const units = []
  for (let i = 0; i < unitsRaw.length; i++) {
    const u = unitsRaw[i]
    if (!isRecord(u)) return { ok: false, error: `units[${i}] must be an object` }
    const uid = reqString(u, "id")
    const uname = reqString(u, "name")
    if (!uid || !uname) return { ok: false, error: `units[${i}] requires id and name` }
    if (unitIds.has(uid)) return { ok: false, error: `Duplicate unit id in list ${id}: ${uid}` }
    unitIds.add(uid)
    const unit: Unit = { id: uid, name: uname }
    const tagsRaw = u.tags
    if (Array.isArray(tagsRaw)) {
      const tags = tagsRaw.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      if (tags.length) unit.tags = tags
    }
    const entityTypeRaw = u.entityType
    if (typeof entityTypeRaw === "string" && entityTypeRaw.trim()) unit.entityType = entityTypeRaw.trim()
    const packageIdRaw = u.packageId
    if (typeof packageIdRaw === "string" && packageIdRaw.trim()) unit.packageId = packageIdRaw.trim()
    const templateIdRaw = u.templateId
    if (typeof templateIdRaw === "string" && templateIdRaw.trim()) unit.templateId = templateIdRaw.trim()
    const runtimeRaw = u.runtime
    if (isRecord(runtimeRaw)) unit.runtimeStateOverlay = { ...runtimeRaw }
    units.push(unit)
  }
  const value: ArmyList = { id, name, factionId, units }
  if (description) value.description = description
  return { ok: true, value }
}

function parseCatalog(raw: unknown): LoadResult<ContentCatalog> {
  if (!isRecord(raw)) return { ok: false, error: "Catalog root must be an object" }
  const sv = reqNum(raw, "schemaVersion")
  if (sv !== 1) return { ok: false, error: "Catalog schemaVersion must be 1" }
  const refsRaw = reqArray(raw, "systemRefs")
  if (!refsRaw) return { ok: false, error: "catalog.systemRefs required" }
  const paths: string[] = []
  const pathSet = new Set<string>()
  for (let i = 0; i < refsRaw.length; i++) {
    const r = refsRaw[i]
    if (!isRecord(r)) return { ok: false, error: `systemRefs[${i}] must be an object` }
    const p = reqString(r, "path")
    if (!p) return { ok: false, error: `systemRefs[${i}].path required` }
    if (pathSet.has(p)) return { ok: false, error: `Duplicate catalog path: ${p}` }
    pathSet.add(p)
    paths.push(p)
  }
  return { ok: true, value: { schemaVersion: 1, systemRefs: paths.map((path) => ({ path })) } }
}

function parseFactionsFile(raw: unknown): LoadResult<FactionsFile> {
  if (!isRecord(raw)) return { ok: false, error: "Factions file root must be an object" }
  const sv = reqNum(raw, "schemaVersion")
  if (sv !== 1) return { ok: false, error: "Factions schemaVersion must be 1" }
  const pkg = parseManifest(raw.package, "factions")
  if (!pkg.ok) return pkg
  const factionsRaw = reqArray(raw, "factions")
  if (!factionsRaw) return { ok: false, error: "factions array required" }
  const factions: Faction[] = []
  const ids = new Set<string>()
  for (let i = 0; i < factionsRaw.length; i++) {
    const fr = parseFaction(factionsRaw[i])
    if (!fr.ok) return { ok: false, error: `factions[${i}]: ${fr.error}` }
    if (ids.has(fr.value.id)) return { ok: false, error: `Duplicate faction id: ${fr.value.id}` }
    ids.add(fr.value.id)
    if (fr.value.systemId !== pkg.value.systemId) {
      return {
        ok: false,
        error: `Faction ${fr.value.id} systemId ${fr.value.systemId} does not match package.systemId ${pkg.value.systemId}`
      }
    }
    factions.push(fr.value)
  }
  if (pkg.value.factionId !== "*") {
    if (factions.length !== 1) {
      return { ok: false, error: "When package.factionId is not *, exactly one faction row is allowed" }
    }
    if (factions[0]!.id !== pkg.value.factionId) {
      return { ok: false, error: `Faction id must equal package.factionId (${pkg.value.factionId})` }
    }
  }
  return { ok: true, value: { schemaVersion: 1, package: pkg.value, factions } }
}

function parseListsFile(raw: unknown): LoadResult<ListsFile> {
  if (!isRecord(raw)) return { ok: false, error: "Lists file root must be an object" }
  const sv = reqNum(raw, "schemaVersion")
  if (sv !== 1) return { ok: false, error: "Lists schemaVersion must be 1" }
  const pkg = parseManifest(raw.package, "lists")
  if (!pkg.ok) return pkg
  const listsRaw = reqArray(raw, "lists")
  if (!listsRaw) return { ok: false, error: "lists array required" }
  const lists: ArmyList[] = []
  const listIds = new Set<string>()
  for (let i = 0; i < listsRaw.length; i++) {
    const lr = parseArmyList(listsRaw[i])
    if (!lr.ok) return { ok: false, error: `lists[${i}]: ${lr.error}` }
    if (listIds.has(lr.value.id)) return { ok: false, error: `Duplicate list id: ${lr.value.id}` }
    listIds.add(lr.value.id)
    if (pkg.value.factionId !== "*") {
      if (lr.value.factionId !== pkg.value.factionId) {
        return {
          ok: false,
          error: `List ${lr.value.id} factionId ${lr.value.factionId} does not match package.factionId`
        }
      }
    }
    lists.push(lr.value)
  }
  return { ok: true, value: { schemaVersion: 1, package: pkg.value, lists } }
}

function contentBase(): string {
  const base = viteBaseUrl()
  return `${base}content/`.replace(/\/{2,}/g, "/")
}

function siteBase(): string {
  const base = viteBaseUrl()
  return base.replace(/\/?$/, "/")
}

async function fetchJson(path: string): Promise<LoadResult<unknown>> {
  const url = `${contentBase()}${path}`.replace(/\/{2,}/g, "/")
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return { ok: false, error: `Failed to load ${url} (${res.status})` }
    return { ok: true, value: (await res.json()) as unknown }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error loading JSON" }
  }
}

/** Package-hosted lists (`packages/...`) live under site root, not `/content/`. */
async function fetchJsonSite(path: string): Promise<LoadResult<unknown>> {
  const url = `${siteBase()}${path}`.replace(/\/{2,}/g, "/")
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return { ok: false, error: `Failed to load ${url} (${res.status})` }
    return { ok: true, value: (await res.json()) as unknown }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error loading JSON" }
  }
}

export type ContentLoader = {
  loadCatalog(): Promise<LoadResult<ContentCatalog>>
  loadSystem(path: string): Promise<LoadResult<GameSystem>>
  loadFactionsFile(path: string): Promise<LoadResult<FactionsFile>>
  loadListsFile(path: string): Promise<LoadResult<ListsFile>>
}

export function createContentLoader(): ContentLoader {
  return {
    async loadCatalog() {
      const j = await fetchJson("catalog.json")
      if (!j.ok) return j
      return parseCatalog(j.value)
    },
    async loadSystem(path: string) {
      const j = await fetchJson(path)
      if (!j.ok) return j
      return parseGameSystem(j.value)
    },
    async loadFactionsFile(path: string) {
      const j = await fetchJson(path)
      if (!j.ok) return j
      return parseFactionsFile(j.value)
    },
    async loadListsFile(path: string) {
      const j = path.startsWith("packages/") ? await fetchJsonSite(path) : await fetchJson(path)
      if (!j.ok) return j
      return parseListsFile(j.value)
    }
  }
}
