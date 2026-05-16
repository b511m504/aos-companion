import { useCallback, useEffect, useMemo, useState } from "react"
import { useAppStore } from "@/store/useAppStore"
import { NFC_VALIDATION_CHECKLIST_KEY } from "@/nfcValidation/nfcValidationConstants"
import { isNfcValidationHudEnabled } from "@/nfcValidation/nfcValidationEnv"
import { useNfcValidationStore } from "@/nfcValidation/nfcValidationStore"
import { getNfcManager } from "@/services/NFCManager"

export type ChecklistItemId =
  | "blank_tag"
  | "rapid_tap"
  | "hold_test"
  | "corrupted_tag"
  | "screen_cycle"
  | "bg_fg"

export type ChecklistStatus = "pending" | "pass" | "fail"

type Row = {
  id: ChecklistItemId
  title: string
  hint: string
}

const ROWS: Row[] = [
  {
    id: "blank_tag",
    title: "Blank / empty NDEF tag",
    hint: "Use a formatted-but-empty tag. Confirm callback_fired + canonical or debounced_skip in timeline."
  },
  {
    id: "rapid_tap",
    title: "Rapid tap",
    hint: "Tap same tag quickly. Expect debounced_skip lines; canonical rate should be sane."
  },
  {
    id: "hold_test",
    title: "Hold tag on antenna",
    hint: "Long dwell. Watch for repeated callback_fired vs debounce."
  },
  {
    id: "corrupted_tag",
    title: "Corrupted / odd NDEF tag",
    hint: "If readable, expect JS received; if not, watch errors in timeline."
  },
  {
    id: "screen_cycle",
    title: "Screen off / on",
    hint: "Turn screen off and on with tag ready; resume should show ReaderMode enabled."
  },
  {
    id: "bg_fg",
    title: "Background / foreground",
    hint: "Home out and return; ReaderMode should disable then enable; timeline shows transport."
  }
]

function loadMap(): Record<ChecklistItemId, ChecklistStatus> {
  const init: Record<ChecklistItemId, ChecklistStatus> = {
    blank_tag: "pending",
    rapid_tap: "pending",
    hold_test: "pending",
    corrupted_tag: "pending",
    screen_cycle: "pending",
    bg_fg: "pending"
  }
  try {
    const raw = localStorage.getItem(NFC_VALIDATION_CHECKLIST_KEY)
    if (!raw) return init
    const o = JSON.parse(raw) as Record<string, ChecklistStatus>
    for (const k of Object.keys(init) as ChecklistItemId[]) {
      const v = o[k]
      if (v === "pass" || v === "fail" || v === "pending") init[k] = v
    }
  } catch {
    /* ignore */
  }
  return init
}

function saveMap(m: Record<ChecklistItemId, ChecklistStatus>) {
  try {
    localStorage.setItem(NFC_VALIDATION_CHECKLIST_KEY, JSON.stringify(m))
  } catch {
    /* ignore */
  }
}

