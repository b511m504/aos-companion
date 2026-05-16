/** Physical tag identity assignment (offline-first). */
export type Assignment = {
  tagUid: string
  entityId: string
  entityType: string
  displayName: string
  factionId: string
  gameSystemId: string
  assignedAt: string
  /** Optional: content package id for mixed-package sessions. */
  packageId?: string
  /** Optional: template / archetype id from import normalization. */
  templateId?: string
}

/** Portable export wire format (subset + optional fields). */
export type AssignmentExportRow = {
  tagUid: string
  entityId: string
  displayName: string
  entityType?: string
  assignedAt?: string
  factionId?: string
  gameSystemId?: string
  packageId?: string
  templateId?: string
}

export type AssignmentExportBundle = {
  schemaVersion: 1
  exportedAt: string
  gameSystemId: string
  factionId: string
  listId: string
  assignments: AssignmentExportRow[]
}

export type ContentPackageManifest = {
  packageType: string
  schemaVersion: 1
  contentVersion: string
  systemId: string
  /** Use "*" when the file contains multiple factions/lists. */
  factionId: string
  /** Optional: paths relative to package root for import adapters. */
  importAdapters?: {
    jsonRoster?: string
  }
}

export type GameSystem = {
  schemaVersion: 1
  id: string
  name: string
  version: string
  description: string
  /** Relative to `/content/` — loader extension, not game-specific logic. */
  factionsPath: string
}

export type Faction = {
  id: string
  systemId: string
  name: string
  listsPath: string
}

export type Unit = {
  id: string
  name: string
  /** Logical tags for runtime conditions (objective, door, trap, …). */
  tags?: string[]
  /** Generic NFC / import binding (any entity class). */
  entityType?: string
  packageId?: string
  templateId?: string
  /** Values merged into canonical runtime state at bootstrap. */
  runtimeStateOverlay?: Record<string, unknown>
}

export type ArmyList = {
  id: string
  name: string
  factionId: string
  /** Short blurb for list cards (dummy catalog). */
  description?: string
  /** Optional: last canonical import metadata (observability). */
  importMeta?: {
    packageId: string
    adapterKind: string
    entityCount?: number
  }
  units: Unit[]
}

export type ContentCatalog = {
  schemaVersion: 1
  systemRefs: { path: string }[]
}

export type FactionsFile = {
  schemaVersion: 1
  package: ContentPackageManifest
  factions: Faction[]
}

export type ListsFile = {
  schemaVersion: 1
  package: ContentPackageManifest
  lists: ArmyList[]
}

export type SessionContext = {
  gameSystemId: string
  gameSystemName: string
  factionId: string
  factionName: string
  listId: string
  listName: string
}

export type AssignmentConflict = {
  tagUid: string
  existing: Assignment
  proposedEntityId: string
  proposedDisplayName: string
}

export type ScanFeedback =
  | { kind: "idle" }
  | { kind: "listening" }
  | { kind: "success"; uid: string; message: string }
  | { kind: "error"; message: string }

export type NfcMode = "native" | "simulated"

export type NfcScanMachineState =
  | "idle"
  | "arming"
  | "scanning"
  | "success"
  | "error"
  | "cooldown"

export type NfcHardwareError = {
  at: string
  code: "unsupported" | "permission_denied" | "canceled" | "malformed_payload" | "plugin_failure" | "unknown"
  message: string
}

export type PersistedAssignmentBundle = {
  schemaVersion: 1
  listId: string
  assignments: Assignment[]
}

export type PersistedStoreSnapshot = {
  schemaVersion: 1
  bundles: PersistedAssignmentBundle[]
}

export type EntityAssignmentFilter = "all" | "assigned" | "unassigned"

export type ImportMergeStrategy = "strict" | "safe_partial"

/** Per-unit tag check during Validate (does not mutate assignments). */
export type ValidationRowStatus = "pending" | "verified" | "problem"

/** High-level Validate UI / NFC session (separate from assignment scan). */
export type ValidationPhase = "idle" | "scanning" | "verified" | "warning" | "complete"

export type ValidationBanner = {
  tone: "ok" | "bad" | "neutral"
  text: string
}
