import type { HarnessJournalEntry } from "@/runtimeValidation/types"
import { injectSyntheticNfcEvent } from "@/runtimeValidation/syntheticNfc"
import { buildSyntheticCanonicalTagPayload } from "@/runtimeValidation/syntheticNfc"

export type ReplayPlayerOptions = {
  delayMsBetweenSteps?: number
  abortSignal?: AbortSignal
}

/**
 * Replays harness journal entries deterministically where possible.
 */
export class RuntimeReplayPlayer {
  async play(entries: HarnessJournalEntry[], opts: ReplayPlayerOptions = {}): Promise<void> {
    const delay = opts.delayMsBetweenSteps ?? 0
    for (const e of entries) {
      if (opts.abortSignal?.aborted) throw new Error("Replay aborted")
      if (e.kind === "nfc.synthetic" || e.kind === "nfc.window") {
        const d = e.detail
        if (d && typeof d === "object" && !Array.isArray(d)) {
          injectSyntheticNfcEvent(d as Record<string, unknown>)
        } else {
          const uid = typeof e.detail?.uid === "string" ? e.detail.uid : null
          if (uid) injectSyntheticNfcEvent(buildSyntheticCanonicalTagPayload({ uid }))
        }
      }
      if (delay > 0) await new Promise((r) => setTimeout(r, delay))
    }
  }
}
