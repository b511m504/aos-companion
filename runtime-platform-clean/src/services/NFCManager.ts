import type { NfcHardwareError, NfcMode, NfcScanMachineState } from "@/models/types"
import { normalizeUid } from "@/utils/uid"
import { Capacitor } from "@capacitor/core"

/** Must match {@code NativeNfcBridge.WINDOW_EVENT_TAG} in Android. */
const AOS_NATIVE_NFC_TAG_EVENT = "aosNativeNfcTag"
const AOS_NATIVE_NFC_ERROR_EVENT = "aosNativeNfcScanError"

type ScanHandler = (uid: string, meta: { source: "native" | "simulated" | "synthetic" }) => void
type StateHandler = (s: NfcScanMachineState) => void
type ErrorHandler = (e: NfcHardwareError) => void

export type NfcManagerStatus = {
  nativeSupported: boolean
  mode: NfcMode
  sessionActive: boolean
  scanState: NfcScanMachineState
  lastHardwareError: NfcHardwareError | null
  debounceMs: number
}

const TRANSITIONS: Record<NfcScanMachineState, ReadonlySet<NfcScanMachineState>> = {
  idle: new Set(["arming", "error"]),
  arming: new Set(["scanning", "error", "idle"]),
  scanning: new Set(["success", "error", "cooldown", "idle", "arming"]),
  success: new Set(["scanning", "idle", "cooldown", "arming"]),
  error: new Set(["idle", "arming", "scanning"]),
  cooldown: new Set(["scanning", "idle", "error", "arming"])
}

function canGo(from: NfcScanMachineState, to: NfcScanMachineState): boolean {
  return TRANSITIONS[from]?.has(to) ?? false
}

/** Extract UID from canonical CleanNfcBridge / window event detail. */
export function parseCanonicalUidFromNativeNfcDetail(detail: unknown): string | null {
  const top =
    detail && typeof detail === "object" && !Array.isArray(detail)
      ? (detail as Record<string, unknown>)
      : null
  if (!top) return null
  const direct = top.uid
  if (typeof direct === "string" && direct.length > 0) return direct
  const legacy = (top.tagInfo as { uid?: string } | undefined)?.uid
  if (typeof legacy === "string" && legacy.length > 0) return legacy
  return null
}

export function parseUidFromNativeNfcWindowEvent(ev: Event): string | null {
  const anyEv = ev as CustomEvent<unknown> & Record<string, unknown>
  const detail = anyEv.detail
  const top =
    detail && typeof detail === "object" && !Array.isArray(detail)
      ? detail
      : (anyEv as Record<string, unknown>)
  return parseCanonicalUidFromNativeNfcDetail(top)
}

/**
 * Platform abstraction for NFC reads. UI must not import Capacitor plugins directly.
 */
export class NFCManager {
  private mode: NfcMode = "simulated"
  private handlers = new Set<ScanHandler>()
  private stateHandlers = new Set<StateHandler>()
  private errorHandlers = new Set<ErrorHandler>()
  private unsubRead: (() => void) | null = null
  private unsubError: (() => void) | null = null
  private sessionActive = false
  private nativeSupported = false
  private scanState: NfcScanMachineState = "idle"
  private lastHardwareError: NfcHardwareError | null = null
  private debounceMs = 1500
  private lastEmitUid: string | null = null
  private lastEmitAt = 0
  private timers: number[] = []

  getMode(): NfcMode {
    return this.mode
  }

  setMode(mode: NfcMode): void {
    this.mode = mode
  }

  getDebounceMs(): number {
    return this.debounceMs
  }

  setDebounceMs(ms: number): void {
    this.debounceMs = Math.max(0, Math.min(10_000, ms))
  }

  getScanState(): NfcScanMachineState {
    return this.scanState
  }

  getLastHardwareError(): NfcHardwareError | null {
    return this.lastHardwareError
  }

  clearHardwareError(): void {
    this.lastHardwareError = null
    if (this.scanState === "error" && !this.sessionActive) {
      this.transition("idle")
    }
  }

