import { getRuntimeEngine } from "@/runtime/RuntimeEngine"
import { getNfcManager } from "@/services/NFCManager"
import { useRuntimeSession } from "@/store/useRuntimeSession"
import type { RuntimeHealthSnapshot } from "@/runtimeValidation/types"

export type HealthMonitorCallbacks = {
  onSample?: (s: RuntimeHealthSnapshot) => void
}

/**
 * Periodic sampling of runtime + NFC + document visibility (best-effort lifecycle proxy on web).
 */
export class RuntimeHealthMonitor {
  private timer: number | null = null
  private readonly intervalMs: number
  private readonly cb: HealthMonitorCallbacks
  private tail: RuntimeHealthSnapshot[] = []
  private readonly maxTail = 120

  constructor(intervalMs: number, cb: HealthMonitorCallbacks = {}) {
    this.intervalMs = Math.max(250, intervalMs)
    this.cb = cb
  }

  start(): void {
    this.stop()
    this.timer = window.setInterval(() => this.tick(), this.intervalMs)
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer)
      this.timer = null
    }
  }

  getTail(): RuntimeHealthSnapshot[] {
    return [...this.tail]
  }

  private tick(): void {
    const eng = getRuntimeEngine()
    const rs = useRuntimeSession.getState()
    const mgr = getNfcManager()
    const subs = mgr.getHarnessSubscriptionCounts()
    const snap: RuntimeHealthSnapshot = {
      t: Date.now(),
      nfcSessionActive: mgr.isSessionActive(),
      nfcScanState: mgr.getScanState(),
      nfcHandlerApprox: subs.scanHandlers,
      runtimeEnabled: rs.runtimeEnabled,
      runtimePaused: rs.runtimePaused,
      queueDepth: eng.getQueueSnapshot().length,
      entityCount: eng.stateStore.getAll().length,
      hidden: typeof document !== "undefined" ? document.hidden : false
    }
    this.tail.push(snap)
    if (this.tail.length > this.maxTail) this.tail.splice(0, this.tail.length - this.maxTail)
    this.cb.onSample?.(snap)
  }
}
