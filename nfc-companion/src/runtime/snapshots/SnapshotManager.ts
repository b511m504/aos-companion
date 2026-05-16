import type { RuntimeSnapshotV1 } from "@/runtime/snapshots/SnapshotTypes"
import { SNAPSHOT_SCHEMA_VERSION } from "@/runtime/snapshots/SnapshotTypes"
import type { Assignment } from "@/models/types"
import type { RuntimeEngine } from "@/runtime/RuntimeEngine"

export class SnapshotManager {
  /** Rolling checkpoints (caller trims). */
  private history: RuntimeSnapshotV1[] = []
  private maxHistory: number

  constructor(maxHistory = 8) {
    this.maxHistory = maxHistory
  }

  saveState(
    engine: RuntimeEngine,
    params?: { assignments?: Assignment[]; packageMetadata?: unknown; simulationMeta?: Record<string, unknown> }
  ): RuntimeSnapshotV1 {
    const snap = engine.exportRuntimeSnapshot(params)
    this.history.push(snap)
    if (this.history.length > this.maxHistory) this.history.splice(0, this.history.length - this.maxHistory)
    return snap
  }

  loadState(engine: RuntimeEngine, snap: RuntimeSnapshotV1) {
    engine.importRuntimeSnapshot(snap)
  }

  getHistory(): readonly RuntimeSnapshotV1[] {
    return this.history
  }

  clearHistory() {
    this.history = []
  }

  static parse(json: unknown): RuntimeSnapshotV1 {
    if (typeof json !== "object" || json === null) throw new Error("Snapshot: invalid root")
    const o = json as RuntimeSnapshotV1
    if (o.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) throw new Error("Snapshot: unsupported schema")
    return o
  }
}