  subscribe(handler: ScanHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  subscribeScanState(handler: StateHandler): () => void {
    this.stateHandlers.add(handler)
    return () => this.stateHandlers.delete(handler)
  }

  subscribeHardwareError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler)
    return () => this.errorHandlers.delete(handler)
  }

  private transition(to: NfcScanMachineState): void {
    if (!canGo(this.scanState, to)) {
      console.warn(`[NFCManager] Ignored invalid transition ${this.scanState} → ${to}`)
      return
    }
    this.scanState = to
    for (const h of this.stateHandlers) h(to)
  }

  private emitHardwareError(e: NfcHardwareError): void {
    this.lastHardwareError = e
    for (const h of this.errorHandlers) h(e)
    if (canGo(this.scanState, "error")) this.transition("error")
  }

  private clearTimers(): void {
    for (const t of this.timers) window.clearTimeout(t)
    this.timers = []
  }

  private schedule(fn: () => void, ms: number): void {
    const id = window.setTimeout(() => {
      this.timers = this.timers.filter((x) => x !== id)
      fn()
    }, ms)
    this.timers.push(id)
  }

  async probeNative(): Promise<boolean> {
    if (Capacitor.getPlatform() !== "android") {
      this.nativeSupported = false
      return false
    }
    this.nativeSupported = true
    return true
  }

  private emitScan(uid: string, meta: { source: "native" | "simulated" | "synthetic" }) {
    for (const h of this.handlers) h(uid, meta)
  }

  private tryDeliverScan(rawUid: string, meta: { source: "native" | "simulated" | "synthetic" }): void {
    const uid = normalizeUid(rawUid)
    if (!uid) {
      this.emitHardwareError({
        at: new Date().toISOString(),
        code: "malformed_payload",
        message: "Tag read produced an empty UID after normalization"
      })
      this.schedule(() => {
        if (this.sessionActive) this.transition("scanning")
        else this.transition("idle")
      }, 400)
      return
    }

    const now = Date.now()
    if (
      this.debounceMs > 0 &&
      uid === this.lastEmitUid &&
      now - this.lastEmitAt < this.debounceMs
    ) {
      this.transition("cooldown")
      this.schedule(() => {
        if (this.sessionActive) this.transition("scanning")
        else this.transition("idle")
      }, Math.max(0, this.debounceMs - (now - this.lastEmitAt)))
      return
    }

    this.lastEmitUid = uid
    this.lastEmitAt = now
    this.transition("success")
    this.emitScan(uid, meta)
    this.schedule(() => {
      if (this.sessionActive) this.transition("scanning")
      else this.transition("idle")
    }, 320)
  }

  async startListening(): Promise<void> {
    if (this.sessionActive) return
    this.sessionActive = true
    this.clearHardwareError()
    this.transition("arming")

    if (this.mode === "native") {
      await this.attachNative()
      return
    }

    await this.detachNative()
    this.transition("scanning")
  }

  async stopListening(): Promise<void> {
    this.sessionActive = false
    this.clearTimers()
    await this.detachNative()
    this.transition("idle")
  }

  simulateScan(rawUid: string): void {
    if (!this.sessionActive) return
    if (this.scanState !== "scanning" && this.scanState !== "cooldown") return
    this.tryDeliverScan(rawUid, { source: "simulated" })
  }

  /**
   * Same parse + delivery path as a native `aosNativeNfcTag` window event, for validation harnesses.
   * Does not attach listeners; use with an active session in simulated mode or when native hooks are absent.
   */
  injectCanonicalTagEvent(detail: unknown): void {
    if (!this.sessionActive) return
    if (this.scanState !== "scanning" && this.scanState !== "cooldown") return
    const uid = parseCanonicalUidFromNativeNfcDetail(detail)
    if (!uid) {
      this.emitHardwareError({
        at: new Date().toISOString(),
        code: "malformed_payload",
        message: "Synthetic NFC: missing uid (canonical or tagInfo.uid)"
      })
      this.schedule(() => {
        if (this.sessionActive) this.transition("scanning")
        else this.transition("idle")
      }, 400)
      return
    }
    this.tryDeliverScan(uid, { source: "synthetic" })
  }

  /** True when Android native window listeners for tag/error are installed. */
  isNativeTagListenerAttached(): boolean {
    return this.unsubRead !== null
  }

  /** Validation / self-heal: clears debounce memory so the next identical UID is not suppressed. */
  healClearScanDedupe(reason: string): void {
    console.warn(`[NFCManager] heal_clear_scan_dedupe reason=${reason}`)
    this.lastEmitUid = null
    this.lastEmitAt = 0
  }

  isSessionActive(): boolean {
    return this.sessionActive
  }

  private async attachNative(): Promise<void> {
    await this.detachNative()
    try {
      if (Capacitor.getPlatform() !== "android") {
        this.emitHardwareError({
          at: new Date().toISOString(),
          code: "unsupported",
          message: "Native NFC transport is Android-only (NativeNfcBridge)."
        })
        this.mode = "simulated"
        if (this.sessionActive) this.transition("scanning")
        else this.transition("idle")
        return
      }

      const onTag = (ev: Event) => {
        try {
          const uid = parseUidFromNativeNfcWindowEvent(ev)
          if (!uid) {
            this.emitHardwareError({
              at: new Date().toISOString(),
              code: "malformed_payload",
              message: "Native read: missing uid (canonical or tagInfo.uid)"
            })
            this.schedule(() => {
              if (this.sessionActive) this.transition("scanning")
              else this.transition("idle")
            }, 600)
            return
          }
          if (this.sessionActive && (this.scanState === "scanning" || this.scanState === "cooldown")) {
            this.tryDeliverScan(uid, { source: "native" })
          }
        } catch (e) {
          this.emitHardwareError({
            at: new Date().toISOString(),
            code: "malformed_payload",
            message: e instanceof Error ? e.message : "Failed to parse NFC payload"
          })
        }
      }

      const onErr = (ev: Event) => {
        const raw = ev as unknown as Record<string, unknown>
        const msg =
          typeof raw.message === "string"
            ? raw.message
            : typeof raw.error === "string"
              ? raw.error
              : JSON.stringify(raw)
        const lower = String(msg).toLowerCase()
        let code: NfcHardwareError["code"] = "unknown"
        if (lower.includes("cancel")) code = "canceled"
        else if (lower.includes("permission") || lower.includes("denied")) code = "permission_denied"
        else if (lower.includes("unsupported")) code = "unsupported"
        else code = "plugin_failure"
        this.emitHardwareError({ at: new Date().toISOString(), code, message: String(msg) })
      }

      window.addEventListener(AOS_NATIVE_NFC_TAG_EVENT, onTag)
      window.addEventListener(AOS_NATIVE_NFC_ERROR_EVENT, onErr)
      this.unsubRead = () => window.removeEventListener(AOS_NATIVE_NFC_TAG_EVENT, onTag)
      this.unsubError = () => window.removeEventListener(AOS_NATIVE_NFC_ERROR_EVENT, onErr)

      this.transition("scanning")
    } catch (e) {
      this.mode = "simulated"
      this.emitHardwareError({
        at: new Date().toISOString(),
        code: "plugin_failure",
        message: e instanceof Error ? e.message : "Native NFC attach failed; falling back to simulated"
      })
      await this.detachNative()
      if (this.sessionActive) this.transition("scanning")
      else this.transition("idle")
    }
  }

  private async detachNative(): Promise<void> {
    this.clearTimers()
    if (this.unsubRead) {
      this.unsubRead()
      this.unsubRead = null
    }
    if (this.unsubError) {
      this.unsubError()
      this.unsubError = null
    }
  }

  getStatus(): NfcManagerStatus {
    return {
      nativeSupported: this.nativeSupported,
      mode: this.mode,
      sessionActive: this.sessionActive,
      scanState: this.scanState,
      lastHardwareError: this.lastHardwareError,
      debounceMs: this.debounceMs
    }
  }

  /** Approximate listener counts for leak / stress diagnostics (dev harness only). */
  getHarnessSubscriptionCounts(): { scanHandlers: number; stateHandlers: number; errorHandlers: number } {
    return {
      scanHandlers: this.handlers.size,
      stateHandlers: this.stateHandlers.size,
      errorHandlers: this.errorHandlers.size
    }
  }
}

let singleton: NFCManager | null = null

export function getNfcManager(): NFCManager {
  if (!singleton) singleton = new NFCManager()
  return singleton
}
