import type { EventRule } from "@/models/runtimeTypes"
import type { ReplayFileV1, ReplayDivergence, ReplayMatch } from "@/runtime/replay/ReplayTypes"
import { ReplayRecorder } from "@/runtime/replay/ReplayRecorder"
import { RuntimeEngine } from "@/runtime/RuntimeEngine"
import type { SeededRandomState } from "@/runtime/random/SeededRandom"
import { DeterministicTimeProvider } from "@/runtime/time/DeterministicClock"
import type { TimeProvider } from "@/runtime/time/TimeProvider"

function sameRngState(a: SeededRandomState, b: SeededRandomState): boolean {
  return a.s === b.s
}

function metricsClose(
  a: Record<string, number>,
  b: Record<string, number>
): { ok: true } | { ok: false; detail: string } {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    const av = a[k] ?? 0
    const bv = b[k] ?? 0
    if (Math.abs(av - bv) > 0.001) return { ok: false, detail: `metrics.${k} ${av} vs ${bv}` }
  }
  return { ok: true }
}

export class ReplayRunner {
  /**
   * Replays outer dispatches in order. Pass the same `rules` array used when recording
   * if rules were injected; otherwise omit and the engine loads from index as during record.
   */
  async replay(
    engine: RuntimeEngine,
    replay: ReplayFileV1,
    params?: { rules?: EventRule[]; timeProvider?: TimeProvider }
  ): Promise<ReplayMatch | ReplayDivergence> {
    const timeProvider =
      params?.timeProvider ?? (replay.timeMode === "logical" ? new DeterministicTimeProvider(0) : undefined)
    const boot = await engine.bootstrap({
      systemId: replay.bootstrap.systemId,
      list: replay.bootstrap.list,
      assignments: replay.bootstrap.assignments,
      rules: params?.rules,
      rngSeed: replay.seed,
      timeMode: replay.timeMode,
      timeProvider
    })
    if (!boot.ok) return { ok: false, frameIndex: -1, field: "entities", detail: boot.error }

    engine.importRngState(replay.rngStateInitial)

    const fp = engine.getRulesFingerprint()
    if (fp !== replay.rulesFingerprint) {
      return {
        ok: false,
        frameIndex: -1,
        field: "rng",
        detail: `rulesFingerprint mismatch recorded=${replay.rulesFingerprint} current=${fp}`
      }
    }

    for (let i = 0; i < replay.frames.length; i++) {
      const fr = replay.frames[i]!
      engine.dispatch(fr.event, fr.assignments)
      const entDigest = engine.getEntitiesDigest()
      if (entDigest !== fr.entitiesDigest) {
        return { ok: false, frameIndex: i, field: "entities", detail: `digest ${entDigest} vs ${fr.entitiesDigest}` }
      }
      if (fr.canonicalStateHashAfter) {
        const cur = engine.getSnapshotIntegrity()
        if (cur.fullStateHash !== fr.canonicalStateHashAfter) {
          return {
            ok: false,
            frameIndex: i,
            field: "canonical",
            detail: `canonicalStateHash ${cur.fullStateHash} vs ${fr.canonicalStateHashAfter}`
          }
        }
      }
      const rng = engine.exportRngState()
      if (!sameRngState(rng, fr.rngStateAfter)) {
        return {
          ok: false,
          frameIndex: i,
          field: "rng",
          detail: `rng state mismatch after frame`
        }
      }
      const m = engine.getMetrics() as unknown as Record<string, number>
      const mc = metricsClose(m, fr.metricsAfter)
      if (!mc.ok) return { ok: false, frameIndex: i, field: "metrics", detail: mc.detail }
      if (engine.getQueueSnapshot().length !== fr.queueDepthAfter) {
        return {
          ok: false,
          frameIndex: i,
          field: "metrics",
          detail: `queue depth ${engine.getQueueSnapshot().length} vs ${fr.queueDepthAfter}`
        }
      }
    }

    return { ok: true }
  }

  /** Convenience: parse JSON text then replay */
  async replayFromJson(
    engine: RuntimeEngine,
    jsonText: string,
    params?: { rules?: EventRule[]; timeProvider?: TimeProvider }
  ): Promise<ReplayMatch | ReplayDivergence> {
    const replay = ReplayRecorder.importReplay(JSON.parse(jsonText) as unknown)
    return this.replay(engine, replay, params)
  }
}
