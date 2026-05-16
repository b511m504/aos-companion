import type { CanonicalRelationshipEdge, CanonicalRelationshipKind } from "@/content-import/ImportTypes"

export type { CanonicalRelationshipEdge, CanonicalRelationshipKind }

export type RelationshipGraphWireV1 = {
  schemaVersion: 1
  packageId: string
  edges: CanonicalRelationshipEdge[]
}
