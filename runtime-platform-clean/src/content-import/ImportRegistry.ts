import type { JsonRosterAdapterV1 } from "@/content-import/ImportTypes"
import { validateJsonRosterAdapter } from "@/content-import/validateImport"

export function resolveImportAdapterUrl(params: { packageId: string; relativePath: string; contentBase?: string }): string {
  const base = (params.contentBase ?? "/").replace(/\/?$/, "/")
  const rel = params.relativePath.replace(/^\//, "")
  return `${base}packages/${params.packageId}/${rel}`.replace(/\/{2,}/g, "/")
}

export function parseImportAdapterJson(raw: unknown): JsonRosterAdapterV1 | null {
  if (!validateJsonRosterAdapter(raw)) return null
  return raw
}
