import type { ArmyList, Assignment } from "@/models/types"
import type { EventRule } from "@/models/runtimeTypes"
import { createIsolatedRuntimeEngine } from "@/runtime/RuntimeEngine"
import { SimulationRunner } from "@/runtime/SimulationRunner"
import { loadEventRulesFromIndex } from "@/runtime/loadEventRules"
import { DeterministicTimeProvider } from "@/runtime/time/DeterministicClock"

export type BrowserIsolatedSimConfig = {
  seed: string | number
  maxTurns: number
  checkpointEvery: number
  timeMode: "wall" | "logical"
  deterministicClock: boolean
  eventLedger: boolean
  strictValidation: boolean
  /** When true, uses merged rules from `loadEventRulesFromIndex()` (same as the live app). */
  useLiveRuleIndex: boolean
  /** Used when `useLiveRuleIndex` is false. */
  rulesOverride: EventRule[]
  list: ArmyList
  assignments: Assignment[]
  systemId: string
  exportReplay: boolean
}

export async function runBrowserIsolatedSimulation(cfg: BrowserIsolatedSimConfig): Promise<
  | {
      ok: true
      haltedReason: string
      metrics: Record<string, number>
      snapshotCheckpoints: number
      replayJson?: string
      diagnostics: { queueSamples: number; ledgerEntries: number }
    }
  | { ok: false; error: string }
> {
  let rules: EventRule[] = cfg.rulesOverride
  if (cfg.useLiveRuleIndex) {
    const idx = await loadEventRulesFromIndex()
    if (!idx.ok) return { ok: false, error: idx.error }
    rules = idx.rules
  }

  const engine = createIsolatedRuntimeEngine()
  const runner = new SimulationRunner(engine)
  const timeProvider = cfg.deterministicClock ? new DeterministicTimeProvider(0) : undefined
  try {
    const result = await runner.run({
      systemId: cfg.systemId,
      list: cfg.list,
      assignments: cfg.assignments,
      rules,
      strictValidation: cfg.strictValidation,
      timeProvider,
      enableEventLedger: cfg.eventLedger,
      options: {
        maxTurns: cfg.maxTurns,
        seed: cfg.seed,
        timeMode: cfg.timeMode,
        entityIds: cfg.list.units.map((u) => u.id),
        checkpointEvery: cfg.checkpointEvery > 0 ? cfg.checkpointEvery : undefined,
        exportReplayOut: cfg.exportReplay
      }
    })
    const viz = engine.exportRuntimeDiagnosticsViz()
    const ledger = engine.exportEventLedger()
    return {
      ok: true,
      haltedReason: result.haltedReason,
      metrics: result.metrics as unknown as Record<string, number>,
      snapshotCheckpoints: result.snapshots?.length ?? 0,
      replayJson: result.replayJson,
      diagnostics: {
        queueSamples: viz.queueOccupancyHistory?.length ?? 0,
        ledgerEntries: ledger.entries?.length ?? 0
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
