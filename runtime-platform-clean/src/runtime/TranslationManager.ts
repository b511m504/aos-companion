import type { TranslationTable } from "@/models/runtimeTypes"
import { viteBaseUrl } from "@/runtime/viteEnv"

function contentBase(): string {
  const base = viteBaseUrl()
  return `${base}content/`.replace(/\/{2,}/g, "/")
}

async function fetchJson(path: string): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  const url = `${contentBase()}${path}`.replace(/\/{2,}/g, "/")
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return { ok: false, error: `Failed to load ${url} (${res.status})` }
    return { ok: true, value: (await res.json()) as unknown }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" }
  }
}

export class TranslationManager {
  private table: TranslationTable | null = null

  async loadForSystem(systemId: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const path = `translations/${systemId}.json`
    const j = await fetchJson(path)
    if (!j.ok) return j
    const raw = j.value
    if (typeof raw !== "object" || raw === null || !("translations" in raw)) {
      return { ok: false, error: "Invalid translation file" }
    }
    const t = raw as TranslationTable
    if (t.schemaVersion !== 1) return { ok: false, error: "translation schemaVersion must be 1" }
    this.table = t
    return { ok: true }
  }

  clear() {
    this.table = null
  }

  /** Canonical key → display label; falls back to key if missing. */
  label(canonicalKey: string): string {
    return this.table?.translations[canonicalKey] ?? canonicalKey
  }

  getSystemId(): string | null {
    return this.table?.systemId ?? null
  }
}
