import { useEffect, useRef, useState } from "react"
import { useAppStore } from "@/store/useAppStore"

export function ValidateScreen() {
  const list = useAppStore((s) => s.selectedList)
  const faction = useAppStore((s) => s.selectedFaction)
  const system = useAppStore((s) => s.selectedSystem)
  const assignments = useAppStore((s) => s.assignments)
  const nfcMode = useAppStore((s) => s.nfcMode)
  const nativeNfcAvailable = useAppStore((s) => s.nativeNfcAvailable)
  const validationListening = useAppStore((s) => s.validationListening)
  const validationRowStatus = useAppStore((s) => s.validationRowStatus)
  const validationBanner = useAppStore((s) => s.validationBanner)
  const validationFocusEntityId = useAppStore((s) => s.validationFocusEntityId)
  const validationGlowEntityId = useAppStore((s) => s.validationGlowEntityId)
  const validationLastTagLabel = useAppStore((s) => s.validationLastTagLabel)
  const validationPhase = useAppStore((s) => s.validationPhase)
  const goNfcWorkspace = useAppStore((s) => s.goNfcWorkspace)
  const goList = useAppStore((s) => s.goList)
  const startValidationListening = useAppStore((s) => s.startValidationListening)
  const stopValidationListening = useAppStore((s) => s.stopValidationListening)
  const resetValidationProgress = useAppStore((s) => s.resetValidationProgress)
  const resetValidationRow = useAppStore((s) => s.resetValidationRow)
  const setValidationFocusEntityId = useAppStore((s) => s.setValidationFocusEntityId)
  const simulateUidInput = useAppStore((s) => s.simulateUidInput)
  const setNfcMode = useAppStore((s) => s.setNfcMode)
  const validationLastTagUid = useAppStore((s) => s.validationLastTagUid)

  const listScrollRef = useRef<HTMLDivElement>(null)
  const [manualUid, setManualUid] = useState("")

  useEffect(() => {
    if (!validationGlowEntityId) return
    const el = listScrollRef.current?.querySelector(`[data-entity-row="${validationGlowEntityId}"]`)
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [validationGlowEntityId])

  if (!list || !faction || !system) {
    return (
      <div className="stack wizard-screen">
        <p className="muted">No army loaded.</p>
        <button type="button" className="btn" onClick={() => goList()}>
          Choose an army
        </button>
      </div>
    )
  }

  const byEntity = new Map(assignments.map((a) => [a.entityId, a]))
  const linkedUnits = list.units.filter((u) => byEntity.has(u.id))
  const totalLinked = linkedUnits.length
  const verifiedCount = linkedUnits.filter((u) => validationRowStatus[u.id] === "verified").length
  const progress = totalLinked === 0 ? 0 : Math.round((verifiedCount / totalLinked) * 100)

  const scanVisual =
    validationListening && validationPhase !== "complete"
      ? "panel scan-ready validate-scan-panel"
      : "panel scan-idle validate-scan-panel"

  const readyHeadline =
    validationPhase === "complete"
      ? "Done"
      : validationListening
        ? "Ready to scan"
        : "Reader idle"

  return (
    <div className="stack wizard-screen validate-screen">
      <div className="row-between wizard-header">
        <div>
          <p className="eyebrow">Table check</p>
          <h1 className="h1">Verify tags</h1>
          <p className="muted wizard-context">
            {system.name} · {faction.name}
          </p>
          <p className="muted wizard-lead">
            Scan each physical tag to confirm it matches the unit linked in this app — like a roster check at an event.
          </p>
        </div>
        <div className="row" style={{ flexWrap: "wrap", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={() => void goNfcWorkspace()}>
            Return to assignment
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => goList()}>
            Change army
          </button>
        </div>
      </div>

      <div className="panel validate-army-banner">
        <div className="row-between" style={{ alignItems: "flex-start", gap: 12 }}>
          <div>
            <p className="eyebrow" style={{ marginBottom: 6 }}>
              Army
            </p>
            <div className="validate-army-title">{list.name}</div>
            <p className="muted" style={{ margin: "6px 0 0", fontSize: 15 }}>
              {faction.name}
            </p>
          </div>
          {validationPhase === "complete" ? (
            <div className="validate-complete-badge" aria-hidden="true">
              All clear
            </div>
          ) : null}
        </div>
      </div>

      <div className="panel validate-progress">
        <div className="row-between" style={{ marginBottom: 10 }}>
          <span className="muted" style={{ fontSize: 15, fontWeight: 600 }}>
            Validation progress
          </span>
          <span className="validate-progress-count" aria-live="polite">
            Validated: {verifiedCount} / {totalLinked} {totalLinked === 1 ? "unit" : "units"}
          </span>
        </div>
        <div className="validate-progress-track" aria-hidden="true">
          <div className="validate-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        {totalLinked === 0 ? (
          <p className="muted" style={{ margin: "12px 0 0", fontSize: 15 }}>
            Link at least one unit before running a table check.
          </p>
        ) : null}
      </div>

      {validationBanner ? (
        <div
          className={
            validationBanner.tone === "ok"
              ? "validate-banner validate-banner-ok"
              : validationBanner.tone === "bad"
                ? "validate-banner validate-banner-bad"
                : "validate-banner validate-banner-neutral"
          }
          role={validationBanner.tone === "bad" ? "alert" : "status"}
        >
          {validationBanner.text}
        </div>
      ) : null}

      <div className="validate-layout">
        <div className="panel validate-checklist">
          <h2 className="h2">Unit checklist</h2>
          <p className="muted validate-checklist-lead">
            {validationFocusEntityId
              ? "Only the highlighted unit will count as a match for the next scan. Tap again to clear."
              : "Any linked tag can be scanned in any order."}
          </p>
          <div className="validate-unit-scroll" ref={listScrollRef}>
            <div className="stack validate-unit-stack">
              {list.units.map((u) => {
                const a = byEntity.get(u.id)
                const linkStatus = !a ? "absent" : validationRowStatus[u.id] ?? "pending"
                const focus = validationFocusEntityId === u.id
                const glow = validationGlowEntityId === u.id
                const rowClass = [
                  "validate-unit-row",
                  linkStatus === "verified" ? "validate-unit-verified" : "",
                  linkStatus === "problem" ? "validate-unit-problem" : "",
                  linkStatus === "absent" ? "validate-unit-nolink" : "",
                  focus ? "validate-unit-focus" : "",
                  glow ? "validate-unit-glow" : ""
                ]
                  .filter(Boolean)
                  .join(" ")

                return (
                  <div key={u.id} className={rowClass} data-entity-row={u.id}>
                    <div className="validate-unit-main">
                      <div className="validate-unit-status" aria-hidden="true">
                        {linkStatus === "absent" ? (
                          <span className="validate-icon muted">○</span>
                        ) : linkStatus === "verified" ? (
                          <span className="validate-icon validate-icon-ok">✓</span>
                        ) : linkStatus === "problem" ? (
                          <span className="validate-icon validate-icon-warn">⚠</span>
                        ) : (
                          <span className="validate-icon muted">○</span>
                        )}
                      </div>
                      <div>
                        <div className="validate-unit-name">{u.name}</div>
                        {linkStatus === "absent" ? (
                          <div className="muted validate-unit-sub">No tag linked</div>
                        ) : linkStatus === "verified" ? (
                          <div className="validate-unit-sub ok">Verified</div>
                        ) : linkStatus === "problem" ? (
                          <div className="validate-unit-sub bad">Needs fix in assignment</div>
                        ) : (
                          <div className="muted validate-unit-sub">Not checked</div>
                        )}
                      </div>
                    </div>
                    {a ? (
                      <div className="validate-unit-actions">
                        <button
                          type="button"
                          className={`btn btn-ghost btn-compact ${focus ? "btn-primary" : ""}`}
                          onClick={() => setValidationFocusEntityId(u.id)}
                        >
                          {focus ? "Checking this unit" : "Check this unit"}
                        </button>
                        {linkStatus === "verified" ? (
                          <button type="button" className="btn btn-ghost btn-compact" onClick={() => resetValidationRow(u.id)}>
                            Re-scan
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
          <div className="row" style={{ flexWrap: "wrap", gap: 10, marginTop: 14 }}>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={totalLinked === 0 || validationListening}
              onClick={() => resetValidationProgress()}
            >
              Reset check
            </button>
          </div>
        </div>

        <div className={scanVisual}>
          <div className="row-between" style={{ marginBottom: 10 }}>
            <div>
              <p className="eyebrow" style={{ marginBottom: 4 }}>
                Scan status
              </p>
              <div style={{ fontWeight: 700, fontSize: 20 }}>{readyHeadline}</div>
            </div>
          </div>

          <p className="muted" style={{ fontSize: 15, marginBottom: 14, lineHeight: 1.5 }}>
            {validationPhase === "complete"
              ? "You can run the check again after changing models on the table."
              : validationListening
                ? "Hold each tag to the reader. The matching unit will flash and move forward in the checklist."
                : 'Tap “Start validation” when you’re at the table. This does not change any links — it only checks them.'}
          </p>

          <div className="row-between" style={{ gap: 12, flexWrap: "wrap" }}>
            {validationListening ? (
              <button type="button" className="btn btn-primary btn-lg" onClick={() => void stopValidationListening()}>
                Stop validation
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-lg"
                disabled={totalLinked === 0 || validationPhase === "complete"}
                onClick={() => void startValidationListening()}
              >
                Start validation
              </button>
            )}
            {validationPhase === "complete" ? (
              <button type="button" className="btn btn-lg" onClick={() => resetValidationProgress()}>
                Run again
              </button>
            ) : null}
          </div>

          <div className="divider" />

          <div className="stack" style={{ gap: 8 }}>
            <div className="row-between">
              <span className="muted">Last tag</span>
              <span
                className="mono tag-uid-compact"
                title={validationLastTagUid ? `Full tag: ${validationLastTagUid}` : undefined}
              >
                {validationLastTagLabel || "—"}
              </span>
            </div>
            <div className="muted" style={{ fontSize: 14 }}>
              {validationListening
                ? "Listening for tags — hold each mini’s tag to the reader."
                : validationPhase === "complete"
                  ? "Reader off — verification finished."
                  : "Reader off — tap Start validation when ready."}
            </div>
          </div>

          <details className="scan-advanced" style={{ marginTop: 12 }}>
            <summary>Practice &amp; reader options</summary>
            <div className="stack" style={{ marginTop: 12, gap: 12 }}>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                Use practice mode to simulate taps when you don’t have a reader. NFC mode is shared with assignment
                — only one session runs at a time.
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
              {nfcMode === "simulated" && validationListening ? (
                <button type="button" className="btn" onClick={() => simulateUidInput("04:A3:92:11:22:33:90")}>
                  Simulate a tag tap
                </button>
              ) : null}
              <div className="field">
                <label className="muted" htmlFor="validate-manual-uid">
                  Or type a tag code (practice)
                </label>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <input
                    id="validate-manual-uid"
                    placeholder="Tag code"
                    value={manualUid}
                    onChange={(e) => setManualUid(e.target.value)}
                    style={{ flex: "1 1 220px" }}
                  />
                  <button
                    type="button"
                    className="btn"
                    disabled={!validationListening}
                    onClick={() => {
                      simulateUidInput(manualUid)
                      setManualUid("")
                    }}
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>

      {validationPhase === "complete" ? (
        <div className="panel validate-done-card">
          <p className="eyebrow">Complete</p>
          <h2 className="h2" style={{ marginTop: 4 }}>
            Army verification complete
          </h2>
          <p className="muted" style={{ fontSize: 16, lineHeight: 1.5 }}>
            All linked units were scanned and matched the tags on file for this army.
          </p>
          <div className="row" style={{ flexWrap: "wrap", gap: 10, marginTop: 8 }}>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => void goNfcWorkspace()}>
              Return to assignment
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
