import { create } from "zustand"
import { formatTimelineClock } from "@/nfcValidation/nfcValidationFormat"

export type NfcValidationTimelineEntry = {
  id: string
  wallMs: number
  perfMs: number
  label: string
  line: string
}

export type NfcValidationDebounced = "delivered" | "skipped" | "none"

type State = {
  readerModeActive: boolean | null
  transportPhase: string | null
  appLifecycle: string
  lastNativeProbeUptimeMs: number | null
  lastNativeCanonicalUptimeMs: number | null
  lastWallMs: number | null
  lastUid: string
  lastUidPreview: string
  lastDebounced: NfcValidationDebounced
  transportPath: string
  readerCallbackCount: number
  canonicalDeliveredCount: number
  lastJsReceiptPerfMs: number | null
  lastJsReceiptWallMs: number | null
  lastPaintPerfMs: number | null
  /** Wall clock: JS handler time minus native `timestamp` on canonical tag (approximate bridge delay). */
  nativeWallToJsReceiptMs: number | null
  /** `performance.now()` from last paint barrier after canonical tag. */
  jsToPaintDeltaMs: number | null
  possibleSystemOverlaySuspected: boolean
  /** True after canonical tag reached JS — app pipeline works under OEM overlay. */
  appProcessingConfirmed: boolean
  ndefProbeSkipped: boolean | null
  lastCallbackEntryPerfMs: number | null
  pureReaderModeTest: boolean | null
  timeline: NfcValidationTimelineEntry[]
}

type Actions = {
  pushTimeline: (label: string, detail?: string) => void
  recordTransport: (payload: Record<string, unknown>) => void
  recordReaderProbe: (payload: Record<string, unknown>, jsPerfNow: number) => void
  recordCanonicalTag: (payload: Record<string, unknown>, jsPerfNow: number) => void
  recordAppLifecycle: (state: string) => void
  reportSystemNfcUiSeen: () => void
  resetOverlayFlag: () => void
}

const MAX_TIMELINE = 120

function nextId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

function trim<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr
  return arr.slice(arr.length - max)
}

const initial: State = {
  readerModeActive: null,
  transportPhase: null,
  appLifecycle: "unknown",
  lastNativeProbeUptimeMs: null,
  lastNativeCanonicalUptimeMs: null,
  lastWallMs: null,
  lastUid: "",
  lastUidPreview: "",
  lastDebounced: "none",
  transportPath: "reader_mode",
  readerCallbackCount: 0,
  canonicalDeliveredCount: 0,
  lastJsReceiptPerfMs: null,
  lastJsReceiptWallMs: null,
  lastPaintPerfMs: null,
  nativeWallToJsReceiptMs: null,
  jsToPaintDeltaMs: null,
  possibleSystemOverlaySuspected: false,
  appProcessingConfirmed: false,
  ndefProbeSkipped: null,
  lastCallbackEntryPerfMs: null,
  pureReaderModeTest: null,
  timeline: []
}

