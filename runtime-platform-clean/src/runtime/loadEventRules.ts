import type { Action, Condition, EventRule, RuntimeEventName } from "@/models/runtimeTypes"
import { RUNTIME_EVENT_NAMES } from "@/runtime/runtimeConstants"
import { validateRuleDiagnostics } from "@/runtime/ruleValidation"
import { viteBaseUrl } from "@/runtime/viteEnv"

function contentBase(): string {
  const base = viteBaseUrl()
  return `${base}content/`.replace(/\/{2,}/g, "/")
}

function siteBase(): string {
  const base = viteBaseUrl()
  return base.replace(/\/?$/, "/")
}

async function fetchJsonUrl(url: string): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return { ok: false, error: `Failed to load ${url} (${res.status})` }
    return { ok: true, value: (await res.json()) as unknown }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" }
  }
}

async function fetchContentJson(path: string): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  const url = `${contentBase()}${path}`.replace(/\/{2,}/g, "/")
  return fetchJsonUrl(url)
}

async function fetchSiteJson(path: string): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  const url = `${siteBase()}${path}`.replace(/\/{2,}/g, "/")
  return fetchJsonUrl(url)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function normalizeActionRecord(raw: Record<string, unknown>): Record<string, unknown> {
  const next = { ...raw }
  if (next.type === "increment_state" && typeof next.amount === "number" && next.delta === undefined) {
    next.delta = next.amount
  }
  return next
}

function normalizeActions(raw: unknown): Action[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(isRecord)
    .map((a) => normalizeActionRecord(a) as Action)
}

function parseRule(raw: unknown, file: string): { ok: true; value: EventRule } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: `${file}: rule must be object` }
  const id = raw.id
  const trigger = raw.trigger
  if (typeof id !== "string" || !id.trim()) return { ok: false, error: `${file}: id required` }
  if (typeof trigger !== "string" || !RUNTIME_EVENT_NAMES.has(trigger)) {
    return { ok: false, error: `${file}: unknown or disallowed trigger ${String(trigger)}` }
  }
  const conditions = Array.isArray(raw.conditions) ? (raw.conditions as Condition[]) : []
  const actions = normalizeActions(raw.actions)
  const appliesToSystems = Array.isArray(raw.appliesToSystems)
    ? (raw.appliesToSystems as unknown[]).filter((x): x is string => typeof x === "string")
    : null
  const priority = typeof raw.priority === "number" && Number.isFinite(raw.priority) ? raw.priority : 0
  return {
    ok: true,
    value: {
      id,
      trigger: trigger as RuntimeEventName,
      priority,
      appliesToSystems: appliesToSystems?.length ? appliesToSystems : null,
      conditions: conditions as EventRule["conditions"],
      actions
    }
  }
}

async function loadRulesFromRefsStrict(
  refs: unknown[],
  fetchRule: (path: string) => Promise<{ ok: true; value: unknown } | { ok: false; error: string }>,
  loadWarnings: string[]
): Promise<{ ok: true; rules: EventRule[] } | { ok: false; error: string }> {
  const rules: EventRule[] = []
  for (const ref of refs) {
    if (!isRecord(ref) || typeof ref.path !== "string") continue
    const file = await fetchRule(ref.path)
    if (!file.ok) return file
    const pr = parseRule(file.value, ref.path)
    if (!pr.ok) {
      loadWarnings.push(pr.error)
      continue
    }
    const diag = validateRuleDiagnostics(pr.value, ref.path)
    if (diag.length) {
      for (const d of diag) loadWarnings.push(d)
      continue
    }
    rules.push(pr.value)
  }
  return { ok: true, rules }
}

async function loadRulesFromRefsLenient(
  refs: unknown[],
  fetchRule: (path: string) => Promise<{ ok: true; value: unknown } | { ok: false; error: string }>,
  loadWarnings: string[]
): Promise<EventRule[]> {
  const rules: EventRule[] = []
  for (const ref of refs) {
    if (!isRecord(ref) || typeof ref.path !== "string") continue
    const file = await fetchRule(ref.path)
    if (!file.ok) {
      loadWarnings.push(file.error)
      continue
    }
    const pr = parseRule(file.value, ref.path)
    if (!pr.ok) {
      loadWarnings.push(pr.error)
      continue
    }
    const diag = validateRuleDiagnostics(pr.value, ref.path)
    if (diag.length) {
      for (const d of diag) loadWarnings.push(d)
      continue
    }
    rules.push(pr.value)
  }
  return rules
}

/** Later refs with same id override earlier (workspace packages win over built-in content when ids collide). */
function dedupeRulesById(rules: EventRule[]): EventRule[] {
  const m = new Map<string, EventRule>()
  for (const r of rules) {
    m.set(r.id, r)
  }
  return [...m.values()]
}

export async function loadEventRulesFromIndex(): Promise<
  { ok: true; rules: EventRule[]; loadWarnings: string[] } | { ok: false; error: string }
> {
  const idx = await fetchContentJson("events/index.json")
  if (!idx.ok) return idx
  const root = idx.value
  if (!isRecord(root) || root.schemaVersion !== 1) return { ok: false, error: "events/index.json invalid" }
  const refs = root.eventRefs
  if (!Array.isArray(refs)) return { ok: false, error: "events/index.json missing eventRefs" }
  const loadWarnings: string[] = []
  const cr = await loadRulesFromRefsStrict(
    refs,
    (p) => fetchContentJson(p),
    loadWarnings
  )
  if (!cr.ok) return cr
  const contentRules = cr.rules

  const pkgIdx = await fetchSiteJson("packages/package_registry.json")
  /** @type {EventRule[]} */
  let packageRules: EventRule[] = []
  if (pkgIdx.ok && isRecord(pkgIdx.value) && pkgIdx.value.schemaVersion === 1) {
    const pref = pkgIdx.value.eventRefs
    if (Array.isArray(pref)) {
      packageRules = await loadRulesFromRefsLenient(
        pref,
        (p) => fetchSiteJson(p),
        loadWarnings
      )
    }
  } else if (!pkgIdx.ok) {
    loadWarnings.push(`packages/package_registry.json: ${pkgIdx.error}`)
  }

  const merged = dedupeRulesById([...contentRules, ...packageRules])
  merged.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  return { ok: true, rules: merged, loadWarnings }
}
