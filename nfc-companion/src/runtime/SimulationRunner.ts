import type { Assignment } from "@/models/types"
import type { ArmyList } from "@/models/types"
import type { EventRule, RuntimeEvent } from "@/models/runtimeTypes"
import { RUNTIME_LIMITS } from "@/runtime/runtimeConstants"
import { RuntimeEngine } from "@/runtime/RuntimeEngine"
import { SeededRandom } from "@/runtime/random/SeededRandom"
import { ReplayRecorder, exportReplayJson } from "@/runtime/replay/ReplayRecorder"
import { APP_VERSION } from "@/buildInfo"
import { SnapshotManager } from "@/runtime/snapshots/SnapshotManager"
import type { TimeProvider } from "@/runtime/time/TimeProvider"

export type SimulationRunnerOptions = {
  maxTurns: number
  delayMsBetweenTurns?: number
  entityIds: string[]
  eventTypes?: RuntimeEvent["type"][]
  /** Deterministic RNG for all picks (never Math.random). */
  seed: string | number
  /** logical time mode improves replay stability (disables wall-clock root dedupe). */
  timeMode?: "wall" | "logical"
  /** Persist rolling snapshots during run. */
  checkpointEvery?: number
  /** Export replay JSON string when run completes. */
  exportReplayOut?: boolean
}

const DEFAULT_EVENT_MIX: RuntimeEvent["type"][] = [
  "simulation.tick",
  "turn.start",
  "turn.end",
  "ai.tick",
  "rng.table",
  "action.spent",
  "unit.damaged",
  "timer.fire",
  "start_game",
  "timer_tick",
  "entity_damaged",
  "objective.scored"
]

/**
 * Auto-play harness: deterministic picks via SeededRandom; optional replay export.
 */
export class SimulationRunner {
  private readonly engine: RuntimeEngine

  constructor(engine: RuntimeEngine) {
    this.engine = engine
  }

  async run(params: {
    systemId: string
    list: ArmyList
    assignments: Assignment[]
    /** When set (including empty), skips remote rules index fetch — required for Node CLI. */
    rules?: EventRule[]
    strictValidation?: boolean
    packageManifests?: unknown[]
    timeProvider?: TimeProvider
    enableEventLedger?: boolean
    eventLedgerMax?: number
    options: SimulationRunnerOptions
    onTurn?: (turn: number, metrics: ReturnType<RuntimeEngine["getMetrics"]>) => void
  }): Promise<{
    turns: number
    haltedReason: "max_turns" | "paused" | "queue_budget" | "deadlock_suspected"
    metrics: ReturnType<RuntimeEngine["getMetrics"]>
    replayJson?: string
    snapshots?: ReturnType<SnapshotManager["getHistory"]>
  }> {
    const {
      systemId,
      list,
      assignments,
      options,
      onTurn,
      rules,
      strictValidation,
      packageManifests,
      timeProvider,
      enableEventLedger,
      eventLedgerMax
    } = params
    const boot = await this.engine.bootstrap({
      systemId,
      list,
      assignments,
      rules,
      rngSeed: options.seed,
      timeMode: options.timeMode ?? "logical",
      strictValidation,
      packageManifests,
      timeProvider,
      enableEventLedger,
      eventLedgerMax
    })
    if (!boot.ok) {
      throw new Error(boot.error)
    }

    const simRng = new SeededRandom(`${String(options.seed)}:sim`)
    const eventTypes = options.eventTypes?.length ? options.eventTypes : DEFAULT_EVENT_MIX
    const delay = options.delayMsBetweenTurns ?? 0
    let halted: "max_turns" | "paused" | "queue_budget" | "deadlock_suspected" = "max_turns"
    let stallTurns = 0

    const recorder = new ReplayRecorder()
    recorder.begin({
      runtimeVersion: APP_VERSION,
      seed: options.seed,
      rngStateInitial: this.engine.exportRngState(),
      timeMode: options.timeMode ?? "logical",
      systemId,
      list,
      assignments,
      rules: [...this.engine.getRules()]
    })
    this.engine.attachReplayRecorder(recorder)
    this.engine.setRecordingEnabled(true)

    const snaps = new SnapshotManager(16)

    for (let turn = 0; turn < options.maxTurns; turn++) {
      if (this.engine.isPaused()) {
        halted = "paused"
        break
      }
      const ids = options.entityIds.length ? options.entityIds : list.units.map((u) => u.id)
      const eid = simRng.pick(ids)
      const evType = simRng.pick(eventTypes)
      const event: RuntimeEvent = {
        type: evType,
        payload: {
          entityId: eid,
          effectTargetEntityId: eid,
          playerId: simRng.nextFloat() < 0.5 ? "player1" : "player2",
          simTurn: turn,
          dice: simRng.nextInt(1, 6),
          tagUid: `sim-${turn}`
        }
      }
      const beforeCount = this.engine.getMetrics().eventsProcessed
      this.engine.dispatch(event, assignments)
      const m = this.engine.getMetrics()
      if (m.eventsProcessed === beforeCount) stallTurns++
      else stallTurns = 0
      if (stallTurns > 50 && this.engine.getQueueSnapshot().length === 0) {
        halted = "deadlock_suspected"
        break
      }
      if (options.checkpointEvery && turn % options.checkpointEvery === 0) {
        snaps.saveState(this.engine, { assignments, simulationMeta: { turn } })
      }
      onTurn?.(turn, m)
      if (delay > 0) await new Promise((r) => setTimeout(r, delay))
      const log = this.engine.getDebugLog()
      const lastWarn = log[log.length - 1]
      if (lastWarn?.kind === "warning" && lastWarn.text.includes("Queue step budget")) {
        halted = "queue_budget"
        break
      }
    }

    this.engine.setRecordingEnabled(false)
    this.engine.attachReplayRecorder(null)

    const replayJson = options.exportReplayOut ? exportReplayJson(recorder, this.engine.getTraceGraphJson()) : undefined

    return {
      turns: options.maxTurns,
      haltedReason: halted,
      metrics: this.engine.getMetrics(),
      replayJson,
      snapshots: snaps.getHistory()
    }
  }

  burst(engine: RuntimeEngine, assignments: Assignment[], count: number, seed: string | number) {
    const r = new SeededRandom(`${String(seed)}:burst`)
    const ids = assignments.length > 0 ? assignments.map((a) => a.entityId) : ["sim"]
    for (let i = 0; i < count; i++) {
      engine.dispatch(
        {
          type: "simulation.tick",
          payload: { entityId: r.pick(ids), stress: `burst-${i}` }
        },
        assignments
      )
      if (engine.getMetrics().eventsProcessed > RUNTIME_LIMITS.MAX_QUEUE_STEPS) break
    }
  }
}
