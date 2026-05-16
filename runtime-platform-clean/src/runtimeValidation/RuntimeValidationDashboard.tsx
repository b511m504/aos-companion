import { useEffect, useRef, useState } from "react"
import { useAppStore } from "@/store/useAppStore"
import { getNfcManager } from "@/services/NFCManager"
import { useRuntimeSession } from "@/store/useRuntimeSession"
import { getRuntimeValidationEngine } from "@/runtimeValidation/RuntimeValidationEngine"
import { RUNTIME_VALIDATION_SCENARIOS } from "@/runtimeValidation/scenarios/presets"
import { useRuntimeValidationStore } from "@/runtimeValidation/runtimeValidationStore"
import { injectSyntheticNfcEvent, buildSyntheticCanonicalTagPayload } from "@/runtimeValidation/syntheticNfc"
import { RuntimeReplayPlayer } from "@/runtimeValidation/RuntimeReplayPlayer"

export function RuntimeValidationDashboard() {
  const goSettings = useAppStore((s) => s.goSettings)
  const selectedList = useAppStore((s) => s.selectedList)
  const selectedSystem = useAppStore((s) => s.selectedSystem)
  const assignments = useAppStore((s) => s.assignments)
  const bootstrapRuntimeIfNeeded = useRuntimeSession((s) => s.bootstrapRuntimeIfNeeded)
  const runtimeEnabled = useRuntimeSession((s) => s.runtimeEnabled)
  const setRuntimeEnabled = useRuntimeSession((s) => s.setRuntimeEnabled)

  const runningScenarioId = useRuntimeValidationStore((s) => s.runningScenarioId)
  const lastResult = useRuntimeValidationStore((s) => s.lastResult)
  const lastInv = useRuntimeValidationStore((s) => s.lastInvariantSnapshot)
  const log = useRuntimeValidationStore((s) => s.log)
  const runScenario = useRuntimeValidationStore((s) => s.runScenario)
  const toggleContinuous = useRuntimeValidationStore((s) => s.toggleContinuous)
  const exportForensic = useRuntimeValidationStore((s) => s.exportForensic)
  const exportJournal = useRuntimeValidationStore((s) => s.exportJournal)
  const importJournalJson = useRuntimeValidationStore((s) => s.importJournalJson)
  const healDedupe = useRuntimeValidationStore((s) => s.healDedupe)
  const healNfcRestart = useRuntimeValidationStore((s) => s.healNfcRestart)
  const healUnpause = useRuntimeValidationStore((s) => s.healUnpause)
  const tickInvariants = useRuntimeValidationStore((s) => s.tickInvariants)
  const clearLog = useRuntimeValidationStore((s) => s.clearLog)

  const [syntheticUid, setSyntheticUid] = useState("04:01:02:03:04:05:06")
  const fileRef = useRef<HTMLInputElement>(null)
  const eng = getRuntimeValidationEngine()
  const continuous = eng.isContinuousMode()

  useEffect(() => {
    const id = window.setInterval(() => tickInvariants(), 4000)
    return () => window.clearInterval(id)
  }, [tickInvariants])

  useEffect(() => {
    if (!selectedList || !selectedSystem) return
    void bootstrapRuntimeIfNeeded({
      systemId: selectedSystem.id,
      list: selectedList,
      assignments
    })
  }, [assignments, bootstrapRuntimeIfNeeded, selectedList, selectedSystem])

  return (
    <div className="stack wizard-screen">
      <div className="row-between wizard-header">
        <div>
          <p className="eyebrow">Diagnostics</p>
          <h1 className="h1">Runtime validation</h1>
          <p className="muted wizard-lead">
            Deterministic stress, synthetic NFC (canonical pipeline), invariants, replay journal, and self-heal hooks.
            Enable runtime for list-backed engine checks.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={() => goSettings()}>
            Settings
          </button>
        </div>
      </div>

      <div className="panel stack">
        <h2 className="h2">Runtime session</h2>
        <label className="row" style={{ gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={runtimeEnabled}
            onChange={(e) => setRuntimeEnabled(e.target.checked)}
          />
          <span>Runtime enabled (required for queue / NFC spam scenarios)</span>
        </label>
        {!selectedList || !selectedSystem ? (
          <p className="muted">Select a system + list from the main flow for full engine bootstrap.</p>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Bootstrapped context: {selectedSystem.name} · {selectedList.name}
          </p>
        )}
      </div>

      <div className="panel stack">
        <h2 className="h2">NFC synthetic (canonical)</h2>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input
            className="input"
            style={{ minWidth: 220 }}
            value={syntheticUid}
            onChange={(e) => setSyntheticUid(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              void getNfcManager().startListening()
              injectSyntheticNfcEvent(buildSyntheticCanonicalTagPayload({ uid: syntheticUid }))
              eng.journal.record("nfc.synthetic", "manual_inject", { uid: syntheticUid })
            }}
          >
            Inject synthetic tag
          </button>
        </div>
      </div>

      <div className="panel stack">
        <h2 className="h2">Chaos scenarios</h2>
        <p className="muted" style={{ marginTop: -6 }}>
          Runs scripted stress without physical taps. NFC scenarios start listening if needed.
        </p>
        <div className="stack" style={{ gap: 10 }}>
          {RUNTIME_VALIDATION_SCENARIOS.map((s) => (
            <div key={s.id} className="row-between" style={{ alignItems: "flex-start", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{s.title}</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {s.describe}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={runningScenarioId !== null}
                onClick={() => void runScenario(s.id)}
              >
                Run
              </button>
            </div>
          ))}
        </div>
        {runningScenarioId ? <p className="muted">Running: {runningScenarioId}…</p> : null}
        {lastResult ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            Last: {lastResult.id} → {lastResult.status} in {lastResult.durationMs.toFixed(1)} ms
            {lastResult.error ? ` · ${lastResult.error}` : ""}
          </p>
        ) : null}
      </div>

      <div className="panel stack">
        <h2 className="h2">Continuous monitoring</h2>
        <button type="button" className="btn btn-ghost" onClick={() => toggleContinuous()}>
          {continuous ? "Stop health / longtask sampling" : "Start health / longtask sampling"}
        </button>
      </div>

      <div className="panel stack">
        <h2 className="h2">Invariants</h2>
        {lastInv.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No structural violations detected (last tick).
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {lastInv.map((x) => (
              <li key={x.id}>
                <span className="mono">{x.id}</span> — {x.detail}
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="btn btn-ghost" onClick={() => tickInvariants()}>
          Check now
        </button>
      </div>

      <div className="panel stack">
        <h2 className="h2">Self-heal (logged)</h2>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-ghost" onClick={() => void healDedupe()}>
            Clear NFC dedupe
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void healNfcRestart()}>
            Restart NFC session
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => healUnpause()}>
            Unpause runtime
          </button>
        </div>
      </div>

      <div className="panel stack">
        <h2 className="h2">Replay journal</h2>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-ghost" onClick={() => exportJournal()}>
            Export journal JSON
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              const snap = eng.journal.snapshot().filter((e) => e.kind === "nfc.synthetic")
              void new RuntimeReplayPlayer().play(snap, { delayMsBetweenSteps: 5 })
            }}
          >
            Replay synthetic NFC entries
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(ev) => {
              const f = ev.target.files?.[0]
              if (!f) return
              const r = new FileReader()
              r.onload = () => {
                importJournalJson(String(r.result ?? ""))
                ev.target.value = ""
              }
              r.readAsText(f)
            }}
          />
          <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
            Import journal JSON
          </button>
        </div>
      </div>

      <div className="panel stack">
        <h2 className="h2">Forensic export</h2>
        <button type="button" className="btn btn-primary" onClick={() => exportForensic()}>
          Download forensic report (JSON)
        </button>
      </div>

      <div className="panel stack">
        <div className="row-between">
          <h2 className="h2" style={{ margin: 0 }}>
            Harness log
          </h2>
          <button type="button" className="btn btn-ghost" onClick={() => clearLog()}>
            Clear
          </button>
        </div>
        <pre
          className="mono"
          style={{
            margin: 0,
            maxHeight: 220,
            overflow: "auto",
            fontSize: 12,
            background: "rgba(0,0,0,0.35)",
            padding: 10,
            borderRadius: 8
          }}
        >
          {log.length ? log.join("\n") : "—"}
        </pre>
      </div>
    </div>
  )
}
