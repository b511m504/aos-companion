import type { Assignment } from "@/models/types"
import type { ArmyList } from "@/models/types"
import type {
  EventRule,
  RuntimeDebugEntry,
  RuntimeEntityRecord,
  RuntimeEvent,
  RuntimeExecutionContext,
  RuntimeStressMetrics
} from "@/models/runtimeTypes"
import { runtimeEntityStatesFromUnitOverlay } from "@/utils/canonicalStateMerge"
import { StateStore } from "@/runtime/StateStore"
import { EventBus } from "@/runtime/EventBus"
import { TranslationManager } from "@/runtime/TranslationManager"
import { evaluateAllConditions, type EvaluationContext } from "@/runtime/ConditionEvaluator"
import { executeActions, type StateMutationDebug } from "@/runtime/ActionExecutor"
import { loadEventRulesFromIndex } from "@/runtime/loadEventRules"
import { createChainFrame } from "@/runtime/targetResolution"
import { EventQueue, type QueuedRuntimeEvent } from "@/runtime/EventQueue"
import { eventDedupeKey } from "@/runtime/eventDedupeKey"
import { RUNTIME_LIMITS } from "@/runtime/runtimeConstants"
import { SeededRandom } from "@/runtime/random/SeededRandom"
import type { SeededRandomState } from "@/runtime/random/SeededRandom"
import { ReplayRecorder } from "@/runtime/replay/ReplayRecorder"
import { TraceGraph } from "@/runtime/tracing/TraceGraph"
import type { RuntimeSnapshotV1 } from "@/runtime/snapshots/SnapshotTypes"
import { SNAPSHOT_SCHEMA_VERSION } from "@/runtime/snapshots/SnapshotTypes"
import { mergeSandboxConfig, enforceRuleCount, type MergedSandboxConfig, type PackageCapabilities } from "@/runtime/sandbox/PackageSandbox"
import { validateRuleset, fingerprintRuleset, digestEntitySnapshot } from "@/runtime/validation/validatePackage"
import { createWallTimeProvider, type TimeProvider } from "@/runtime/time/TimeProvider"
import { DeterministicTimeProvider } from "@/runtime/time/DeterministicClock"
import { compileRules, type CompiledRuleIndex } from "@/runtime/compiler/compileRules"
import { computeSnapshotIntegrity, hashRngState, type SnapshotIntegrityHashes } from "@/runtime/hash/hashSnapshot"
import { EventLedger } from "@/runtime/logs/EventLedger"
import type { RuntimeQueueVizV1 } from "@/runtime/visualization/runtimeQueueViz"

export type DispatchResult = {
  messages: string[]
  warnings: string[]
  openEntityPanel: boolean
  /** Entity id from the outermost dispatch payload for panel open. */
  rootEntityIdForPanel: string | null
}

export function extractPrimaryEntityId(event: RuntimeEvent): string | null {
  const p = event.payload
  if (typeof p.entityId === "string") return p.entityId
  if (typeof p.targetEntityId === "string") return p.targetEntityId
  return null
}

export function buildRuntimeEntitiesFromList(list: ArmyList): RuntimeEntityRecord[] {
  return list.units.map((u) => {
    const extraTags: string[] = []
    if (u.packageId) extraTags.push(`package:${u.packageId}`)
    if (u.templateId) extraTags.push(`template:${u.templateId}`)
    if (u.entityType) extraTags.push(`entityType:${u.entityType}`)
    return {
      id: u.id,
      type: "entity" as const,
      name: u.name,
      tags: [...(u.tags ?? []), ...extraTags],
      states: runtimeEntityStatesFromUnitOverlay(u.runtimeStateOverlay)
    }
  })
}

function emptyDispatch(): DispatchResult {
  return { messages: [], warnings: [], openEntityPanel: false, rootEntityIdForPanel: null }
}

function metricsSeed(): RuntimeStressMetrics {
  return {
    eventsProcessed: 0,
    actionsExecuted: 0,
    mutationsApplied: 0,
    warningsGenerated: 0,
    dedupeSkips: 0,
    queueDepthSum: 0,
    queueDepthSamples: 0,
    maxQueueDepthObserved: 0,
    maxChainDepthReached: 0,
    ruleCandidatesEvaluated: 0,
    rulesPassedAllConditions: 0,
    conditionEvaluations: 0,
    followUpsEnqueued: 0,
    dispatchWallMsSum: 0,
    dispatchWallSamples: 0
  }
}