export const useNfcValidationStore = create<State & Actions>((set, get) => ({
  ...initial,

  pushTimeline(label, detail) {
    const wallMs = Date.now()
    const perfMs = performance.now()
    const clock = formatTimelineClock(wallMs)
    const line = detail ? `${clock} ${label} · ${detail}` : `${clock} ${label}`
    set((s) => ({
      timeline: trim(
        [...s.timeline, { id: nextId(), wallMs, perfMs, label, line }],
        MAX_TIMELINE
      )
    }))
  },

  recordTransport(payload) {
    const reader = typeof payload.readerModeActive === "boolean" ? payload.readerModeActive : null
    const phase = typeof payload.phase === "string" ? payload.phase : null
    const wall = typeof payload.wallClockMs === "number" ? payload.wallClockMs : Date.now()
    const transport = typeof payload.transport === "string" ? payload.transport : "reader_mode"
    const pureRaw = payload.PURE_READERMODE_TEST
    const pureReaderModeTest = typeof pureRaw === "boolean" ? pureRaw : null
    set({ readerModeActive: reader, transportPhase: phase, lastWallMs: wall, transportPath: transport, pureReaderModeTest })
    const parts: string[] = []
    if (typeof payload.phase === "string") parts.push(`phase=${payload.phase}`)
    if (pureReaderModeTest != null) parts.push(`PURE_READERMODE_TEST=${pureReaderModeTest}`)
    if (typeof payload.readerModeFlagsDesc === "string") parts.push(`flags=${payload.readerModeFlagsDesc}`)
    if (typeof payload.deviceModel === "string") parts.push(`device=${payload.deviceModel}`)
    if (typeof payload.skipNdefProbe === "boolean") parts.push(`skipNdefProbe=${payload.skipNdefProbe}`)
    get().pushTimeline(reader ? "ReaderMode enabled" : "ReaderMode disabled", parts.length ? parts.join(" ") : undefined)
  },

  recordReaderProbe(payload, jsPerfNow) {
    const phase = typeof payload.phase === "string" ? payload.phase : ""
    const pureRaw = payload.PURE_READERMODE_TEST
    if (typeof pureRaw === "boolean") {
      set({ pureReaderModeTest: pureRaw })
    }
    const nativeUptime =
      typeof payload.nativeCallbackUptimeMs === "number" ? payload.nativeCallbackUptimeMs : null
    const wall = typeof payload.wallClockMs === "number" ? payload.wallClockMs : Date.now()
    const uidPreview = typeof payload.uidPreview === "string" ? payload.uidPreview : ""
    const uid = typeof payload.uid === "string" ? payload.uid : ""

    if (phase === "callback_entry") {
      set((s) => ({
        readerCallbackCount: s.readerCallbackCount + 1,
        lastNativeProbeUptimeMs: nativeUptime,
        lastWallMs: wall,
        lastUidPreview: uidPreview,
        lastCallbackEntryPerfMs: jsPerfNow,
        lastDebounced: "none"
      }))
      get().pushTimeline(
        "callback_fired",
        `jsPerf=${jsPerfNow.toFixed(3)} nativeUptime=${nativeUptime ?? "?"} uidPreview=${uidPreview || "—"}`
      )
    } else if (phase === "debounced_skip") {
      set({
        lastNativeProbeUptimeMs: nativeUptime,
        lastWallMs: wall,
        lastUid: uid,
        lastUidPreview: uid,
        lastDebounced: "skipped"
      })
      get().pushTimeline("debounced_skip", `uid=${uid}`)
    }
  },

  recordCanonicalTag(payload, jsPerfNow) {
    const pureRaw = payload.PURE_READERMODE_TEST
    if (typeof pureRaw === "boolean") {
      set({ pureReaderModeTest: pureRaw })
    }
    const nativeUptime =
      typeof payload.nativeCallbackUptimeMs === "number" ? payload.nativeCallbackUptimeMs : null
    const nativeWall =
      typeof payload.timestamp === "number"
        ? payload.timestamp
        : typeof payload.wallClockMs === "number"
          ? (payload.wallClockMs as number)
          : Date.now()
    const wallReceipt = Date.now()
    const uid = typeof payload.uid === "string" ? payload.uid : ""
    const ndefSkipped = typeof payload.ndefProbeSkipped === "boolean" ? payload.ndefProbeSkipped : null

    set((s) => ({
      canonicalDeliveredCount: s.canonicalDeliveredCount + 1,
      lastNativeCanonicalUptimeMs: nativeUptime,
      lastWallMs: wallReceipt,
      lastUid: uid,
      lastUidPreview: uid,
      lastDebounced: "delivered",
      lastJsReceiptPerfMs: jsPerfNow,
      lastJsReceiptWallMs: wallReceipt,
      nativeWallToJsReceiptMs: wallReceipt - nativeWall,
      appProcessingConfirmed: true,
      ndefProbeSkipped: ndefSkipped
    }))
    const extra =
      ndefSkipped != null ? ` ndefProbeSkipped=${ndefSkipped}` : ""
    get().pushTimeline("JS received (canonical)", `uid=${uid} jsPerf=${jsPerfNow.toFixed(3)}${extra}`)
    get().pushTimeline("app_scan_route_ok", "UID reached JS — classify OEM popup as overlay-only if gameplay works")

    queueMicrotask(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const paint = performance.now()
          const js0 = get().lastJsReceiptPerfMs
          set({
            lastPaintPerfMs: paint,
            jsToPaintDeltaMs: js0 != null ? paint - js0 : null
          })
          get().pushTimeline(
            "UI rendered (paint barrier)",
            `perf=${paint.toFixed(3)} ms Δjs→paint=${js0 != null ? (paint - js0).toFixed(3) : "?"} ms`
          )
        })
      })
    })
  },

  recordAppLifecycle(state) {
    set({ appLifecycle: state })
    get().pushTimeline(`app lifecycle`, state)
  },

  reportSystemNfcUiSeen() {
    const last = get().lastCallbackEntryPerfMs
    if (last == null) {
      get().pushTimeline("OEM report ignored", "No ReaderMode callback in this session yet")
      return
    }
    const age = performance.now() - last
    if (age <= 2800) {
      set({ possibleSystemOverlaySuspected: true })
      get().pushTimeline(
        "possible_system_overlay_behavior=true",
        "User saw system NFC UI shortly after callback_fired"
      )
    } else {
      get().pushTimeline("OEM report ignored", "Tap within ~3s of a scan / system popup")
    }
  },

  resetOverlayFlag() {
    set({ possibleSystemOverlaySuspected: false })
    get().pushTimeline("Cleared OEM overlay flag")
  }
}))
