import type { Assignment } from "@/models/types"
import type { ArmyList } from "@/models/types"
import type { RuntimeEntityRecord, RuntimeEvent } from "@/models/runtimeTypes"
import type { SeededRandomState } from "@/runtime/random/SeededRandom"

export const REPLAY_SCHEMA_VERSION = 1 as const

export type ReplayRngCallRecord = {
  kind: "float" | "int" | "pick" | "weightedPick" | "shuffle"
  /** Opaque digest of arguments (no giant arrays in trace). */
  argDigest: string
  /** Result digest */
  resultDigest: string
}

export type ReplayEnqueueRecord = {
  /** Monotonic within session */
  seq: number
  event: RuntimeEvent
  chainDepth: number
  rootDispatchSeq: number
  queueDepthAfter: number
  logicalEnqueuedAt: number
  /** Wall ms (informational only) */
  wallEnqueuedAt: number
}

export type ReplayDispatchFrame = {
  /** Matches QueuedRuntimeEvent.rootDispatchSeq for root rows */
  rootDispatchSeq: number
  event: RuntimeEvent
  assignments: Assignment[]
  /** RNG state after queue fully drained for this outer dispatch */
  rngStateAfter: SeededRandomState
  /** Stable sorted entity list JSON digest for divergence checks */
  entitiesDigest: string
  /** Optional: full entities for exact compare (large) */
  entitiesSnapshot?: RuntimeEntityRecord[]
  metricsAfter: Record<string, number>
  queueDepthAfter: number
  rngCallsDuringStep: ReplayRngCallRecord[]
  /** Optional stronger integrity (new recordings). */
  entityCanonicalHashAfter?: string
  queueStateHashAfter?: string
  canonicalStateHashAfter?: string
}

export type ReplayFileV1 = {
  schemaVersion: typeof REPLAY_SCHEMA_VERSION
  /** App / engine string for diagnostics */
  runtimeVersion: string
  seed: string | number
  rngStateInitial: SeededRandomState
  timeMode: "wall" | "logical"
  bootstrap: {
    systemId: string
    list: ArmyList
    assignments: Assignment[]
    /** Optional package ids for metadata only */
    packageIds?: string[]
  }
  /** Fingerprint of loaded rules (ids + triggers) */
  rulesFingerprint: string
  /** One entry per outer dispatch() */
  frames: ReplayDispatchFrame[]
  /** Optional trace export */
  traceGraph?: unknown
}

export type ReplayDivergence = {
  ok: false
  frameIndex: number
  field: "entities" | "rng" | "metrics" | "canonical"
  detail: string
}

export type ReplayMatch = { ok: true }
