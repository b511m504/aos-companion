import type { CanonicalImportResult } from "@/content-import/CanonicalImportResult"
import { canonicalEntitiesToArmyList, normalizeJsonRoster } from "@/content-import/normalizeRoster"
import { validateCanonicalGraph } from "@/content-import/validateImport"
import { EntityRelationshipGraph } from "@/runtime/relationships/EntityRelationshipGraph"
import type { JsonRosterAdapterV1 } from "@/content-import/ImportTypes"

export type ImportSessionRunParams = {
  raw: unknown
  adapter: JsonRosterAdapterV1
  /** Override list id/name/faction from adapter root if missing */
  listId?: string
  listName?: string
  factionId?: string
}

/**
 * Single entry-point for canonical import (no runtime engine mutation).
 */
export class ImportSessionManager {
  static runJsonRoster(params: ImportSessionRunParams): CanonicalImportResult {
    const t0 = performance.now()
    const adapter = params.adapter
    const graph = normalizeJsonRoster(params.raw, adapter)
    const gErr = validateCanonicalGraph(graph)
    if (gErr.length) {
      return {
        ok: false,
        packageId: adapter.packageId,
        adapterKind: adapter.kind,
        errors: gErr,
        metrics: { durationMs: performance.now() - t0 }
      }
    }
    const rg = EntityRelationshipGraph.fromImportGraph(graph)
    const listId = params.listId?.trim() || String(graph.entities[0]?.metadata.sourceListId || "imported")
    const listName = params.listName?.trim() || String(graph.entities[0]?.metadata.sourceListName || listId)
    const factionId = params.factionId?.trim() || String(graph.entities[0]?.metadata.sourceFactionId || "*")
    const list = canonicalEntitiesToArmyList({
      packageId: adapter.packageId,
      listId: listId.trim() || "imported",
      listName: listName.trim() || listId,
      factionId: factionId.trim() || "*",
      entities: graph.entities
    })
    const durationMs = performance.now() - t0
    return {
      ok: true,
      packageId: adapter.packageId,
      adapterKind: adapter.kind,
      graph,
      list,
      metrics: {
        entityCount: graph.entities.length,
        edgeCount: rg.getEdgeCount(),
        durationMs
      }
    }
  }
}
