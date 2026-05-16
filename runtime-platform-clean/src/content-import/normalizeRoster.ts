import type { ArmyList, Unit } from "@/models/types"
import type {
  CanonicalImportedEntity,
  CanonicalImportGraph,
  CanonicalRelationshipEdge,
  CanonicalRelationshipKind,
  JsonRosterAdapterV1
} from "@/content-import/ImportTypes"
import { CANONICAL_RELATIONSHIP_KINDS } from "@/content-import/ImportTypes"

function readPath(obj: unknown, path: string): unknown {
  if (!path.trim()) return obj
  let cur: unknown = obj
  for (const p of path.split(".")) {
    if (cur === null || cur === undefined) return undefined
    if (Array.isArray(cur)) {
      const idx = parseInt(p, 10)
      if (!Number.isFinite(idx) || idx < 0 || idx >= cur.length) return undefined
      cur = cur[idx]
      continue
    }
    if (typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

function asString(v: unknown, fallback: string): string {
  if (typeof v === "string" && v.trim()) return v.trim()
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  return fallback
}

const kindSet = new Set<string>(CANONICAL_RELATIONSHIP_KINDS)

function normalizeEdgeKind(k: string): CanonicalRelationshipKind {
  return kindSet.has(k) ? (k as CanonicalRelationshipKind) : "generic"
}

/**
 * Map normalized canonical entities to ArmyList + runtime-oriented unit extensions.
 */
export function canonicalEntitiesToArmyList(params: {
  packageId: string
  listId: string
  listName: string
  factionId: string
  entities: readonly CanonicalImportedEntity[]
}): ArmyList {
  const units: Unit[] = params.entities.map((e) => {
    const displayName = asString(e.metadata.displayName, e.instanceId)
    const tags = Array.isArray(e.metadata.tags) ? (e.metadata.tags as unknown[]).filter((t): t is string => typeof t === "string") : []
    return {
      id: e.instanceId,
      name: displayName,
      tags,
      packageId: e.packageId,
      templateId: e.templateId,
      entityType: e.entityType,
      runtimeStateOverlay: e.state
    }
  })
  return {
    id: params.listId,
    name: params.listName,
    factionId: params.factionId,
    description: `import:${params.packageId}`,
    importMeta: {
      packageId: params.packageId,
      adapterKind: "jsonRoster",
      entityCount: units.length
    },
    units
  }
}

/**
 * Normalize raw JSON using a declarative jsonRoster adapter.
 */
export function normalizeJsonRoster(raw: unknown, adapter: JsonRosterAdapterV1): CanonicalImportGraph {
  const root = adapter.rootPath ? readPath(raw, adapter.rootPath) : raw
  if (typeof root !== "object" || root === null) {
    return { schemaVersion: 1, packageId: adapter.packageId, entities: [], edges: [] }
  }
  const r = root as Record<string, unknown>
  const listId = asString(adapter.listIdField ? r[adapter.listIdField] : r.id, "imported-list")
  const listName = asString(adapter.listNameField ? r[adapter.listNameField] : r.name, listId)
  const factionId = asString(adapter.factionIdField ? r[adapter.factionIdField] : r.factionId, "*")
  const unitsRaw = readPath(root, adapter.unitsPath)
  const units = Array.isArray(unitsRaw) ? unitsRaw : []
  const entities: CanonicalImportedEntity[] = []
  const edges: CanonicalRelationshipEdge[] = []

  let i = 0
  for (const u of units) {
    if (typeof u !== "object" || u === null) continue
    const ur = u as Record<string, unknown>
    const instanceId = asString(ur[adapter.unitIdField], `entity_${i}`)
    const name = asString(ur[adapter.unitNameField], instanceId)
    const templateId = adapter.unitTemplateField ? asString(ur[adapter.unitTemplateField], instanceId) : instanceId
    const entityType = adapter.unitTypeField ? asString(ur[adapter.unitTypeField], adapter.defaultEntityType ?? "unit") : adapter.defaultEntityType ?? "unit"
    const state: Record<string, unknown> = {}
    if (adapter.unitStateField && ur[adapter.unitStateField] && typeof ur[adapter.unitStateField] === "object") {
      Object.assign(state, ur[adapter.unitStateField] as object)
    }
    const tags = adapter.unitTagsField && Array.isArray(ur[adapter.unitTagsField]) ? (ur[adapter.unitTagsField] as unknown[]) : []
    const ent: CanonicalImportedEntity = {
      instanceId,
      templateId,
      packageId: adapter.packageId,
      entityType,
      state,
      metadata: {
        displayName: name,
        tags: tags.filter((t): t is string => typeof t === "string"),
        sourceListId: listId,
        sourceListName: listName,
        sourceFactionId: factionId
      }
    }
    if (adapter.unitRelationshipsField) {
      const relRaw = ur[adapter.unitRelationshipsField]
      if (Array.isArray(relRaw) && relRaw.length) {
        const rels: CanonicalRelationshipEdge[] = []
        let j = 0
        for (const row of relRaw) {
          if (typeof row !== "object" || row === null) {
            j++
            continue
          }
          const rr = row as Record<string, unknown>
          const edgeId = asString(rr.id, `rel_${instanceId}_${j}`)
          const kind = normalizeEdgeKind(asString(rr.kind, "generic"))
          const toInstanceId = asString(rr.toInstanceId ?? rr.to, "")
          if (!toInstanceId) {
            j++
            continue
          }
          const meta =
            rr.metadata && typeof rr.metadata === "object" && !Array.isArray(rr.metadata)
              ? (rr.metadata as Record<string, unknown>)
              : undefined
          rels.push({
            id: edgeId,
            kind,
            fromInstanceId: instanceId,
            toInstanceId,
            metadata: meta
          })
          j++
        }
        if (rels.length) ent.relationships = rels
      }
    }
    entities.push(ent)
    i++
  }

  return { schemaVersion: 1, packageId: adapter.packageId, entities, edges }
}
