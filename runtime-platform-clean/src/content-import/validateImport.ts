import type { CanonicalImportedEntity, CanonicalImportGraph, JsonRosterAdapterV1 } from "@/content-import/ImportTypes"
import { CANONICAL_RELATIONSHIP_KINDS } from "@/content-import/ImportTypes"

const allowedEdgeKinds = new Set<string>(CANONICAL_RELATIONSHIP_KINDS)

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0
}

export function validateCanonicalEntity(e: CanonicalImportedEntity, ctx: { packageId: string }): string[] {
  const err: string[] = []
  if (!isNonEmptyString(e.instanceId)) err.push("instanceId required")
  if (!isNonEmptyString(e.templateId)) err.push("templateId required")
  if (!isNonEmptyString(e.packageId)) err.push("packageId required")
  if (e.packageId !== ctx.packageId) err.push(`packageId mismatch ${e.packageId} vs ${ctx.packageId}`)
  if (!isNonEmptyString(e.entityType)) err.push("entityType required")
  if (!e.metadata || typeof e.metadata !== "object") err.push("metadata object required")
  return err
}

function edgeKey(e: { fromInstanceId: string; toInstanceId: string; kind: string; id: string }): string {
  return `${e.kind}|${e.fromInstanceId}|${e.toInstanceId}|${e.id}`
}

/**
 * Validates graph: unique instance ids, edge endpoints exist, no self-loops on transport-like chains, inventory refs.
 */
export function validateCanonicalGraph(graph: CanonicalImportGraph): string[] {
  const err: string[] = []
  const ids = new Set<string>()
  for (const e of graph.entities) {
    if (ids.has(e.instanceId)) err.push(`duplicate instanceId ${e.instanceId}`)
    ids.add(e.instanceId)
    err.push(...validateCanonicalEntity(e, { packageId: graph.packageId }))
  }
  const seenEdge = new Set<string>()
  const allEdges = [...graph.edges]
  for (const e of graph.entities) {
    if (e.relationships?.length) allEdges.push(...e.relationships)
  }
  for (const ed of allEdges) {
    if (!isNonEmptyString(ed.id)) err.push("edge id required")
    if (!isNonEmptyString(ed.fromInstanceId) || !isNonEmptyString(ed.toInstanceId)) err.push("edge endpoints required")
    if (!allowedEdgeKinds.has(String(ed.kind))) err.push(`edge ${ed.id} unknown kind ${String(ed.kind)}`)
    if (ed.fromInstanceId === ed.toInstanceId) err.push(`self edge ${ed.id}`)
    if (!ids.has(ed.fromInstanceId)) err.push(`edge ${ed.id} unknown from ${ed.fromInstanceId}`)
    if (!ids.has(ed.toInstanceId)) err.push(`edge ${ed.id} unknown to ${ed.toInstanceId}`)
    const k = edgeKey(ed)
    if (seenEdge.has(k)) err.push(`duplicate edge ${k}`)
    seenEdge.add(k)
  }
  // transport passenger simple cycle: A passenger of B and B passenger of A
  const passenger = allEdges.filter((x) => x.kind === "transport_passenger")
  const pair = new Set<string>()
  for (const p of passenger) {
    const a = `${p.fromInstanceId}<${p.toInstanceId}`
    const rev = `${p.toInstanceId}<${p.fromInstanceId}`
    if (pair.has(rev)) err.push(`circular transport pair ${p.fromInstanceId}<->${p.toInstanceId}`)
    pair.add(a)
  }
  return err
}

export function validateJsonRosterAdapter(a: unknown): a is JsonRosterAdapterV1 {
  if (typeof a !== "object" || a === null) return false
  const o = a as Record<string, unknown>
  return (
    o.schemaVersion === 1 &&
    o.kind === "jsonRoster" &&
    typeof o.packageId === "string" &&
    typeof o.unitsPath === "string" &&
    typeof o.unitIdField === "string" &&
    typeof o.unitNameField === "string"
  )
}
