import { useMemo, useState } from "react"
import { useRuntimeSession } from "@/store/useRuntimeSession"
import { useAppStore } from "@/store/useAppStore"
import { getRuntimeEngine } from "@/runtime/RuntimeEngine"
import type { RuntimeDebugEntry } from "@/models/runtimeTypes"
import { SnapshotManager } from "@/runtime/snapshots/SnapshotManager"

function formatEntry(e: RuntimeDebugEntry): string {
  switch (e.kind) {
    case "event_in":
      return `→ ${e.event.type} ${JSON.stringify(e.event.payload)}`
    case "execution":
      return `ctx depth=${e.depth} root=${e.rootEventType} triggerEntity=${e.rootPrimaryEntityId ?? "—"} effectSubject=${e.effectSubjectId ?? "—"} player=${e.triggeringPlayerId} · current=${e.currentEventType} ${JSON.stringify(e.currentPayload)}`
    case "rule":
      return `rule PASS ${e.ruleId}: ${e.conditionDetails.join(" · ")}`
    case "rule_skip":
      return `rule skip ${e.ruleId}: ${e.conditionDetails.join(" · ")}`
    case "action":
      return `action [${e.ruleId}] ${e.action.type}: ${e.detail}`
    case "state_mutation":
      return `mutate ${e.sourceAction} [${e.ruleId}] ${e.entityId}.${e.key} ts=${e.timestampMs} ${JSON.stringify(e.before)} → ${JSON.stringify(e.after)}`
    case "warning":
      return `⚠ ${e.text}`
    case "load_warning":
      return `load ⚠ ${e.text}`
    case "dedupe_skip":
      return `dedupe skip ${e.event.type} ${e.detail}`
    case "depth_blocked":
      return `depth block depth=${e.chainDepth} ${e.event.type} — ${e.detail}`
    case "follow_up":
      return `↪ emit (from depth ${e.fromDepth}) ${e.event.type} ${JSON.stringify(e.event.payload)}`
    case "queue_enqueue":
      return `+queue ${e.eventType} depth=${e.chainDepth} len=${e.queueLengthAfter}`
    case "queue_dequeue":
      return `-queue ${e.eventType} depth=${e.chainDepth} len=${e.queueLengthAfter}${e.waitMs != null ? ` wait=${e.waitMs}ms` : ""}`
    case "dispatch_complete":
      return `✓dispatch ${e.eventType} depth=${e.chainDepth} ${e.durationMs}ms rules=${e.rulesMatched}`
    default:
      return JSON.stringify(e)
  }
}

function entryMatchesFilter(e: RuntimeDebugEntry, q: string): boolean {
  if (!q.trim()) return true
  return formatEntry(e).toLowerCase().includes(q.trim().toLowerCase())
}

