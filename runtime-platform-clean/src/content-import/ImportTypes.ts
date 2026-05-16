/**
 * Package-agnostic import wire types. No gameplay semantics — adapters map external JSON → this shape.
 */

export type CanonicalRelationshipKind =
  | "inventory_item"
  | "transport_passenger"
  | "summoned_by"
  | "room_member"
  | "quest_owner"
  | "equipment_on"
  | "party_member"
  | "aura_from"
  | "generic"

export const CANONICAL_RELATIONSHIP_KINDS: readonly CanonicalRelationshipKind[] = [
  "inventory_item",
  "transport_passenger",
  "summoned_by",
  "room_member",
  "quest_owner",
  "equipment_on",
  "party_member",
  "aura_from",
  "generic"
] as const

export type CanonicalRelationshipEdge = {
  id: string
  kind: CanonicalRelationshipKind
  fromInstanceId: string
  toInstanceId: string
  /** Optional payload (counts, slots) — must be JSON-serializable. */
  metadata?: Record<string, unknown>
}

/** Single normalized entity instance before StateStore / ArmyList mapping. */
export type CanonicalImportedEntity = {
  instanceId: string
  templateId: string
  packageId: string
  entityType: string
  /** Merged into runtime canonical state keys where recognized. */
  state: Record<string, unknown>
  /** Display name, notes, external refs (opaque strings). */
  metadata: Record<string, unknown>
  relationships?: CanonicalRelationshipEdge[]
}

export type CanonicalImportGraph = {
  schemaVersion: 1
  packageId: string
  entities: CanonicalImportedEntity[]
  /** Global edges (may duplicate per-entity edges for convenience). */
  edges: CanonicalRelationshipEdge[]
}

/** Declarative JSON roster adapter (no code per system). */
export type JsonRosterAdapterV1 = {
  schemaVersion: 1
  packageId: string
  kind: "jsonRoster"
  listIdField?: string
  listNameField?: string
  factionIdField?: string
  unitsPath: string
  unitIdField: string
  unitNameField: string
  unitTagsField?: string
  unitTemplateField?: string
  unitTypeField?: string
  unitStateField?: string
  defaultEntityType?: string
  /** Dot path for nested list root, e.g. "roster" */
  rootPath?: string
  /**
   * If set, each unit object may carry an array of edges originating at that unit (`fromInstanceId` = unit id).
   * Wire row: `{ id, kind, toInstanceId | to, metadata? }`.
   */
  unitRelationshipsField?: string
}

export type PackageImportAdaptersManifest = {
  jsonRoster?: string
}
