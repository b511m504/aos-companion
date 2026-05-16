import { create } from "zustand"
import type { Assignment } from "@/models/types"
import type { ArmyList } from "@/models/types"
import type { RuntimeDebugEntry, RuntimeEntityRecord, RuntimeEvent, RuntimeStressMetrics } from "@/models/runtimeTypes"
import { getRuntimeEngine } from "@/runtime/RuntimeEngine"
import type { TimeProvider } from "@/runtime/time/TimeProvider"
import { applyReplayBundleSnapshot } from "@/runtime/replay/replayBundle"
import type { ReplayBundleV1 } from "@/runtime/replay/replayBundle"

export type RuntimeSessionState = {
  bootstrappedForListId: string | null
  bootstrappedSystemId: string | null
  entityRows: RuntimeEntityRecord[]
  debugLog: RuntimeDebugEntry[]
  lastToast: string | null
  lastWarnings: string[]
  runtimeEnabled: boolean
  runtimePaused: boolean
  /** When on, runtime warnings are appended to the toast line (dev noise). */
  runtimeDevToastWarnings: boolean
  runtimeMetrics: RuntimeStressMetrics
  logFilter: string
  /** Injected from App to avoid store cycles. */
  selectEntity: ((entityId: string | null) => void) | null
}

type RuntimeSessionActions = {
  setRuntimeEnabled(on: boolean): void
  setRuntimePaused(on: boolean): void
  setRuntimeDevToastWarnings(on: boolean): void
  setLogFilter(q: string): void
  registerUiBridge(params: { selectEntity: (entityId: string | null) => void }): void
  bootstrapRuntimeIfNeeded(params: {
    systemId: string
    list: ArmyList
    assignments: Assignment[]
    rngSeed?: string | number
    timeMode?: "wall" | "logical"
    strictValidation?: boolean
    packageManifests?: unknown[]
    timeProvider?: TimeProvider
    enableEventLedger?: boolean
    eventLedgerMax?: number
  }): Promise<void>
  dispatchRuntimeEvent(event: RuntimeEvent, assignments: Assignment[]): void
  clearRuntimeDebug(): void
  refreshEntityRows(): void
  translateLabel(canonicalKey: string): string
  clearRuntimeToast(): void
  restoreReplayBundleSnapshot(bundle: ReplayBundleV1): void
  stressRecursive(assignments: Assignment[]): void
  stressNfcSpam(assignments: Assignment[], entityId: string, count: number): void
  stressDoorScan(assignments: Assignment[]): void
  stressQueueFlood(assignments: Assignment[], count: number): void
  stressBulkMutations(entityIds: string[]): void
  resetRuntimeMetrics(): void
}

let stateSubOff: (() => void) | null = null

function attachStateSubscription() {
  if (stateSubOff) return
  const eng = getRuntimeEngine()
  stateSubOff = eng.stateStore.subscribe(() => {
    useRuntimeSession.getState().refreshEntityRows()
  })
}

function mergeDispatchUi(
  set: (partial: Partial<RuntimeSessionState>) => void,
  get: () => RuntimeSessionState & RuntimeSessionActions,
  r: { messages: string[]; warnings: string[]; openEntityPanel: boolean; rootEntityIdForPanel: string | null },
  rootEvent: RuntimeEvent
) {
  const eng = getRuntimeEngine()
  const messages = [...r.messages]
  if (get().runtimeDevToastWarnings && r.warnings.length) {
    messages.push(...r.warnings.map((w) => `⚠ ${w}`))
  }
  set({
    debugLog: eng.getDebugLog(),
    lastWarnings: r.warnings,
    lastToast: messages.length ? messages.join(" · ") : null,
    entityRows: eng.stateStore.getAll(),
    runtimeMetrics: eng.getMetrics()
  })
  if (r.openEntityPanel) {
    const id =
      r.rootEntityIdForPanel ??
      (typeof rootEvent.payload.entityId === "string" ? (rootEvent.payload.entityId as string) : null)
    const fn = get().selectEntity
    if (id && fn) fn(id)
  }
}

