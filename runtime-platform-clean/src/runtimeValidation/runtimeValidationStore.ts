import { create } from "zustand"
import { buildForensicReport, downloadRuntimeForensicReport } from "@/runtimeValidation/failureReport"
import { checkAllRuntimeInvariants } from "@/runtimeValidation/RuntimeInvariantChecker"
import type { RuntimeValidationScenarioId } from "@/runtimeValidation/scenarios/presets"
import { healClearNfcDedupe, healRestartNfcSession, healRuntimeUnpause } from "@/runtimeValidation/selfHealRuntime"
import { getRuntimeValidationEngine } from "@/runtimeValidation/RuntimeValidationEngine"
import type { ScenarioResult } from "@/runtimeValidation/types"

const MAX_LOG = 80

type State = {
  runningScenarioId: string | null
  lastResult: ScenarioResult | null
  lastInvariantSnapshot: ReturnType<typeof checkAllRuntimeInvariants>
  log: string[]
}

type Actions = {
  tickInvariants(): void
  runScenario(id: RuntimeValidationScenarioId): Promise<void>
  toggleContinuous(): void
  exportForensic(): void
  exportJournal(): void
  importJournalJson(text: string): void
  healDedupe(): Promise<void>
  healNfcRestart(): Promise<void>
  healUnpause(): void
  clearLog(): void
}

export const useRuntimeValidationStore = create<State & Actions>((set, get) => ({
  runningScenarioId: null,
  lastResult: null,
  lastInvariantSnapshot: [],
  log: [],

  clearLog() {
    set({ log: [] })
  },

  tickInvariants() {
    const v = checkAllRuntimeInvariants()
    set({ lastInvariantSnapshot: v })
    if (v.length) {
      set((s) => {
        const log = [...s.log, `[invariant] ${v.map((x) => x.id).join(", ")}`]
        while (log.length > MAX_LOG) log.shift()
        return { log }
      })
    }
  },

  async runScenario(id: RuntimeValidationScenarioId) {
    const eng = getRuntimeValidationEngine()
    set({ runningScenarioId: id, lastResult: null })
    set((s) => {
      const log = [...s.log, `scenario start: ${id}`]
      while (log.length > MAX_LOG) log.shift()
      return { log }
    })
    const ac = new AbortController()
    const res = await eng.scenarios.run(id, ac.signal)
    set({ runningScenarioId: null, lastResult: res })
    set((s) => {
      const log = [...s.log, `scenario end: ${id} status=${res.status} ms=${res.durationMs.toFixed(1)}`]
      while (log.length > MAX_LOG) log.shift()
      return { log }
    })
    if (res.error) {
      set((s) => {
        const log = [...s.log, `scenario error: ${res.error}`]
        while (log.length > MAX_LOG) log.shift()
        return { log }
      })
    }
    get().tickInvariants()
  },

  toggleContinuous() {
    const eng = getRuntimeValidationEngine()
    if (eng.isContinuousMode()) {
      eng.disableContinuousMode()
      set((s) => {
        const log = [...s.log, "continuous mode: off"]
        while (log.length > MAX_LOG) log.shift()
        return { log }
      })
    } else {
      eng.enableContinuousMode()
      set((s) => {
        const log = [...s.log, "continuous mode: on (2s health + longtask)"]
        while (log.length > MAX_LOG) log.shift()
        return { log }
      })
    }
  },

  exportForensic() {
    const eng = getRuntimeValidationEngine()
    const inv = checkAllRuntimeInvariants()
    const rep = buildForensicReport({
      screen: "runtime_validation",
      invariantFailures: inv,
      journal: eng.journal.snapshot(),
      healthTail: eng.getHealthTail(),
      perfMarks: eng.perf.snapshot()
    })
    downloadRuntimeForensicReport(rep)
    set((s) => {
      const log = [...s.log, "exported forensic JSON (download)"]
      while (log.length > MAX_LOG) log.shift()
      return { log }
    })
  },

  exportJournal() {
    const eng = getRuntimeValidationEngine()
    const blob = new Blob([eng.journal.exportJson()], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `runtime-harness-journal-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    set((s) => {
      const log = [...s.log, "exported harness journal"]
      while (log.length > MAX_LOG) log.shift()
      return { log }
    })
  },

  importJournalJson(text: string) {
    getRuntimeValidationEngine().journal.importJson(text)
    set((s) => {
      const log = [...s.log, "imported harness journal"]
      while (log.length > MAX_LOG) log.shift()
      return { log }
    })
  },

  async healDedupe() {
    await healClearNfcDedupe("runtime_validation_dashboard")
    set((s) => {
      const log = [...s.log, "heal: cleared NFC dedupe baseline"]
      while (log.length > MAX_LOG) log.shift()
      return { log }
    })
  },

  async healNfcRestart() {
    await healRestartNfcSession("runtime_validation_dashboard")
    set((s) => {
      const log = [...s.log, "heal: NFC session restarted"]
      while (log.length > MAX_LOG) log.shift()
      return { log }
    })
  },

  healUnpause() {
    healRuntimeUnpause("runtime_validation_dashboard")
    set((s) => {
      const log = [...s.log, "heal: runtime unpaused"]
      while (log.length > MAX_LOG) log.shift()
      return { log }
    })
  }
}))