export function RuntimeDebugPanel() {
  const debugLog = useRuntimeSession((s) => s.debugLog)
  const logFilter = useRuntimeSession((s) => s.logFilter)
  const setLogFilter = useRuntimeSession((s) => s.setLogFilter)
  const lastWarnings = useRuntimeSession((s) => s.lastWarnings)
  const clearRuntimeDebug = useRuntimeSession((s) => s.clearRuntimeDebug)
  const runtimeEnabled = useRuntimeSession((s) => s.runtimeEnabled)
  const setRuntimeEnabled = useRuntimeSession((s) => s.setRuntimeEnabled)
  const runtimePaused = useRuntimeSession((s) => s.runtimePaused)
  const setRuntimePaused = useRuntimeSession((s) => s.setRuntimePaused)
  const runtimeDevToastWarnings = useRuntimeSession((s) => s.runtimeDevToastWarnings)
  const setRuntimeDevToastWarnings = useRuntimeSession((s) => s.setRuntimeDevToastWarnings)
  const runtimeMetrics = useRuntimeSession((s) => s.runtimeMetrics)
  const resetRuntimeMetrics = useRuntimeSession((s) => s.resetRuntimeMetrics)
  const stressRecursive = useRuntimeSession((s) => s.stressRecursive)
  const stressNfcSpam = useRuntimeSession((s) => s.stressNfcSpam)
  const stressDoorScan = useRuntimeSession((s) => s.stressDoorScan)
  const stressQueueFlood = useRuntimeSession((s) => s.stressQueueFlood)
  const stressBulkMutations = useRuntimeSession((s) => s.stressBulkMutations)
  const selectedList = useAppStore((s) => s.selectedList)
  const assignments = useAppStore((s) => s.assignments)
  const lastCanonicalImport = useAppStore((s) => s.lastCanonicalImportResult)
  const canonicalRelationshipGraphJson = useAppStore((s) => s.canonicalRelationshipGraphJson)
  const runtimeEffectTargetEntityId = useAppStore((s) => s.runtimeEffectTargetEntityId)
  const setRuntimeEffectTargetEntityId = useAppStore((s) => s.setRuntimeEffectTargetEntityId)

  const [queueSnap, setQueueSnap] = useState<string>("(flush to refresh)")
  const [traceOn, setTraceOn] = useState(false)
  const [traceVizPreview, setTraceVizPreview] = useState("")
  const filteredLog = useMemo(
    () => debugLog.filter((e) => entryMatchesFilter(e, logFilter)),
    [debugLog, logFilter]
  )

  const bindingObs = useMemo(() => {
    const unitCount = selectedList?.units.length ?? 0
    const assigned = assignments.length
    const unassigned = Math.max(0, unitCount - assigned)
    let relEdges = 0
    let orphanEdges = 0
    if (canonicalRelationshipGraphJson) {
      try {
        const w = JSON.parse(canonicalRelationshipGraphJson) as { edges?: { fromInstanceId: string; toInstanceId: string }[] }
        const edges = Array.isArray(w.edges) ? w.edges : []
        relEdges = edges.length
        const ids = new Set((selectedList?.units ?? []).map((u) => u.id))
        for (const e of edges) {
          if (!ids.has(e.fromInstanceId) || !ids.has(e.toInstanceId)) orphanEdges++
        }
      } catch {
        relEdges = 0
      }
    }
    return { unitCount, assigned, unassigned, relEdges, orphanEdges }
  }, [selectedList, assignments, canonicalRelationshipGraphJson])

  const refreshQueue = () => {
    const q = getRuntimeEngine().getQueueSnapshot()
    setQueueSnap(q.length ? q.map((x) => `${x.event.type}@${x.chainDepth}`).join(", ") : "(empty)")
  }

  const avgDepth =
    runtimeMetrics.queueDepthSamples > 0
      ? (runtimeMetrics.queueDepthSum / runtimeMetrics.queueDepthSamples).toFixed(2)
      : "0"

  return (
    <div className="panel stack runtime-debug">
      <div className="row-between" style={{ alignItems: "flex-start", gap: 12 }}>
        <div>
          <h2 className="h2">Event runtime debug</h2>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
            Queued execution, rule outcomes, mutations, dedupe, depth limits, and stress tools — deterministic runtime
            inspection.
          </p>
        </div>
        <div className="stack" style={{ gap: 8, alignItems: "flex-end" }}>
          <label className="row" style={{ gap: 8, cursor: "pointer", flexShrink: 0 }}>
            <input type="checkbox" checked={runtimeEnabled} onChange={(e) => setRuntimeEnabled(e.target.checked)} />
            <span className="muted" style={{ fontSize: 14 }}>
              Engine on
            </span>
          </label>
          <label className="row" style={{ gap: 8, cursor: "pointer", flexShrink: 0 }}>
            <input type="checkbox" checked={runtimePaused} onChange={(e) => setRuntimePaused(e.target.checked)} />
            <span className="muted" style={{ fontSize: 14 }}>
              Pause runtime
            </span>
          </label>
          <label className="row" style={{ gap: 8, cursor: "pointer", flexShrink: 0 }}>
            <input
              type="checkbox"
              checked={runtimeDevToastWarnings}
              onChange={(e) => setRuntimeDevToastWarnings(e.target.checked)}
            />
            <span className="muted" style={{ fontSize: 14 }}>
              Toast warnings
            </span>
          </label>
        </div>
      </div>

      <div className="panel stack" style={{ gap: 8, padding: 12, background: "var(--bg-muted, rgba(0,0,0,0.04))" }}>
        <div className="muted" style={{ fontSize: 13, fontWeight: 650 }}>
          Metrics
        </div>
        <div className="mono" style={{ fontSize: 12, lineHeight: 1.6 }}>
          events={runtimeMetrics.eventsProcessed} actions={runtimeMetrics.actionsExecuted} mutations=
          {runtimeMetrics.mutationsApplied} warnings={runtimeMetrics.warningsGenerated} dedupeSkips=
          {runtimeMetrics.dedupeSkips}
          <br />
          rule candidates={runtimeMetrics.ruleCandidatesEvaluated} rules passed={runtimeMetrics.rulesPassedAllConditions}{" "}
          cond evals={runtimeMetrics.conditionEvaluations} follow-ups enq={runtimeMetrics.followUpsEnqueued}
          <br />
          dispatch avg ms=
          {runtimeMetrics.dispatchWallSamples > 0
            ? (runtimeMetrics.dispatchWallMsSum / runtimeMetrics.dispatchWallSamples).toFixed(2)
            : "0"}{" "}
          samples={runtimeMetrics.dispatchWallSamples}
          <br />
          queue avg depth={avgDepth} max depth observed={runtimeMetrics.maxQueueDepthObserved} max chain depth=
          {runtimeMetrics.maxChainDepthReached}
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => resetRuntimeMetrics()}>
          Reset metrics
        </button>
      </div>

      <div className="panel stack" style={{ gap: 8, padding: 12, background: "var(--bg-muted, rgba(0,0,0,0.04))" }}>
        <div className="muted" style={{ fontSize: 13, fontWeight: 650 }}>
          Queue snapshot
        </div>
        <div className="mono" style={{ fontSize: 11, wordBreak: "break-all" }}>
          {queueSnap}
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => refreshQueue()}>
          Refresh queue view
        </button>
      </div>

      <div className="panel stack" style={{ gap: 8, padding: 12, background: "var(--bg-muted, rgba(0,0,0,0.04))" }}>
        <div className="muted" style={{ fontSize: 13, fontWeight: 650 }}>
          Replay / snapshot / trace
        </div>
        <div className="row" style={{ flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <label className="row" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={traceOn}
              onChange={(e) => {
                const on = e.target.checked
                getRuntimeEngine().setTracingEnabled(on)
                setTraceOn(on)
                setTraceVizPreview(on ? JSON.stringify(getRuntimeEngine().getTraceGraphViz(), null, 2) : "")
              }}
            />
            <span className="muted" style={{ fontSize: 13 }}>
              Trace graph
            </span>
          </label>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setTraceVizPreview(JSON.stringify(getRuntimeEngine().getTraceGraphViz(), null, 2))}
          >
            Refresh trace JSON
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              const a = document.createElement("a")
              const blob = new Blob([JSON.stringify(getRuntimeEngine().exportRuntimeSnapshot({ assignments }), null, 2)], {
                type: "application/json"
              })
              a.href = URL.createObjectURL(blob)
              a.download = `runtime-snapshot-${Date.now()}.json`
              a.click()
              URL.revokeObjectURL(a.href)
            }}
          >
            Download snapshot
          </button>
          <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
            Import snapshot
            <input
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                void f.text().then((txt) => {
                  try {
                    const snap = SnapshotManager.parse(JSON.parse(txt) as unknown)
                    getRuntimeEngine().importRuntimeSnapshot(snap)
                  } catch (err) {
                    console.error(err)
                  }
                })
              }}
            />
          </label>
        </div>
        <div className="mono" style={{ fontSize: 11, wordBreak: "break-all" }}>
          rng={JSON.stringify(getRuntimeEngine().exportRngState())} · rulesFP={getRuntimeEngine().getRulesFingerprint()} ·
          recording={getRuntimeEngine().isRecordingEnabled() ? "on" : "off"}
        </div>
        {traceVizPreview ? (
          <pre className="mono" style={{ fontSize: 10, maxHeight: 160, overflow: "auto", margin: 0 }}>
            {traceVizPreview}
          </pre>
        ) : null}
        <div className="panel panel-tight" style={{ marginTop: 10 }}>
          <p className="muted" style={{ margin: "0 0 6px", fontSize: 12 }}>
            Import / NFC (generic)
          </p>
          <p className="mono" style={{ fontSize: 11, margin: 0, wordBreak: "break-word" }}>
            units={bindingObs.unitCount} · tags linked={bindingObs.assigned} · pending slots≈{bindingObs.unassigned} ·
            rel edges={bindingObs.relEdges} · rel/orphan mismatch={bindingObs.orphanEdges}
          </p>
          {lastCanonicalImport && lastCanonicalImport.ok ? (
            <p className="mono" style={{ fontSize: 11, margin: "6px 0 0" }}>
              last import {lastCanonicalImport.packageId}: {lastCanonicalImport.metrics.entityCount} ent /{" "}
              {lastCanonicalImport.metrics.edgeCount} edges / {lastCanonicalImport.metrics.durationMs.toFixed(1)} ms
            </p>
          ) : null}
          <div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!canonicalRelationshipGraphJson}
              onClick={() => {
                if (!canonicalRelationshipGraphJson) return
                const blob = new Blob([canonicalRelationshipGraphJson], { type: "application/json" })
                const a = document.createElement("a")
                a.href = URL.createObjectURL(blob)
                a.download = `relationship-graph-${Date.now()}.json`
                a.click()
                URL.revokeObjectURL(a.href)
              }}
            >
              Download relationship graph JSON
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!selectedList}
              onClick={() => {
                if (!selectedList) return
                const blob = new Blob(
                  [
                    JSON.stringify(
                      {
                        schemaVersion: 1,
                        listId: selectedList.id,
                        units: selectedList.units.map((u) => ({
                          id: u.id,
                          name: u.name,
                          entityType: u.entityType,
                          packageId: u.packageId,
                          templateId: u.templateId,
                          tags: u.tags
                        }))
                      },
                      null,
                      2
                    )
                  ],
                  { type: "application/json" }
                )
                const a = document.createElement("a")
                a.href = URL.createObjectURL(blob)
                a.download = `canonical-entity-export-${Date.now()}.json`
                a.click()
                URL.revokeObjectURL(a.href)
              }}
            >
              Export canonical unit graph JSON
            </button>
          </div>
        </div>
      </div>

      {lastWarnings.length ? (
        <div className="validate-banner validate-banner-bad" role="alert">
          {lastWarnings.join(" · ")}
        </div>
      ) : null}

      <div className="field">
        <label className="muted" style={{ fontSize: 13 }} htmlFor="runtime-effect-target">
          Optional JSON <span className="mono">selected_entity</span> override (nfc.scan)
        </label>
        <input
          id="runtime-effect-target"
          type="text"
          className="entity-search"
          placeholder={selectedList ? "Blank = linked entity id" : "Load a list first"}
          disabled={!selectedList}
          value={runtimeEffectTargetEntityId ?? ""}
          onChange={(e) => setRuntimeEffectTargetEntityId(e.target.value.trim() ? e.target.value.trim() : null)}
          aria-label="Runtime effect target entity id override"
        />
        <p className="muted" style={{ margin: "6px 0 0", fontSize: 12 }}>
          Leave blank so <span className="mono">selected_entity</span> matches the unit you linked. Enter another unit
          id (e.g. <span className="mono">scv-u01</span>) for trap-style routing.
        </p>
      </div>

      <div className="field">
        <label className="muted" style={{ fontSize: 13 }} htmlFor="runtime-log-filter">
          Log filter
        </label>
        <input
          id="runtime-log-filter"
          type="search"
          className="entity-search"
          placeholder="Filter log (entity id, event type, rule id, …)"
          value={logFilter}
          onChange={(e) => setLogFilter(e.target.value)}
          aria-label="Filter runtime log"
        />
      </div>

      <details className="muted" style={{ fontSize: 13 }}>
        <summary>Stress tools (dev)</summary>
        <div className="stack" style={{ marginTop: 10, gap: 10 }}>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Requires a loaded list. Uses the same engine queue as production paths.
          </p>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              className="btn"
              disabled={!selectedList}
              onClick={() => {
                stressRecursive(assignments)
                refreshQueue()
              }}
            >
              Recursive A→B→C→A
            </button>
            <button
              type="button"
              className="btn"
              disabled={!selectedList}
              onClick={() => {
                const id = selectedList?.units[0]?.id
                if (id) stressNfcSpam(assignments, id, 40)
                refreshQueue()
              }}
            >
              NFC spam (40)
            </button>
            <button
              type="button"
              className="btn"
              disabled={!selectedList}
              onClick={() => {
                stressDoorScan(assignments)
                refreshQueue()
              }}
            >
              Door chain replay
            </button>
            <button
              type="button"
              className="btn"
              disabled={!selectedList}
              onClick={() => {
                stressQueueFlood(assignments, 200)
                refreshQueue()
              }}
            >
              Queue flood (200)
            </button>
            <button
              type="button"
              className="btn"
              disabled={!selectedList}
              onClick={() => {
                const ids = selectedList?.units.map((u) => u.id) ?? []
                stressBulkMutations(ids.slice(0, 24))
                refreshQueue()
              }}
            >
              Bulk mutation (≤24 ids)
            </button>
          </div>
        </div>
      </details>

      <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
        <button type="button" className="btn btn-ghost" onClick={() => clearRuntimeDebug()}>
          Clear log
        </button>
      </div>

      <div className="runtime-debug-log mono" aria-live="polite">
        {filteredLog.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            {debugLog.length === 0
              ? "No runtime activity yet."
              : "No log lines match the filter. Clear the filter or run activity."}
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.55, maxHeight: 360, overflow: "auto" }}>
            {filteredLog.map((e, i) => (
              <li key={`${e.at}-${i}`}>{formatEntry(e)}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