export function NfcValidationChecklistScreen() {
  const goSettings = useAppStore((s) => s.goSettings)
  const nfcMode = useAppStore((s) => s.nfcMode)
  const setNfcMode = useAppStore((s) => s.setNfcMode)
  const [status, setStatus] = useState<Record<ChecklistItemId, ChecklistStatus>>(loadMap)
  const hud = useMemo(() => isNfcValidationHudEnabled(), [])
  const reportOverlay = useNfcValidationStore((s) => s.reportSystemNfcUiSeen)

  useEffect(() => {
    void getNfcManager().probeNative()
    void getNfcManager().startListening()
  }, [])

  const setOne = useCallback((id: ChecklistItemId, s: ChecklistStatus) => {
    setStatus((prev) => {
      const next = { ...prev, [id]: s }
      saveMap(next)
      return next
    })
  }, [])

  const resetAll = useCallback(() => {
    const next: Record<ChecklistItemId, ChecklistStatus> = {
      blank_tag: "pending",
      rapid_tap: "pending",
      hold_test: "pending",
      corrupted_tag: "pending",
      screen_cycle: "pending",
      bg_fg: "pending"
    }
    setStatus(next)
    saveMap(next)
  }, [])

  return (
    <div className="stack wizard-screen">
      <div className="row-between wizard-header">
        <div>
          <p className="eyebrow">Diagnostics</p>
          <h1 className="h1">NFC validation checklist</h1>
          <p className="muted wizard-lead">
            Pass/fail is stored only on this device ({NFC_VALIDATION_CHECKLIST_KEY}). Use the floating HUD timeline to
            correlate Android system UI with <span className="mono">callback_fired</span>.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={() => goSettings()}>
            Settings
          </button>
        </div>
      </div>

      <div className="panel stack" style={{ borderColor: "var(--accent)" }}>
        <h2 className="h2">Interpretation (isolation)</h2>
        <p className="muted" style={{ marginTop: -6 }}>
          Install the <span className="mono">nfcPure</span> Gradle build (see ARCHITECTURE.md). Test only with the app
          already foreground — no cold NFC launch.
        </p>
        <ul className="muted" style={{ margin: 0, paddingLeft: 20, fontSize: 15 }}>
          <li>
            If <span className="mono">callback_fired</span> appears and the <strong>system NFC sheet still appears</strong>{" "}
            → strong evidence of <strong>OEM / system-level overlay</strong> independent of app dispatch (not solvable
            by manifest/intent tuning on this device).
          </li>
          <li>
            If the overlay <strong>disappears</strong> vs your previous build → residual <strong>dispatch participation</strong>{" "}
            was still contributing before.
          </li>
          <li>
            <span className="mono">PURE_READERMODE_TEST=TRUE</span> in the HUD confirms the isolation APK; logcat tag{" "}
            <span className="mono">NFC_PURE_MODE</span> lines confirm native pure instrumentation.
          </li>
        </ul>
      </div>

      {!hud ? (
        <div className="panel stack" style={{ borderColor: "var(--warn)" }}>
          <p className="muted" style={{ margin: 0 }}>
            Floating HUD is off. For production APKs add <span className="mono">?nfcValidate=1</span> once, or set{" "}
            <span className="mono">VITE_NFC_VALIDATION_HUD=true</span> at build time. Dev server enables HUD
            automatically.
          </p>
        </div>
      ) : null}

      <div className="panel stack">
        <h2 className="h2">Reader setup</h2>
        <p className="muted" style={{ marginTop: -6 }}>
          Native ReaderMode events only fire when <strong>Tablet NFC</strong> is selected and a listening session is
          active (this screen starts one).
        </p>
        <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
          <button
            type="button"
            className={`btn ${nfcMode === "native" ? "btn-primary" : ""}`}
            onClick={() => void setNfcMode("native")}
          >
            Tablet NFC
          </button>
          <button
            type="button"
            className={`btn ${nfcMode === "simulated" ? "btn-primary" : ""}`}
            onClick={() => void setNfcMode("simulated")}
          >
            Simulated
          </button>
        </div>
      </div>

      <div className="panel stack">
        <div className="row-between" style={{ alignItems: "center" }}>
          <h2 className="h2" style={{ margin: 0 }}>
            Field matrix
          </h2>
          <button type="button" className="btn btn-ghost" onClick={resetAll}>
            Reset all
          </button>
        </div>
        <div className="stack" style={{ gap: 12, marginTop: 8 }}>
          {ROWS.map((row) => (
            <div
              key={row.id}
              className="panel-tight stack"
              style={{ borderColor: "var(--border)", background: "rgba(7,9,13,0.35)" }}
            >
              <div className="row-between" style={{ alignItems: "flex-start", gap: 12 }}>
                <div>
                  <strong>{row.title}</strong>
                  <p className="muted" style={{ margin: "6px 0 0", fontSize: 14 }}>
                    {row.hint}
                  </p>
                </div>
                <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                  <button type="button" className="btn btn-primary" onClick={() => setOne(row.id, "pass")}>
                    Pass
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setOne(row.id, "fail")}>
                    Fail
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setOne(row.id, "pending")}>
                    Clear
                  </button>
                </div>
              </div>
              <p className="mono" style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
                Status: <span style={{ color: "var(--text)" }}>{status[row.id]}</span>
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="panel stack">
        <h2 className="h2">OEM overlay capture</h2>
        <p className="muted" style={{ marginTop: -6 }}>
          If you <strong>see</strong> Android&apos;s generic NFC UI but the timeline already shows{" "}
          <span className="mono">callback_fired</span>, tap below immediately — this flags{" "}
          <span className="mono">possible_system_overlay_behavior</span> for correlation (A vs D in your matrix).
        </p>
        <button type="button" className="btn btn-primary" onClick={() => reportOverlay()}>
          I saw system NFC UI right after a scan
        </button>
      </div>
    </div>
  )
}
