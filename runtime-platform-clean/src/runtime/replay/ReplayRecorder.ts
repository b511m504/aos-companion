import type { Assignment } from "@/models/types"
import type { ArmyList } from "@/models/types"
import type { EventRule, RuntimeEntityRecord, RuntimeEvent } from "@/models/runtimeTypes"
import type { ReplayDispatchFrame, ReplayFileV1, ReplayRngCallRecord } from "@/runtime/replay/ReplayTypes"
import { REPLAY_SCHEMA_VERSION } from "@/runtime/replay/ReplayTypes"
import type { SeededRandom } from "@/runtime/random/SeededRandom"
import type { SeededRandomState } from "@/runtime/random/SeededRandom"
import type { RuntimeStressMetrics } from "@/models/runtimeTypes"
import { fingerprintRuleset, digestEntitySnapshot } from "@/runtime/validation/validatePackage"

export class ReplayRecorder {
  private frames: ReplayDispatchFrame[] = []
  private rngCallsBuffer: ReplayRngCallRecord[] = []
  private meta: Omit<ReplayFileV1, "frames" | "traceGraph"> | null = null

  begin(params: {
    runtimeVersion: string
    seed: string | number
    rngStateInitial: SeededRandomState
    timeMode: "wall" | "logical"
    systemId: string
    list: ArmyList
    assignments: Assignment[]
    rules: readonly EventRule[]
    packageIds?: string[]
  }) {
    this.frames = []
    this.rngCallsBuffer = []
    this.meta = {
      schemaVersion: REPLAY_SCHEMA_VERSION,
      runtimeVersion: params.runtimeVersion,
      seed: params.seed,
      rngStateInitial: { ...params.rngStateInitial },
      timeMode: params.timeMode,
      bootstrap: {
        systemId: params.systemId,
        list: params.list,
        assignments: params.assignments,
        packageIds: params.packageIds
      },
      rulesFingerprint: fingerprintRuleset(params.rules)
    }
  }

  /** Hook from RNG wrapper — optional fine-grained audit */
  recordRngCall(entry: ReplayRngCallRecord) {
    this.rngCallsBuffer.push(entry)
  }

  drainRngCallsForFrame(): ReplayRngCallRecord[] {
    const out = [...this.rngCallsBuffer]
    this.rngCallsBuffer = []
    return out
  }

  recordFrame(params: {
    rootDispatchSeq: number
    event: RuntimeEvent
    assignments: readonly Assignment[]
    rng: SeededRandom
    entities: readonly RuntimeEntityRecord[]
    metrics: RuntimeStressMetrics
    queueDepth: number
    includeEntityBodies?: boolean
    integrity?: {
      entityCanonicalHashAfter: string
      queueStateHashAfter: string
      canonicalStateHashAfter: string
    }
  }) {
    const frame: ReplayDispatchFrame = {
      rootDispatchSeq: params.rootDispatchSeq,
      event: { type: params.event.type, payload: { ...params.event.payload } },
      assignments: params.assignments.map((a) => ({ ...a })),
      rngStateAfter: params.rng.getState(),
      entitiesDigest: digestEntitySnapshot(params.entities),
      metricsAfter: { ...params.metrics },
      queueDepthAfter: params.queueDepth,
      rngCallsDuringStep: this.drainRngCallsForFrame()
    }
    if (params.integrity) {
      frame.entityCanonicalHashAfter = params.integrity.entityCanonicalHashAfter
      frame.queueStateHashAfter = params.integrity.queueStateHashAfter
      frame.canonicalStateHashAfter = params.integrity.canonicalStateHashAfter
    }
    if (params.includeEntityBodies) {
      frame.entitiesSnapshot = params.entities.map((e) => JSON.parse(JSON.stringify(e)) as RuntimeEntityRecord)
    }
    this.frames.push(frame)
  }

  exportReplay(traceGraph?: unknown): ReplayFileV1 {
    if (!this.meta) throw new Error("ReplayRecorder: begin() not called")
    return {
      ...this.meta,
      frames: this.frames.map((f) => JSON.parse(JSON.stringify(f)) as ReplayDispatchFrame),
      traceGraph
    }
  }

  static importReplay(json: unknown): ReplayFileV1 {
    if (typeof json !== "object" || json === null) throw new Error("Replay import: not an object")
    const o = json as Record<string, unknown>
    if (o.schemaVersion !== REPLAY_SCHEMA_VERSION) throw new Error("Replay import: unsupported schemaVersion")
    return o as ReplayFileV1
  }
}

export function exportReplayJson(recorder: ReplayRecorder, traceGraph?: unknown): string {
  return JSON.stringify(recorder.exportReplay(traceGraph), null, 2)
}

export function importReplay(jsonText: string): ReplayFileV1 {
  return ReplayRecorder.importReplay(JSON.parse(jsonText) as unknown)
}
