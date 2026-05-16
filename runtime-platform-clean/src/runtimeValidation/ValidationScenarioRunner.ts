import type { RuntimeEvent } from "@/models/runtimeTypes"
import { getNfcManager } from "@/services/NFCManager"
import { useAppStore } from "@/store/useAppStore"
import { useRuntimeSession } from "@/store/useRuntimeSession"
import { LifecycleChaosRunner } from "@/runtimeValidation/LifecycleChaosRunner"
import { checkAllRuntimeInvariants } from "@/runtimeValidation/RuntimeInvariantChecker"
import type { RuntimeReplayRecorder } from "@/runtimeValidation/RuntimeReplayRecorder"
import { buildSyntheticCanonicalTagPayload, injectSyntheticNfcEvent } from "@/runtimeValidation/syntheticNfc"
import type { ScenarioResult } from "@/runtimeValidation/types"

export class ValidationScenarioRunner {
  constructor(private readonly journal: RuntimeReplayRecorder) {}

  async run(id: string, signal?: AbortSignal): Promise<ScenarioResult> {
    const t0 = performance.now()
    this.journal.record("scenario.start", id)
    try {
      if (signal?.aborted) throw new Error("aborted")
      const mgr = getNfcManager()
      if (!mgr.isSessionActive()) await mgr.startListening()

      if (id === "rapid_scan_spam") {
        for (let i = 0; i < 80; i++) {
          if (signal?.aborted) throw new Error("aborted")
          const b = (i % 256).toString(16).padStart(2, "0").toUpperCase()
          injectSyntheticNfcEvent(
            buildSyntheticCanonicalTagPayload({ uid: `04:${b}:AA:BB:CC:DD:EE` })
          )
          if (i % 10 === 0) await new Promise((r) => setTimeout(r, 0))
        }
      } else if (id === "sequential_scans_500") {
        for (let i = 0; i < 500; i++) {
          if (signal?.aborted) throw new Error("aborted")
          const p = (n: number) => (n & 0xff).toString(16).padStart(2, "0").toUpperCase()
          injectSyntheticNfcEvent(
            buildSyntheticCanonicalTagPayload({
              uid: `04:${p(i)}:${p(i >> 8)}:${p(i >> 16)}:AA:BB:CC`
            })
          )
        }
      } else if (id === "pause_during_dispatch") {
        useRuntimeSession.getState().setRuntimePaused(true)
        await new Promise((r) => setTimeout(r, 20))
        const ev: RuntimeEvent = { type: "turn.end", payload: {} }
        useRuntimeSession.getState().dispatchRuntimeEvent(ev, useAppStore.getState().assignments)
        useRuntimeSession.getState().setRuntimePaused(false)
      } else if (id === "duplicate_uid_storm") {
        const uid = "04:DE:AD:BE:EF:00:01"
        for (let i = 0; i < 120; i++) {
          if (signal?.aborted) throw new Error("aborted")
          injectSyntheticNfcEvent(buildSyntheticCanonicalTagPayload({ uid }))
        }
      } else if (id === "chaos_visibility_burst") {
        const c = new LifecycleChaosRunner()
        await c.fireVisibilityToggleBurst(20, 5)
      } else if (id === "runtime_stress_queue_flood") {
        useRuntimeSession.getState().stressQueueFlood(useAppStore.getState().assignments, 400)
      } else if (id === "nfc_runtime_spam_entity") {
        const rows = useRuntimeSession.getState().entityRows
        const first = rows[0]?.id ?? "entity-unknown"
        useRuntimeSession.getState().stressNfcSpam(useAppStore.getState().assignments, first, 200)
      } else {
        throw new Error(`Unknown scenario: ${id}`)
      }

      const fails = checkAllRuntimeInvariants()
      const dur = performance.now() - t0
      this.journal.record("scenario.end", id, { durationMs: dur, invariantCount: fails.length })
      return {
        id,
        status: fails.length ? "failed" : "passed",
        durationMs: dur,
        invariantFailures: fails,
        journalTail: this.journal.snapshot().slice(-40)
      }
    } catch (e) {
      const dur = performance.now() - t0
      const msg = e instanceof Error ? e.message : String(e)
      this.journal.record("scenario.end", `${id}_error`, { durationMs: dur, msg })
      return {
        id,
        status: "failed",
        durationMs: dur,
        invariantFailures: [],
        journalTail: this.journal.snapshot().slice(-40),
        error: msg
      }
    }
  }
}
