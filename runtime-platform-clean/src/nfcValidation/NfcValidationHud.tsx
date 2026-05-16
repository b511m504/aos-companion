import { useMemo, useRef, useEffect, useState } from "react"
import { useNfcValidationStore } from "@/nfcValidation/nfcValidationStore"
import {
  isNfcValidationHudEnabled,
  isNfcValidationVibrateEnabled,
  setNfcValidationVibrateEnabled
} from "@/nfcValidation/nfcValidationEnv"
import { useAppStore } from "@/store/useAppStore"

export function NfcValidationHud() {
  const enabled = useMemo(() => (typeof window !== "undefined" ? isNfcValidationHudEnabled() : false), [])
  const timelineRef = useRef<HTMLDivElement>(null)
  const readerModeActive = useNfcValidationStore((s) => s.readerModeActive)
  const transportPhase = useNfcValidationStore((s) => s.transportPhase)
  const appLifecycle = useNfcValidationStore((s) => s.appLifecycle)
  const lastWallMs = useNfcValidationStore((s) => s.lastWallMs)
  const lastUid = useNfcValidationStore((s) => s.lastUid)
  const lastUidPreview = useNfcValidationStore((s) => s.lastUidPreview)
  const lastDebounced = useNfcValidationStore((s) => s.lastDebounced)
  const transportPath = useNfcValidationStore((s) => s.transportPath)
  const readerCallbackCount = useNfcValidationStore((s) => s.readerCallbackCount)
  const canonicalDeliveredCount = useNfcValidationStore((s) => s.canonicalDeliveredCount)
  const lastNativeProbeUptimeMs = useNfcValidationStore((s) => s.lastNativeProbeUptimeMs)
  const lastNativeCanonicalUptimeMs = useNfcValidationStore((s) => s.lastNativeCanonicalUptimeMs)
  const lastJsReceiptPerfMs = useNfcValidationStore((s) => s.lastJsReceiptPerfMs)
  const lastJsReceiptWallMs = useNfcValidationStore((s) => s.lastJsReceiptWallMs)
  const lastPaintPerfMs = useNfcValidationStore((s) => s.lastPaintPerfMs)
  const nativeWallToJsReceiptMs = useNfcValidationStore((s) => s.nativeWallToJsReceiptMs)
  const jsToPaintDeltaMs = useNfcValidationStore((s) => s.jsToPaintDeltaMs)
  const possibleSystemOverlaySuspected = useNfcValidationStore((s) => s.possibleSystemOverlaySuspected)
  const appProcessingConfirmed = useNfcValidationStore((s) => s.appProcessingConfirmed)
  const ndefProbeSkipped = useNfcValidationStore((s) => s.ndefProbeSkipped)
  const pureReaderModeTest = useNfcValidationStore((s) => s.pureReaderModeTest)
  const timeline = useNfcValidationStore((s) => s.timeline)
  const reportOverlay = useNfcValidationStore((s) => s.reportSystemNfcUiSeen)
  const resetOverlay = useNfcValidationStore((s) => s.resetOverlayFlag)
  const goNfcValidation = useAppStore((s) => s.goNfcValidation)
  const nfcMode = useAppStore((s) => s.nfcMode)

  const [vibrateOn, setVibrateOn] = useState(() => isNfcValidationVibrateEnabled())

  useEffect(() => {
    const el = timelineRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [timeline])

  if (!enabled) return null

  const wallFmt =
    lastWallMs != null
      ? new Date(lastWallMs).toLocaleTimeString(undefined, {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        }) +
        "." +
        String(new Date(lastWallMs).getMilliseconds()).padStart(3, "0")
      : "—"

  return (
    <div
      className="nfc-val-hud"
      style={{
        position: "fixed",
        right: 10,
        bottom: 10,
        zIndex: 2147483645,
        width: "min(420px, calc(100vw - 20px))",
        maxHeight: "48vh",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 10,
        borderRadius: 12,
        background: "rgba(10,12,18,0.92)",
        border: "1px solid rgba(79,209,197,0.35)",
        color: "#e8ecf3",
        fontSize: 12,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
        backdropFilter: "blur(8px)"
      }}
    >
      <div className="row-between" style={{ alignItems: "center" }}>
        <strong style={{ color: "#4fd1c5", letterSpacing: "0.04em" }}>NFC VALIDATION</strong>
        <span style={{ opacity: 0.75, fontSize: 11 }}>capture-first</span>
      </div>

      <div
        style={{
          padding: "8px 10px",
          borderRadius: 8,
          background:
            pureReaderModeTest === true ? "rgba(252, 129, 129, 0.2)" : "rgba(104, 211, 145, 0.12)",
          border: `1px solid ${
            pureReaderModeTest === true ? "rgba(252,129,129,0.55)" : "rgba(104,211,145,0.35)"
          }`,
          fontWeight: 700,
          letterSpacing: "0.04em",
          fontSize: 12,
          color: pureReaderModeTest === true ? "#fc8181" : "#68d391"
        }}
      >
        PURE_READERMODE_TEST=
        {pureReaderModeTest === true
          ? "TRUE"
          : pureReaderModeTest === false
            ? "FALSE"
            : "UNKNOWN (await ReaderMode transport event)"}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, lineHeight: 1.35 }}>
        <span style={{ opacity: 0.65 }}>ReaderMode</span>
        <span>{readerModeActive == null ? "unknown" : readerModeActive ? "active" : "off"}</span>
        <span style={{ opacity: 0.65 }}>Transport</span>
        <span>{transportPath}</span>
        <span style={{ opacity: 0.65 }}>Native phase</span>
        <span style={{ wordBreak: "break-all" }}>{transportPhase ?? "—"}</span>
        <span style={{ opacity: 0.65 }}>App lifecycle</span>
        <span>{appLifecycle}</span>
        <span style={{ opacity: 0.65 }}>NFC mode (app)</span>
        <span>{nfcMode}</span>
        <span style={{ opacity: 0.65 }}>Callbacks</span>
        <span>{readerCallbackCount}</span>
        <span style={{ opacity: 0.65 }}>Canonical</span>
        <span>{canonicalDeliveredCount}</span>
        <span style={{ opacity: 0.65 }}>Debounce</span>
        <span>{lastDebounced}</span>
        <span style={{ opacity: 0.65 }}>Last wall</span>
        <span>{wallFmt}</span>
        <span style={{ opacity: 0.65 }}>UID</span>
        <span style={{ wordBreak: "break-all" }}>{lastUid || lastUidPreview || "—"}</span>
        <span style={{ opacity: 0.65 }}>native uptime (probe)</span>
        <span>{lastNativeProbeUptimeMs ?? "—"}</span>
        <span style={{ opacity: 0.65 }}>native uptime (tag)</span>
        <span>{lastNativeCanonicalUptimeMs ?? "—"}</span>
        <span style={{ opacity: 0.65 }}>JS receipt perf</span>
        <span>{lastJsReceiptPerfMs != null ? lastJsReceiptPerfMs.toFixed(3) : "—"}</span>
        <span style={{ opacity: 0.65 }}>JS receipt wall</span>
        <span>{lastJsReceiptWallMs ?? "—"}</span>
        <span style={{ opacity: 0.65 }}>Paint perf</span>
        <span>{lastPaintPerfMs != null ? lastPaintPerfMs.toFixed(3) : "—"}</span>
        <span style={{ opacity: 0.65 }}>wall(native→JS)</span>
        <span>{nativeWallToJsReceiptMs != null ? `${nativeWallToJsReceiptMs} ms` : "—"}</span>
        <span style={{ opacity: 0.65 }}>perf(JS→paint)</span>
        <span>{jsToPaintDeltaMs != null ? `${jsToPaintDeltaMs.toFixed(3)} ms` : "—"}</span>
        <span style={{ opacity: 0.65 }}>App scan route</span>
        <span style={{ color: appProcessingConfirmed ? "#68d391" : "inherit" }}>
          {appProcessingConfirmed ? "confirmed (JS)" : "—"}
        </span>
        <span style={{ opacity: 0.65 }}>NDEF probe</span>
        <span>{ndefProbeSkipped == null ? "—" : ndefProbeSkipped ? "skipped (UID-only)" : "enabled"}</span>
        <span style={{ opacity: 0.65 }}>OEM overlay?</span>
        <span style={{ color: possibleSystemOverlaySuspected ? "#fc8181" : "#68d391" }}>
          {possibleSystemOverlaySuspected
            ? appProcessingConfirmed
              ? "cosmetic (app OK)"
              : "suspected"
            : "no flag"}
        </span>
      </div>

      <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
        <button type="button" className="btn btn-primary" style={{ fontSize: 11, padding: "6px 10px" }} onClick={() => goNfcValidation()}>
          Checklist
        </button>
        <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: "6px 10px" }} onClick={() => reportOverlay()}>
          Saw system NFC UI
        </button>
        <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: "6px 10px" }} onClick={() => resetOverlay()}>
          Clear OEM flag
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ fontSize: 11, padding: "6px 10px" }}
          onClick={() => {
            const next = !isNfcValidationVibrateEnabled()
            setNfcValidationVibrateEnabled(next)
            setVibrateOn(next)
          }}
        >
          Vibrate: {vibrateOn ? "on" : "off"}
        </button>
      </div>

      <div
        ref={timelineRef}
        style={{
          maxHeight: 160,
          overflow: "auto",
          border: "1px solid rgba(42,51,68,0.9)",
          borderRadius: 8,
          padding: 6,
          background: "rgba(7,9,13,0.55)"
        }}
      >
        {timeline.length === 0 ? (
          <span style={{ opacity: 0.5 }}>Timeline (waiting for native events)…</span>
        ) : (
          timeline.map((e) => (
            <div key={e.id} style={{ fontSize: 11, marginBottom: 4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {e.line}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