export const useRuntimeSession = create<RuntimeSessionState & RuntimeSessionActions>((set, get) => ({
  bootstrappedForListId: null,
  bootstrappedSystemId: null,
  entityRows: [],
  debugLog: [],
  lastToast: null,
  lastWarnings: [],
  runtimeEnabled: true,
  runtimePaused: false,
  runtimeDevToastWarnings: false,
  runtimeMetrics: getRuntimeEngine().getMetrics(),
  logFilter: "",
  selectEntity: null,

  registerUiBridge(params: { selectEntity: (entityId: string | null) => void }) {
    set({ selectEntity: params.selectEntity })
  },

  setRuntimeEnabled(on: boolean) {
    set({ runtimeEnabled: on })
  },

  setRuntimePaused(on: boolean) {
    getRuntimeEngine().setPaused(on)
    set({ runtimePaused: on })
  },

  setRuntimeDevToastWarnings(on: boolean) {
    set({ runtimeDevToastWarnings: on })
  },

  setLogFilter(q: string) {
    set({ logFilter: q })
  },

  clearRuntimeDebug() {
    getRuntimeEngine().clearDebug()
    set({ debugLog: [] })
  },

  resetRuntimeMetrics() {
    getRuntimeEngine().resetMetrics()
    set({ runtimeMetrics: getRuntimeEngine().getMetrics() })
  },

  refreshEntityRows() {
    set({ entityRows: getRuntimeEngine().stateStore.getAll() })
  },

  translateLabel(canonicalKey: string): string {
    return getRuntimeEngine().translations.label(canonicalKey)
  },

  clearRuntimeToast() {
    set({ lastToast: null })
  },

  restoreReplayBundleSnapshot(bundle: ReplayBundleV1) {
    applyReplayBundleSnapshot(bundle)
    const eng = getRuntimeEngine()
    set({
      bootstrappedForListId: null,
      bootstrappedSystemId: null,
      debugLog: eng.getDebugLog(),
      entityRows: eng.stateStore.getAll(),
      runtimeMetrics: eng.getMetrics(),
      lastWarnings: []
    })
  },

  async bootstrapRuntimeIfNeeded(params: {
    systemId: string
    list: ArmyList
    assignments: Assignment[]
    rngSeed?: string | number
    timeMode?: "wall" | "logical"
    strictValidation?: boolean
    packageManifests?: unknown[]
    timeProvider?: TimeProvider
    enableEventLedger?: boolean
    eventLedgerMax?: number
  }) {
    if (!get().runtimeEnabled) return
    const key = `${params.systemId}:${params.list.id}`
    const cur = `${get().bootstrappedSystemId}:${get().bootstrappedForListId}`
    const eng = getRuntimeEngine()
    if (cur === key) {
      eng.resetEntities(params.list)
      set({ entityRows: eng.stateStore.getAll(), runtimeMetrics: eng.getMetrics() })
      return
    }
    const res = await eng.bootstrap({
      systemId: params.systemId,
      list: params.list,
      assignments: params.assignments,
      rngSeed: params.rngSeed,
      timeMode: params.timeMode,
      strictValidation: params.strictValidation,
      packageManifests: params.packageManifests,
      timeProvider: params.timeProvider,
      enableEventLedger: params.enableEventLedger,
      eventLedgerMax: params.eventLedgerMax
    })
    if (!res.ok) {
      set({ lastWarnings: [res.error], lastToast: null })
      return
    }
    attachStateSubscription()
    set({
      bootstrappedForListId: params.list.id,
      bootstrappedSystemId: params.systemId,
      entityRows: eng.stateStore.getAll(),
      debugLog: eng.getDebugLog(),
      lastWarnings: [],
      runtimeMetrics: eng.getMetrics()
    })
  },

  dispatchRuntimeEvent(event: RuntimeEvent, assignments: Assignment[]) {
    if (!get().runtimeEnabled) return
    if (get().runtimePaused) {
      set({ lastWarnings: ["Runtime is paused."], lastToast: "Runtime is paused." })
      return
    }
    const eng = getRuntimeEngine()
    const r = eng.dispatch(event, assignments)
    mergeDispatchUi(set, get, r, event)
  },

  stressRecursive(assignments: Assignment[]) {
    if (!get().runtimeEnabled || get().runtimePaused) return
    const eng = getRuntimeEngine()
    const r = eng.stressRecursiveLoop(assignments)
    mergeDispatchUi(set, get, r, { type: "runtime.stress_loop_a", payload: {} })
  },

  stressNfcSpam(assignments: Assignment[], entityId: string, count: number) {
    if (!get().runtimeEnabled || get().runtimePaused) return
    const eng = getRuntimeEngine()
    const r = eng.stressNfcSpam(assignments, entityId, count)
    mergeDispatchUi(set, get, r, { type: "nfc.scan", payload: { entityId } })
  },

  stressDoorScan(assignments: Assignment[]) {
    if (!get().runtimeEnabled || get().runtimePaused) return
    const eng = getRuntimeEngine()
    const r = eng.stressDoorScan(assignments)
    mergeDispatchUi(set, get, r, { type: "nfc.scan", payload: { entityId: "crypt-door-01" } })
  },

  stressQueueFlood(assignments: Assignment[], count: number) {
    if (!get().runtimeEnabled || get().runtimePaused) return
    const eng = getRuntimeEngine()
    const r = eng.stressQueueFlood(assignments, count)
    mergeDispatchUi(set, get, r, { type: "turn.end", payload: {} })
  },

  stressBulkMutations(entityIds: string[]) {
    if (!get().runtimeEnabled || get().runtimePaused) return
    const eng = getRuntimeEngine()
    const r = eng.stressBulkMutations(entityIds)
    mergeDispatchUi(set, get, r, { type: "turn.end", payload: { stress: "bulk" } })
  }
}))
