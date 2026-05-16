import type { ReplayFileV1 } from "@/runtime/replay/ReplayTypes"
import type { EventRule } from "@/models/runtimeTypes"
import { ReplayRunner } from "@/runtime/replay/ReplayRunner"
import { createIsolatedRuntimeEngine, type RuntimeEngine } from "@/runtime/RuntimeEngine"
import type { TimeProvider } from "@/runtime/time/TimeProvider"

export type DifferentialReplayRow = {
  label: string
  finalCanonicalHash: string
  finalEntityDigest: string
  eventsProcessed: number
  queueDepthEnd: number
  ok: boolean
  detail?: string
}

/**
 * Run the same replay on multiple isolated engines (e.g. different configs) and compare outcomes.
 */
export async function runDifferentialReplay(
  replay: ReplayFileV1,
  variants: {
    label: string
    build: () => RuntimeEngine
    params?: { rules?: EventRule[]; timeProvider?: TimeProvider }
  }[]
): Promise<{ rows: DifferentialReplayRow[]; allMatch: boolean }> {
  const runner = new ReplayRunner()
  const rows: DifferentialReplayRow[] = []
  let baseline: string | null = null
  let allMatch = true
  for (const v of variants) {
    const engine = v.build()
    const res = await runner.replay(engine, replay, v.params)
    const integ = engine.getSnapshotIntegrity()
    const m = engine.getMetrics()
    const ok = res.ok === true
    const row: DifferentialReplayRow = {
      label: v.label,
      finalCanonicalHash: integ.fullStateHash,
      finalEntityDigest: engine.getEntitiesDigest(),
      eventsProcessed: m.eventsProcessed,
      queueDepthEnd: engine.getQueueSnapshot().length,
      ok,
      detail: res.ok ? undefined : `${res.field}: ${res.detail}`
    }
    rows.push(row)
    if (baseline === null) baseline = row.finalCanonicalHash
    else if (row.finalCanonicalHash !== baseline) allMatch = false
    if (!ok) allMatch = false
  }
  return { rows, allMatch }
}

export function defaultEngineFactory(): RuntimeEngine {
  return createIsolatedRuntimeEngine()
}
