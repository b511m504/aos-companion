import type { Assignment, ArmyList } from "@/models/types"
import type { ReplayFileV1 } from "@/runtime/replay/ReplayTypes"
import type { RuntimeSnapshotV1 } from "@/runtime/snapshots/SnapshotTypes"
import type { RuntimeQueueVizV1 } from "@/runtime/visualization/runtimeQueueViz"
import { getRuntimeEngine } from "@/runtime/RuntimeEngine"
import { exportReplayJson } from "@/runtime/replay/ReplayRecorder"
import type { ReplayRecorder } from "@/runtime/replay/ReplayRecorder"
import { SnapshotManager } from "@/runtime/snapshots/SnapshotManager"
import { APP_VERSION } from "@/buildInfo"
import type { SeededRandomState } from "@/runtime/random/SeededRandom"
import type { SnapshotIntegrityHashes } from "@/runtime/hash/hashSnapshot"

export const REPLAY_BUNDLE_SCHEMA_VERSION = 1 as const

export type ReplayBundleV1 = {
  schemaVersion: typeof REPLAY_BUNDLE_SCHEMA_VERSION
  exportedAt: string
  label?: string
  runtimeVersion: string
  /** Optional replay payload when a recorder session was active */
  replay: ReplayFileV1 | null
  /** Rolling checkpoints captured alongside export */
  snapshots: RuntimeSnapshotV1[]
  diagnostics: {
    queueViz: RuntimeQueueVizV1 | null
    traceGraph: unknown
    rulesFingerprint: string
    entitiesDigest: string
    rngState: SeededRandomState
    snapshotIntegrity: SnapshotIntegrityHashes
  }
  canonicalEntityExport: {
    listId: string | null
    units: Array<{
      id: string
      name: string
      entityType?: string
      packageId?: string
      templateId?: string
      tags?: string[]
    }>
  } | null
  relationshipGraphJson: string | null
  assignments: Assignment[]
  listSummary: { id: string; name: string; factionId: string } | null
  systemId: string | null
  certification: {
    lastCanonicalImportOk: boolean | null
    lastCanonicalImportErrors: string[]
  }
}

export function exportReplayBundle(params: {
  recorder: ReplayRecorder | null
  snapshots: RuntimeSnapshotV1[]
  list: ArmyList | null
  assignments: Assignment[]
  systemId: string | null
  relationshipGraphJson: string | null
  lastImportOk: boolean | null
  lastImportErrors: string[]
  label?: string
}): ReplayBundleV1 {
  const eng = getRuntimeEngine()
  let replay: ReplayFileV1 | null = null
  if (params.recorder) {
    try {
      replay = JSON.parse(exportReplayJson(params.recorder, eng.getTraceGraphJson())) as ReplayFileV1
    } catch {
      replay = null
    }
  }
  return {
    schemaVersion: REPLAY_BUNDLE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    label: params.label,
    runtimeVersion: APP_VERSION,
    replay,
    snapshots: params.snapshots.map((s) => JSON.parse(JSON.stringify(s)) as RuntimeSnapshotV1),
    diagnostics: {
      queueViz: eng.exportRuntimeDiagnosticsViz(),
      traceGraph: eng.getTraceGraphJson(),
      rulesFingerprint: eng.getRulesFingerprint(),
      entitiesDigest: eng.getEntitiesDigest(),
      rngState: eng.exportRngState(),
      snapshotIntegrity: eng.getSnapshotIntegrity()
    },
    canonicalEntityExport: params.list
      ? {
          listId: params.list.id,
          units: params.list.units.map((u) => ({
            id: u.id,
            name: u.name,
            entityType: u.entityType,
            packageId: u.packageId,
            templateId: u.templateId,
            tags: u.tags
          }))
        }
      : null,
    relationshipGraphJson: params.relationshipGraphJson,
    assignments: params.assignments.map((a) => ({ ...a })),
    listSummary: params.list
      ? { id: params.list.id, name: params.list.name, factionId: params.list.factionId }
      : null,
    systemId: params.systemId,
    certification: {
      lastCanonicalImportOk: params.lastImportOk,
      lastCanonicalImportErrors: params.lastImportErrors
    }
  }
}

export function serializeReplayBundle(bundle: ReplayBundleV1): string {
  return JSON.stringify(bundle, null, 2)
}

export function parseReplayBundleJson(text: string): ReplayBundleV1 {
  const v = JSON.parse(text) as ReplayBundleV1
  if (v.schemaVersion !== REPLAY_BUNDLE_SCHEMA_VERSION) throw new Error("Unsupported replay bundle schema")
  return v
}

/** Restore engine state from the last snapshot in a bundle (assignments are not auto-written to persistence). */
export function applyReplayBundleSnapshot(bundle: ReplayBundleV1): void {
  const last = bundle.snapshots[bundle.snapshots.length - 1]
  if (!last) throw new Error("Bundle has no snapshots")
  const eng = getRuntimeEngine()
  eng.importRuntimeSnapshot(SnapshotManager.parse(last as unknown))
}
