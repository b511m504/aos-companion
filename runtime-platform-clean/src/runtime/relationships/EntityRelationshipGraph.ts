import type { CanonicalImportGraph, CanonicalRelationshipEdge } from "@/content-import/ImportTypes"
import type { RelationshipGraphWireV1 } from "@/runtime/relationships/RelationshipTypes"

/**
 * Deterministic, package-agnostic relationship index (import-time + observability).
 * Runtime rule engine remains unchanged; this graph is exported for debug / certification.
 */
export class EntityRelationshipGraph {
  private readonly packageId: string
  private readonly edges: CanonicalRelationshipEdge[]

  constructor(graph: CanonicalImportGraph) {
    this.packageId = graph.packageId
    const merged: CanonicalRelationshipEdge[] = [...graph.edges]
    for (const e of graph.entities) {
      if (e.relationships?.length) merged.push(...e.relationships)
    }
    merged.sort((a, b) => edgeSortKey(a).localeCompare(edgeSortKey(b)))
    this.edges = merged
  }

  getEdgeCount(): number {
    return this.edges.length
  }

  listOrphans(entityIds: ReadonlySet<string>): string[] {
    const orphans: string[] = []
    for (const e of this.edges) {
      if (!entityIds.has(e.fromInstanceId)) orphans.push(`from:${e.fromInstanceId}`)
      if (!entityIds.has(e.toInstanceId)) orphans.push(`to:${e.toInstanceId}`)
    }
    return [...new Set(orphans)].sort()
  }

  toWire(): RelationshipGraphWireV1 {
    return { schemaVersion: 1, packageId: this.packageId, edges: [...this.edges] }
  }

  toJson(): string {
    return JSON.stringify(this.toWire(), null, 2)
  }

  static fromImportGraph(graph: CanonicalImportGraph): EntityRelationshipGraph {
    return new EntityRelationshipGraph(graph)
  }
}

function edgeSortKey(e: CanonicalRelationshipEdge): string {
  return `${e.kind}\t${e.fromInstanceId}\t${e.toInstanceId}\t${e.id}`
}
