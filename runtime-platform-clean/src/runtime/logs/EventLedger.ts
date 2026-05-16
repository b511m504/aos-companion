import type { RuntimeEventName } from "@/runtime/runtimeConstants"

export type EventLedgerEntry = {
  sequenceId: number
  eventType: RuntimeEventName | string
  rootEventId: string
  chainDepth: number
  queueDepth: number
  sourceRuleId: string | null
  sourceActionId: string | null
  rngStateHash: string
  stateHashBefore: string
  stateHashAfter: string
  timestamp: number
}

export type EventLedgerExport = {
  schemaVersion: 1
  entries: EventLedgerEntry[]
}

/**
 * Append-only ledger for soak / certification; optional rolling truncation.
 */
export class EventLedger {
  private seq = 0
  private entries: EventLedgerEntry[] = []
  private readonly maxEntries: number

  constructor(maxEntries = 50_000) {
    this.maxEntries = maxEntries
  }

  append(entry: Omit<EventLedgerEntry, "sequenceId">) {
    this.seq++
    this.entries.push({ ...entry, sequenceId: this.seq })
    const overflow = this.entries.length - this.maxEntries
    if (overflow > 0) this.entries.splice(0, overflow)
  }

  clear() {
    this.seq = 0
    this.entries = []
  }

  export(): EventLedgerExport {
    return { schemaVersion: 1, entries: [...this.entries] }
  }

  static import(data: unknown): EventLedger {
    const o = data as EventLedgerExport
    const led = new EventLedger()
    if (o?.schemaVersion === 1 && Array.isArray(o.entries)) {
      led.entries = o.entries.map((e) => ({ ...e }))
      led.seq = led.entries.length ? Math.max(...led.entries.map((x) => x.sequenceId)) : 0
    }
    return led
  }
}
