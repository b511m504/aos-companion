import type { HarnessJournalEntry } from "@/runtimeValidation/types"

const MAX = 2000

function rid(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Lightweight append-only journal for harness / replay (separate from runtime engine replay bundles).
 */
export class RuntimeReplayRecorder {
  private entries: HarnessJournalEntry[] = []

  record(
    kind: HarnessJournalEntry["kind"],
    label: string,
    detail?: Record<string, unknown>
  ): HarnessJournalEntry {
    const e: HarnessJournalEntry = {
      id: rid(),
      tWall: Date.now(),
      tPerf: performance.now(),
      kind,
      label,
      detail: detail ? { ...detail } : undefined
    }
    this.entries.push(e)
    if (this.entries.length > MAX) this.entries.splice(0, this.entries.length - MAX)
    return e
  }

  snapshot(): HarnessJournalEntry[] {
    return [...this.entries]
  }

  clear(): void {
    this.entries = []
  }

  exportJson(): string {
    return JSON.stringify({ schema: "runtime-harness-journal/v1", entries: this.entries }, null, 2)
  }

  importJson(text: string): void {
    const o = JSON.parse(text) as { entries?: HarnessJournalEntry[] }
    if (!o.entries || !Array.isArray(o.entries)) throw new Error("Invalid journal: missing entries[]")
    this.entries = o.entries.slice(-MAX)
  }
}