export class RuntimeEngine {
  readonly stateStore = new StateStore()
  readonly eventBus = new EventBus()
  readonly translations = new TranslationManager()
  private readonly queue = new EventQueue()
  private rules: EventRule[] = []
  private systemId: string | null = null
  private debugLog: RuntimeDebugEntry[] = []
  private dedupeRecent = new Map<string, number>()
  private paused = false
  private flushing = false
  private metrics: RuntimeStressMetrics = metricsSeed()
  private rng = new SeededRandom("default")
  private timeMode: "wall" | "logical" = "wall"
  private logicalClock = 0
  private rootDispatchCounter = 0
  private replayRecorder: ReplayRecorder | null = null
  private recordingEnabled = false
  private traceGraph: TraceGraph | null = null
  private tracingEnabled = false
  private sandbox: MergedSandboxConfig = mergeSandboxConfig([])
  private followUpsPerRoot = new Map<number, number>()
  private strictValidation = false
  private time: TimeProvider = createWallTimeProvider()
  private ruleIndex: CompiledRuleIndex = compileRules([])
  private eventLedger: EventLedger | null = null
  private ledgerEnabled = false
  private emitsThisFlush = 0
  private readonly diagCap = 8000
  private diagQueueDepth: number[] = []
  private diagChainDepth: number[] = []
  private diagDispatchMs: number[] = []
  private diagFlame: { depth: number; durationMs: number }[] = []

  getRules(): readonly EventRule[] {
    return this.rules
  }

  getDebugLog(): RuntimeDebugEntry[] {
    return [...this.debugLog]
  }

  getQueueSnapshot(): ReturnType<EventQueue["snapshot"]> {
    return this.queue.snapshot()
  }

  getMetrics(): RuntimeStressMetrics {
    return { ...this.metrics }
  }

  getTimeProvider(): TimeProvider {
    return this.time
  }

  /** Deterministic integrity bundle (entities + queue + rng + clocks). */
  getSnapshotIntegrity(): SnapshotIntegrityHashes {
    return computeSnapshotIntegrity({
      entities: this.stateStore.getAll(),
      queue: this.queue.snapshot(),
      rng: this.rng.getState(),
      logicalClock: this.logicalClock,
      rootDispatchCounter: this.rootDispatchCounter
    })
  }

  setLedgerEnabled(on: boolean, maxEntries = 50_000) {
    this.ledgerEnabled = on
    if (on) {
      this.eventLedger = new EventLedger(maxEntries)
    }
  }

  exportEventLedger() {
    return this.eventLedger?.export() ?? { schemaVersion: 1 as const, entries: [] }
  }

  /** Ring-buffered series for external visualization / soak metrics. */
  exportRuntimeDiagnosticsViz(): RuntimeQueueVizV1 {
    return {
      schemaVersion: 1,
      queueOccupancyHistory: [...this.diagQueueDepth],
      chainDepthSampleHistory: [...this.diagChainDepth],
      dispatchDurationMsHistory: [...this.diagDispatchMs],
      dispatchFlameRows: [...this.diagFlame]
    }
  }

  private pushDiagSample(queueDepth: number, chainDepth: number) {
    this.diagQueueDepth.push(queueDepth)
    this.diagChainDepth.push(chainDepth)
    this.trimDiag(this.diagQueueDepth)
    this.trimDiag(this.diagChainDepth)
  }

  private pushDiagDuration(ms: number, depth: number) {
    this.diagDispatchMs.push(ms)
    this.trimDiag(this.diagDispatchMs)
    this.diagFlame.push({ depth, durationMs: ms })
    if (this.diagFlame.length > this.diagCap) this.diagFlame.splice(0, this.diagFlame.length - this.diagCap)
  }

  private trimDiag(arr: number[]) {
    if (arr.length > this.diagCap) arr.splice(0, arr.length - this.diagCap)
  }

  getRng(): SeededRandom {
    return this.rng
  }

  resetMetrics() {
    this.metrics = metricsSeed()
  }

