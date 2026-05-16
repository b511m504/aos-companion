import type { RuntimeSnapshotV1 } from "@/runtime/snapshots/SnapshotTypes"
import type { ReplayFileV1 } from "@/runtime/replay/ReplayTypes"
import type { RuntimeEngine } from "@/runtime/RuntimeEngine"
import type { Assignment } from "@/models/types"

export type CrashBundleV1 = {
  schemaVersion: 1
  exportedAt: string
  reason: string
  snapshot: RuntimeSnapshotV1
  replay?: ReplayFileV1 | null
  trace?: unknown
  invariantReport?: unknown
  eventLedger?: unknown
}

export function exportCrashBundle(params: {
  engine: RuntimeEngine
  reason: string
  assignments: Assignment[]
  replay?: ReplayFileV1 | null
  trace?: unknown
  invariantReport?: unknown
  packageMetadata?: unknown
}): CrashBundleV1 {
  const snap = params.engine.exportRuntimeSnapshot({ packageMetadata: params.packageMetadata })
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    reason: params.reason,
    snapshot: snap,
    replay: params.replay ?? null,
    trace: params.trace ?? params.engine.getTraceGraphJson(),
    invariantReport: params.invariantReport ?? null,
    eventLedger: params.engine.exportEventLedger()
  }
}

export function exportCrashBundleJson(params: Parameters<typeof exportCrashBundle>[0]): string {
  return JSON.stringify(exportCrashBundle(params), null, 2)
}
