import type { Assignment } from "@/models/types"
import type { RuntimeEntityRecord, RuntimeStressMetrics } from "@/models/runtimeTypes"
import type { SeededRandomState } from "@/runtime/random/SeededRandom"
import type { QueuedRuntimeEvent } from "@/runtime/EventQueue"
import type { SnapshotIntegrityHashes } from "@/runtime/hash/hashSnapshot"

export const SNAPSHOT_SCHEMA_VERSION = 1 as const

export type RuntimeSnapshotV1 = {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION
  /** Wall time when snapshot was taken */
  capturedAt: string
  systemId: string | null
  timeMode: "wall" | "logical"
  logicalClock: number
  rootDispatchCounter: number
  entities: RuntimeEntityRecord[]
  queue: QueuedRuntimeEvent[]
  dedupeRecent: [string, number][]
  metrics: RuntimeStressMetrics
  rng: SeededRandomState
  /** Rule ids in evaluation order (sorted by priority desc at bootstrap) */
  ruleIds: string[]
  assignments: Assignment[]
  integrityHashes?: SnapshotIntegrityHashes
  /** Opaque metadata (e.g. package manifests summaries) */
  packageMetadata?: unknown
  simulationMeta?: Record<string, unknown>
}