  setPaused(p: boolean) {
    this.paused = p
  }

  isPaused(): boolean {
    return this.paused
  }

  clearQueue() {
    this.queue.clear()
  }

  clearDebug() {
    this.debugLog = []
  }

  private push(entry: RuntimeDebugEntry) {
    this.debugLog.push(entry)
    if (entry.kind === "warning" || entry.kind === "load_warning" || entry.kind === "depth_blocked") {
      this.metrics.warningsGenerated++
    }
    const max = RUNTIME_LIMITS.MAX_DEBUG_ENTRIES
    if (this.debugLog.length > max) this.debugLog.splice(0, this.debugLog.length - max)
  }

  private pruneDedupe(now: number) {
    const win = RUNTIME_LIMITS.EVENT_DEDUPE_MS
    for (const [k, t] of this.dedupeRecent) {
      if (now - t > win) this.dedupeRecent.delete(k)
    }
  }

  private tryEnqueue(item: QueuedRuntimeEvent): boolean {
    const maxDepth = this.sandbox.maxChainDepth
    if (item.chainDepth > maxDepth) {
      const at = this.time.toIsoString()
      this.push({
        kind: "depth_blocked",
        at,
        event: item.event,
        chainDepth: item.chainDepth,
        detail: `Max chain depth ${maxDepth} exceeded`
      })
      return false
    }
    if (item.chainDepth > 0 && item.rootDispatchSeq > 0) {
      const n = (this.followUpsPerRoot.get(item.rootDispatchSeq) ?? 0) + 1
      if (n > this.sandbox.maxFollowUpsPerRoot) {
        const at = this.time.toIsoString()
        this.push({
          kind: "warning",
          at,
          text: `Sandbox: max follow-ups per root (${this.sandbox.maxFollowUpsPerRoot}) exceeded for root seq ${item.rootDispatchSeq}`
        })
        return false
      }
      this.followUpsPerRoot.set(item.rootDispatchSeq, n)
    }
    if (this.queue.length >= this.sandbox.maxQueueLength) {
      const at = this.time.toIsoString()
      this.push({
        kind: "warning",
        at,
        text: `Sandbox: max queue length (${this.sandbox.maxQueueLength}) reached; drop enqueue`
      })
      return false
    }
    if (item.chainDepth > 0) {
      if (this.emitsThisFlush + 1 > this.sandbox.maxEmitsPerRootDispatch) {
        const at = this.time.toIsoString()
        this.push({
          kind: "warning",
          at,
          text: `Sandbox: max emits per flush (${this.sandbox.maxEmitsPerRootDispatch}) exceeded`
        })
        return false
      }
    }
    const now = this.time.nowMs()
    if (item.chainDepth === 0 && this.timeMode === "wall") {
      this.pruneDedupe(now)
      const key = eventDedupeKey(item.event)
      const last = this.dedupeRecent.get(key)
      if (last !== undefined && now - last < RUNTIME_LIMITS.EVENT_DEDUPE_MS) {
        this.metrics.dedupeSkips++
        this.push({
          kind: "dedupe_skip",
          at: this.time.toIsoString(),
          event: item.event,
          detail: `Duplicate root event within ${RUNTIME_LIMITS.EVENT_DEDUPE_MS}ms (${key})`
        })
        return false
      }
      this.dedupeRecent.set(key, now)
    }
    this.queue.enqueue(item)
    if (item.chainDepth > 0) this.emitsThisFlush++
    const len = this.queue.length
    this.metrics.queueDepthSum += len
    this.metrics.queueDepthSamples++
    this.metrics.maxQueueDepthObserved = Math.max(this.metrics.maxQueueDepthObserved, len)
    this.metrics.maxChainDepthReached = Math.max(this.metrics.maxChainDepthReached, item.chainDepth)
    this.push({
      kind: "queue_enqueue",
      at: this.time.toIsoString(),
      eventType: item.event.type,
      chainDepth: item.chainDepth,
      queueLengthAfter: len
    })
    return true
  }

