/**
 * Deterministic JSON-like string: object keys sorted recursively; arrays keep element order.
 * Numbers, strings, booleans, null; unsupported values stringify via String().
 */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null"
  const t = typeof value
  if (t === "number" || t === "boolean") return JSON.stringify(value)
  if (t === "string") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`
  if (t === "object") {
    const o = value as Record<string, unknown>
    const keys = Object.keys(o).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`
  }
  return JSON.stringify(String(value))
}
