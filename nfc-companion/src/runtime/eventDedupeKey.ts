import type { RuntimeEvent } from "@/models/runtimeTypes"

/** Stable key for dedupe: event type + sorted JSON keys of payload. */
export function eventDedupeKey(event: RuntimeEvent): string {
  const keys = Object.keys(event.payload).sort()
  const body = keys.map((k) => `${k}:${stableValue(event.payload[k])}`).join("|")
  return `${event.type}#${body}`
}

function stableValue(v: unknown): string {
  if (v === null) return "null"
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${k}:${stableValue(o[k])}`)
      .join(",")}}`
  }
  if (Array.isArray(v)) return `[${v.map(stableValue).join(",")}]`
  return JSON.stringify(v)
}