  async bootstrap(
    params: {
      systemId: string
      list: ArmyList
      assignments: Assignment[]
      rules?: EventRule[]
      rngSeed?: string | number
      timeMode?: "wall" | "logical"
      strictValidation?: boolean
      packageManifests?: unknown[]
      timeProvider?: TimeProvider
      enableEventLedger?: boolean
      eventLedgerMax?: number
    }
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    this.systemId = params.systemId
    this.metrics = metricsSeed()
    this.queue.clear()
    this.dedupeRecent.clear()
    this.followUpsPerRoot.clear()
    this.logicalClock = 0
    this.rootDispatchCounter = 0
    this.timeMode = params.timeMode ?? "wall"
    this.strictValidation = params.strictValidation ?? false
    this.time = params.timeProvider ?? createWallTimeProvider()
    this.rng = new SeededRandom(params.rngSeed ?? "default")
    this.sandbox = mergeSandboxConfig(
      (params.packageManifests ?? []).map((m) =>
        typeof m === "object" && m !== null ? (m as { capabilities?: PackageCapabilities }) : null
      )
    )
    this.diagQueueDepth = []
    this.diagChainDepth = []
    this.diagDispatchMs = []
    this.diagFlame = []
    if (params.enableEventLedger) {
      this.eventLedger = new EventLedger(params.eventLedgerMax ?? 50_000)
      this.ledgerEnabled = true
    } else {
      this.ledgerEnabled = false
    }
    this.traceGraph?.clear()
    const tr = await this.translations.loadForSystem(params.systemId)
    if (!tr.ok) {
      this.translations.clear()
    }
    const at = this.time.toIsoString()
    if (params.rules !== undefined) {
      this.rules = [...params.rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    } else {
      const er = await loadEventRulesFromIndex()
      if (!er.ok) return er
      this.rules = er.rules
      for (const w of er.loadWarnings) {
        this.push({ kind: "load_warning", at, text: w })
      }
    }
    const sb = enforceRuleCount(this.rules.length, this.sandbox.maxRuleCount)
    if (!sb.ok) return { ok: false, error: sb.error }
    if (this.strictValidation) {
      const vr = validateRuleset(this.rules, "bootstrap")
      if (!vr.ok) return { ok: false, error: vr.errors[0] ?? "strict validation failed" }
    }
    const records = buildRuntimeEntitiesFromList(params.list)
    this.stateStore.resetFromRecords(records)
    this.ruleIndex = compileRules(this.rules)
    return { ok: true }
  }

  resetEntities(list: ArmyList) {
    this.queue.clear()
    this.stateStore.resetFromRecords(buildRuntimeEntitiesFromList(list))
  }

  private assignmentMap(assignments: readonly Assignment[]): Map<string, Assignment> {
    const m = new Map<string, Assignment>()
    for (const a of assignments) m.set(a.entityId, a)
    return m
  }

  dispatch(event: RuntimeEvent, assignments: readonly Assignment[]): DispatchResult {
    if (this.paused) {
      const at = this.time.toIsoString()
      this.push({ kind: "warning", at, text: "Runtime is paused; event not queued." })
      return emptyDispatch()
    }
    const rootPanelId = extractPrimaryEntityId(event)
    this.rootDispatchCounter++
    const seq = this.rootDispatchCounter
    const lc = ++this.logicalClock
    const now = this.time.nowMs()
    const root: QueuedRuntimeEvent = {
      event,
      assignments,
      chain: null,
      chainDepth: 0,
      enqueuedAt: now,
      logicalEnqueuedAt: lc,
      rootDispatchSeq: seq
    }
    if (!this.tryEnqueue(root)) {
      return { ...emptyDispatch(), rootEntityIdForPanel: rootPanelId }
    }
    const r = this.flushQueue(rootPanelId)
    if (this.replayRecorder && this.recordingEnabled) {
      const integ = this.getSnapshotIntegrity()
      this.replayRecorder.recordFrame({
        rootDispatchSeq: seq,
        event,
        assignments,
        rng: this.rng,
        entities: this.stateStore.getAll(),
        metrics: this.getMetrics(),
        queueDepth: this.queue.length,
        integrity: {
          entityCanonicalHashAfter: integ.entityCanonicalHash,
          queueStateHashAfter: integ.queueHash,
          canonicalStateHashAfter: integ.fullStateHash
        }
      })
    }
    return r
  }

  /** Drain queue (e.g. after stress enqueue batch). */
  flushQueue(rootEntityIdForPanel: string | null = null): DispatchResult {
    if (this.paused) return emptyDispatch()
    if (this.flushing) return { ...emptyDispatch(), rootEntityIdForPanel }
    this.flushing = true
    this.emitsThisFlush = 0
    const acc: DispatchResult = {
      messages: [],
      warnings: [],
      openEntityPanel: false,
      rootEntityIdForPanel
    }
    let steps = 0
    try {
      while (this.queue.length > 0) {
        if (this.paused) break
        if (steps >= RUNTIME_LIMITS.MAX_QUEUE_STEPS) {
          const at = this.time.toIsoString()
          this.push({
            kind: "warning",
            at,
            text: `Queue step budget ${RUNTIME_LIMITS.MAX_QUEUE_STEPS} exceeded; clearing queue.`
          })
          this.queue.clear()
          break
        }
        steps++
        const item = this.queue.dequeue()
        if (!item) break
        const waitMs = this.time.nowMs() - item.enqueuedAt
        this.push({
          kind: "queue_dequeue",
          at: this.time.toIsoString(),
          eventType: item.event.type,
          chainDepth: item.chainDepth,
          queueLengthAfter: this.queue.length,
          waitMs
        })
        this.pushDiagSample(this.queue.length, item.chainDepth)
        const one = this.processQueuedEvent(item)
        acc.messages.push(...one.messages)
        acc.warnings.push(...one.warnings)
        acc.openEntityPanel = acc.openEntityPanel || one.openEntityPanel
        this.metrics.eventsProcessed++
      }
    } finally {
      this.flushing = false
    }
    return acc
  }

  private processQueuedEvent(item: QueuedRuntimeEvent): DispatchResult {
    const t0 = this.time.nowMs()
    const clockMs = this.time.nowMs()
    const beforeInt = this.getSnapshotIntegrity()
    const { event, assignments, chain: incomingChain, chainDepth } = item
    const at = this.time.toIsoString(clockMs)
    this.push({ kind: "event_in", at, event })

    const primaryEntityId = extractPrimaryEntityId(event)

    const chainFrame =
      incomingChain ??
      createChainFrame({
        rootEvent: event,
        primaryEntityId,
        effectSubjectId:
          typeof event.payload.effectTargetEntityId === "string" && event.payload.effectTargetEntityId.trim().length > 0
            ? event.payload.effectTargetEntityId.trim()
            : primaryEntityId,
        rootDispatchSeq: item.rootDispatchSeq
      })

    const trigEnt = chainFrame.rootPrimaryEntityId ? this.stateStore.getEntity(chainFrame.rootPrimaryEntityId) : undefined
    const triggeringPlayerId =
      typeof event.payload.playerId === "string" && event.payload.playerId.trim().length > 0
        ? event.payload.playerId.trim()
        : trigEnt?.states.owner ?? "player1"

    const execution: RuntimeExecutionContext = {
      timestamp: at,
      triggeringEntityId: chainFrame.rootPrimaryEntityId,
      triggeringPlayerId,
      sourceEvent: chainFrame.rootEvent,
      payload: event.payload
    }

    this.push({
      kind: "execution",
      at,
      depth: chainDepth,
      rootEventType: chainFrame.rootEvent.type,
      rootPrimaryEntityId: chainFrame.rootPrimaryEntityId,
      effectSubjectId: chainFrame.effectSubjectId,
      triggeringPlayerId,
      currentEventType: event.type,
      currentPayload: { ...event.payload }
    })

    this.eventBus.emit(event)

    const ctxBase: EvaluationContext = {
      event,
      execution,
      chain: chainFrame,
      stateStore: this.stateStore,
      primaryEntityId,
      assignments: this.assignmentMap(assignments),
      rng: this.rng
    }

    const messages: string[] = []
    const warnings: string[] = []
    let openEntityPanel = false

    let traceEventId = ""
    if (this.tracingEnabled) {
      if (!this.traceGraph) this.traceGraph = new TraceGraph()
      traceEventId = this.traceGraph.beginEvent({
        parentId: null,
        eventType: event.type,
        chainDepth,
        queueDepth: this.queue.length,
        payload: event.payload
      })
    }

    const applicable = this.ruleIndex.rulesForTrigger(event.type, this.systemId)
    this.metrics.ruleCandidatesEvaluated += applicable.length

    let rulesPassed = 0
    const matchedRuleIds: string[] = []
    let spawnThisStep = 0
    for (const rule of applicable) {
      this.metrics.conditionEvaluations += rule.conditions.length
      const cond = evaluateAllConditions(ctxBase, rule.conditions)
      const atRule = this.time.toIsoString()
      if (!cond.ok) {
        if (this.traceGraph && traceEventId) {
          const rn = this.traceGraph.addRuleNode(traceEventId, rule.id, chainDepth, this.queue.length, false)
          this.traceGraph.addConditionNodes(rn, cond.details, chainDepth, this.queue.length)
        }
        this.push({
          kind: "rule_skip",
          at: atRule,
          ruleId: rule.id,
          conditionDetails: cond.details
        })
        continue
      }
      rulesPassed++
      matchedRuleIds.push(rule.id)
      this.push({
        kind: "rule",
        at: atRule,
        ruleId: rule.id,
        conditionDetails: cond.details
      })

      let ruleTraceId = ""
      if (this.traceGraph && traceEventId) {
        ruleTraceId = this.traceGraph.addRuleNode(traceEventId, rule.id, chainDepth, this.queue.length, true)
        this.traceGraph.addConditionNodes(ruleTraceId, cond.details, chainDepth, this.queue.length)
      }

      const act = executeActions(ctxBase, rule.actions, rule.id, clockMs)
      spawnThisStep += act.stateMutations.filter((m) => m.sourceAction === "upsert_entity").length
      if (spawnThisStep > this.sandbox.maxSpawnedEntitiesPerTick) {
        this.push({
          kind: "warning",
          at: this.time.toIsoString(),
          text: `Sandbox: max spawned entities per tick (${this.sandbox.maxSpawnedEntitiesPerTick}) exceeded; halting further rules for this event`
        })
        warnings.push("Spawn budget exceeded for this event step")
        break
      }
      this.metrics.actionsExecuted += rule.actions.length

      for (let i = 0; i < rule.actions.length; i++) {
        if (this.traceGraph && ruleTraceId) {
          this.traceGraph.addActionNode(ruleTraceId, rule.actions[i]!.type, chainDepth, this.queue.length)
        }
        this.push({
          kind: "action",
          at: this.time.toIsoString(),
          ruleId: rule.id,
          action: rule.actions[i]!,
          detail: act.actionNotes[i] ?? ""
        })
      }

      for (const m of act.stateMutations) {
        this.push(this.mutationToDebugEntry(m))
        this.metrics.mutationsApplied++
      }

      messages.push(...act.messages)
      warnings.push(...act.warnings)
      openEntityPanel = openEntityPanel || act.openEntityPanel

      for (const ev of act.followUpEvents) {
        this.push({ kind: "follow_up", at: this.time.toIsoString(), event: ev, fromDepth: chainDepth })
        const enq = this.tryEnqueue({
          event: ev,
          assignments,
          chain: chainFrame,
          chainDepth: chainDepth + 1,
          enqueuedAt: this.time.nowMs(),
          logicalEnqueuedAt: ++this.logicalClock,
          rootDispatchSeq: chainFrame.rootDispatchSeq
        })
        if (enq) this.metrics.followUpsEnqueued++
      }
    }

    if (this.traceGraph && traceEventId) {
      this.traceGraph.closeEvent(traceEventId)
    }

    this.metrics.rulesPassedAllConditions += rulesPassed
    const wallMs = this.time.nowMs() - t0
    this.metrics.dispatchWallMsSum += wallMs
    this.metrics.dispatchWallSamples++
    this.pushDiagDuration(wallMs, chainDepth)
    this.push({
      kind: "dispatch_complete",
      at: this.time.toIsoString(),
      eventType: event.type,
      chainDepth,
      durationMs: wallMs,
      rulesMatched: rulesPassed
    })

    if (this.eventLedger && this.ledgerEnabled) {
      const afterInt = this.getSnapshotIntegrity()
      this.eventLedger.append({
        eventType: event.type,
        rootEventId: `${chainFrame.rootDispatchSeq}:${chainFrame.rootEvent.type}`,
        chainDepth,
        queueDepth: this.queue.length,
        sourceRuleId: matchedRuleIds.length ? matchedRuleIds.join("|") : null,
        sourceActionId: null,
        rngStateHash: hashRngState(this.rng.getState()),
        stateHashBefore: beforeInt.fullStateHash,
        stateHashAfter: afterInt.fullStateHash,
        timestamp: clockMs
      })
    }

    if (this.time instanceof DeterministicTimeProvider) {
      this.time.advance(1)
    }

    return { messages, warnings, openEntityPanel, rootEntityIdForPanel: null }
  }

  private mutationToDebugEntry(m: StateMutationDebug): RuntimeDebugEntry {
    return {
      kind: "state_mutation",
      at: this.time.toIsoString(m.timestampMs),
      entityId: m.entityId,
      key: m.key,
      before: this.snapshotForLog(m.before),
      after: this.snapshotForLog(m.after),
      ruleId: m.ruleId,
      sourceAction: m.sourceAction,
      timestampMs: m.timestampMs
    }
  }

  private snapshotForLog(v: unknown): unknown {
    if (Array.isArray(v)) return [...v]
    if (v && typeof v === "object") return JSON.parse(JSON.stringify(v))
    return v
  }

  getRulesFingerprint(): string {
    return fingerprintRuleset(this.rules)
  }

  getEntitiesDigest(): string {
    return digestEntitySnapshot(this.stateStore.getAll())
  }

  exportRngState(): SeededRandomState {
    return this.rng.getState()
  }

  importRngState(s: SeededRandomState) {
    this.rng.setState(s)
  }

  attachReplayRecorder(rec: ReplayRecorder | null) {
    this.replayRecorder = rec
  }

  setRecordingEnabled(on: boolean) {
    this.recordingEnabled = on
  }

  isRecordingEnabled(): boolean {
    return this.recordingEnabled
  }

  setTracingEnabled(on: boolean) {
    this.tracingEnabled = on
    if (on && !this.traceGraph) this.traceGraph = new TraceGraph()
  }

  isTracingEnabled(): boolean {
    return this.tracingEnabled
  }

  getTraceGraphJson(): unknown {
    return this.traceGraph ? this.traceGraph.toJSON() : null
  }

  getTraceGraphViz(): unknown {
    return this.traceGraph ? this.traceGraph.toVizNodesLinks() : null
  }

  exportRuntimeSnapshot(params?: {
    assignments?: Assignment[]
    packageMetadata?: unknown
    simulationMeta?: Record<string, unknown>
  }): RuntimeSnapshotV1 {
    return {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      capturedAt: this.time.toIsoString(),
      systemId: this.systemId,
      timeMode: this.timeMode,
      logicalClock: this.logicalClock,
      rootDispatchCounter: this.rootDispatchCounter,
      entities: this.stateStore.getAll(),
      queue: this.queue.snapshot(),
      dedupeRecent: [...this.dedupeRecent.entries()],
      metrics: this.getMetrics(),
      rng: this.rng.getState(),
      ruleIds: this.rules.map((r) => r.id),
      assignments: params?.assignments ? params.assignments.map((a) => ({ ...a })) : [],
      integrityHashes: this.getSnapshotIntegrity(),
      packageMetadata: params?.packageMetadata,
      simulationMeta: params?.simulationMeta
    }
  }

  importRuntimeSnapshot(snap: RuntimeSnapshotV1) {
    if (snap.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) throw new Error("importRuntimeSnapshot: bad schema")
    this.systemId = snap.systemId
    this.timeMode = snap.timeMode
    this.logicalClock = snap.logicalClock
    this.rootDispatchCounter = snap.rootDispatchCounter
    this.metrics = { ...snap.metrics }
    this.rng.setState(snap.rng)
    this.dedupeRecent = new Map(snap.dedupeRecent)
    this.followUpsPerRoot.clear()
    this.stateStore.resetFromRecords(snap.entities.map((e) => JSON.parse(JSON.stringify(e)) as RuntimeEntityRecord))
    this.queue.restoreSnapshot(snap.queue)
    this.ruleIndex = compileRules(this.rules)
    const curIds = this.rules.map((r) => r.id).join(",")
    const snapIds = snap.ruleIds.join(",")
    if (snapIds && curIds !== snapIds) {
      this.push({
        kind: "load_warning",
        at: this.time.toIsoString(),
        text: "importRuntimeSnapshot: rule id list differs from current engine rules; behavior may diverge from capture time"
      })
    }
  }

  /** Synthetic stress: recursive A→B→C→A (stops at max depth). */
  stressRecursiveLoop(assignments: readonly Assignment[]) {
    return this.dispatch({ type: "runtime.stress_loop_a", payload: { stress: "recursive" } }, assignments)
  }

  /** Many NFC scans with unique payload keys (dedupe-safe). */
  stressNfcSpam(assignments: readonly Assignment[], entityId: string, count: number): DispatchResult {
    if (this.paused) return emptyDispatch()
    const t = this.time.nowMs()
    for (let i = 0; i < count; i++) {
      this.tryEnqueue({
        event: {
          type: "nfc.scan",
          payload: { entityId, tagUid: `stress-${t}-${i}`, listId: "stress", effectTargetEntityId: entityId, playerId: "player1" }
        },
        assignments,
        chain: null,
        chainDepth: 0,
        enqueuedAt: this.time.nowMs(),
        logicalEnqueuedAt: ++this.logicalClock,
        rootDispatchSeq: -1
      })
    }
    return this.flushQueue(entityId)
  }

  /** Simulate door NFC scan (uses JSON door → room → trap chain when list contains crypt-door-01). */
  stressDoorScan(assignments: readonly Assignment[]): DispatchResult {
    return this.dispatch(
      {
        type: "nfc.scan",
        payload: {
          entityId: "crypt-door-01",
          tagUid: `stress-door-${this.time.nowMs()}`,
          listId: "stress",
          effectTargetEntityId: "crypt-door-01",
          playerId: "player1"
        }
      },
      assignments
    )
  }

  /** Flood queue with low-depth events (dedupe varies payload). */
  stressQueueFlood(assignments: readonly Assignment[], count: number): DispatchResult {
    if (this.paused) return emptyDispatch()
    const t = this.time.nowMs()
    for (let i = 0; i < count; i++) {
      this.tryEnqueue({
        event: { type: "turn.end", payload: { stress: `flood-${t}-${i}` } },
        assignments,
        chain: null,
        chainDepth: 0,
        enqueuedAt: this.time.nowMs(),
        logicalEnqueuedAt: ++this.logicalClock,
        rootDispatchSeq: -1
      })
    }
    return this.flushQueue(null)
  }

  /**
   * Apply canonical mutations across many entities (stress StateStore + mutations log).
   * Does not use JSON rules.
   */
  stressBulkMutations(entityIds: readonly string[]): DispatchResult {
    const messages: string[] = []
    const warnings: string[] = []
    for (const id of entityIds) {
      const ent = this.stateStore.getEntity(id)
      if (!ent) {
        warnings.push(`Unknown entity ${id}`)
        continue
      }
      const before = ent.states.health
      const res = this.stateStore.incrementField(id, "health", 0)
      if (!res.ok) warnings.push(res.error)
      else {
        const after = this.stateStore.getEntity(id)?.states.health
        const timestampMs = this.time.nowMs()
        this.push({
          kind: "state_mutation",
          at: this.time.toIsoString(timestampMs),
          entityId: id,
          key: "health",
          before,
          after,
          ruleId: "(stress)",
          sourceAction: "noop_touch",
          timestampMs
        })
        this.metrics.mutationsApplied++
      }
    }
    this.metrics.warningsGenerated += warnings.length
    return { messages, warnings, openEntityPanel: false, rootEntityIdForPanel: null }
  }
}

let engineSingleton: RuntimeEngine | null = null

export function getRuntimeEngine(): RuntimeEngine {
  if (!engineSingleton) engineSingleton = new RuntimeEngine()
  return engineSingleton
}

/** Fresh engine instance for deterministic replay / tests (does not replace singleton). */
export function createIsolatedRuntimeEngine(): RuntimeEngine {
  return new RuntimeEngine()
}
