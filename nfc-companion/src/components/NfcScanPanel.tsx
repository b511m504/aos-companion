import { useMemo, useState } from "react"
import { useAppStore } from "@/store/useAppStore"
import { normalizeUid } from "@/utils/uid"

export function NfcScanPanel() {
  const nfcMode = useAppStore((s) => s.nfcMode)
  const nativeNfcAvailable = useAppStore((s) => s.nativeNfcAvailable)
  const setNfcMode = useAppStore((s) => s.setNfcMode)
  const awaitingScan = useAppStore((s) => s.awaitingScan)
  const selectedEntityId = useAppStore((s) => s.selectedEntityId)
  const scanFeedback = useAppStore((s) => s.scanFeedback)
  const lastScannedUid = useAppStore((s) => s.lastScannedUid)
  const setAwaitingScan = useAppStore((s) => s.setAwaitingScan)
  const simulateUidInput = useAppStore((s) => s.simulateUidInput)

  const [manualUid, setManualUid] = useState("")

  const readyVisual = useMemo(() => {
    if (awaitingScan && selectedEntityId) return "panel scan-ready"
    return "panel scan-idle"
  }, [awaitingScan, selectedEntityId])

  return (
    <div
      className={`nfc-scan-panel ${readyVisual} ${scanFeedback.kind === "success" ? "nfc-scan-panel--success" : ""}`}
    >
      <div className="row-between" style={{ marginBottom: 10 }}>
        <div>
          <p className="eyebrow" style={{ marginBottom: 4 }}>
            Tag reader
          </p>
          <div style={{ fontWeight: 650 }}>Link the tag</div>
        </div>
      </div>

      <div className="muted" style={{ fontSize: 15, marginBottom: 14, lineHeight: 1.5 }}>
        {awaitingScan && selectedEntityId ? (
          <span style={{ color: "var(--accent)", fontWeight: 650 }}>Hold your tag here — ready.</span>
        ) : (
          "Pick a unit on the left, then tap “Ready to scan”."
        )}
      </div>

      <div className="row-between" style={{ gap: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={!selectedEntityId}
          onClick={() => void setAwaitingScan(!awaitingScan)}
        >
          {awaitingScan ? "Stop scanning" : "Ready to scan"}
        </button>
      </div>

      <div className="divider" />

      <div className="stack" style={{ gap: 8 }}>
        <div className="row-between">
          <span className="muted">Last tag</span>
          <span className="mono" style={{ fontWeight: 600 }}>
            {lastScannedUid ?? "—"}
          </span>
        </div>
        {scanFeedback.kind === "success" ? (
          <div className="scan-toast scan-toast-success" role="status">
            {scanFeedback.message}
          </div>
        ) : scanFeedback.kind === "error" ? (
          <div className="scan-toast scan-toast-error" role="alert">
            {scanFeedback.message}
          </div>
        ) : null}
      </div>

      <details className="scan-advanced">
        <summary>Reader &amp; test options</summary>
        <div className="stack" style={{ marginTop: 12, gap: 12 }}>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Use native NFC on supported tablets, or practice mode on this device. These options don’t affect your
            army list.
          </p>
          <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
            <button
              type="button"
              className={`btn ${nfcMode === "native" ? "btn-primary" : "btn-ghost"}`}
              disabled={!nativeNfcAvailable}
              onClick={() => void setNfcMode("native")}
            >
              Tablet NFC
            </button>
            <button
              type="button"
              className={`btn ${nfcMode === "simulated" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => void setNfcMode("simulated")}
            >
              Practice (no reader)
            </button>
          </div>
          {nfcMode === "simulated" && awaitingScan ? (
            <button type="button" className="btn" onClick={() => simulateUidInput("04:A3:92:11:22:33:90")}>
              Simulate a tag tap
            </button>
          ) : null}
          <div className="field">
            <label className="muted" htmlFor="manual-uid">
              Or type a tag code (practice only)
            </label>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <input
                id="manual-uid"
                placeholder="Tag code"
                value={manualUid}
                onChange={(e) => setManualUid(e.target.value)}
                style={{ flex: "1 1 220px" }}
              />
              <button
                type="button"
                className="btn"
                disabled={!awaitingScan}
                onClick={() => {
                  simulateUidInput(manualUid)
                  setManualUid("")
                }}
              >
                Apply
              </button>
            </div>
            {manualUid ? (
              <div className="muted" style={{ fontSize: 12 }}>
                Normalized: <span className="mono">{normalizeUid(manualUid)}</span>
              </div>
            ) : null}
          </div>
        </div>
      </details>
    </div>
  )
}
