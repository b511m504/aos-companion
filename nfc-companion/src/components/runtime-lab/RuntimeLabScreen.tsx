import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAppStore } from "@/store/useAppStore"
import { useRuntimeSession } from "@/store/useRuntimeSession"
import { buildPackageIndex, type PackageSummary } from "@/services/packageIndexService"
import { viteBaseUrl } from "@/runtime/viteEnv"
import { PackageBrowserPanel } from "@/components/runtime-lab/PackageBrowserPanel"
import { CanonicalGraphViewer } from "@/components/runtime-lab/CanonicalGraphViewer"
import { RuntimeEventFlowView } from "@/components/runtime-lab/RuntimeEventFlowView"
import { QueueAnalyticsPanel } from "@/components/runtime-lab/QueueAnalyticsPanel"
import { SimulationControlPanel } from "@/components/runtime-lab/SimulationControlPanel"
import { CertificationDashboard } from "@/components/runtime-lab/CertificationDashboard"
import { MockPackageWorkbench } from "@/components/runtime-lab/MockPackageWorkbench"
import { DevWorkflowPanel } from "@/components/runtime-lab/DevWorkflowPanel"
import { GenericPrimitivesPanel } from "@/components/runtime-lab/GenericPrimitivesPanel"
import { getRuntimeEngine } from "@/runtime/RuntimeEngine"
import { SnapshotManager } from "@/runtime/snapshots/SnapshotManager"
import { exportReplayBundle, serializeReplayBundle } from "@/runtime/replay/replayBundle"
import { ReplayRecorder } from "@/runtime/replay/ReplayRecorder"
import { APP_VERSION } from "@/buildInfo"
import { ImportSessionManager } from "@/content-import/ImportSessionManager"
import { parseImportAdapterJson } from "@/content-import/ImportRegistry"
import { EntityRelationshipGraph } from "@/runtime/relationships/EntityRelationshipGraph"
import { entityIdSet } from "@/utils/entityLookup"
import type { ArmyList } from "@/models/types"

const EMPTY_LIST: ArmyList = { id: "_", name: "_", factionId: "_", units: [] }
const RECORDER_FALLBACK: ArmyList = {
  id: "runtime-lab",
  name: "Runtime lab",
  factionId: "lab",
  units: [{ id: "lab-e1", name: "Lab entity", tags: ["lab"] }]
}

type TabId =
  | "packages"
  | "graph"
  | "flow"
  | "queue"
  | "sim"
  | "bundle"
  | "cert"
  | "bench"
  | "dev"
  | "primitives"

export function RuntimeLabScreen() {
  const goStart = useAppStore((s) => s.goStart)
  const goSettings = useAppStore((s) => s.goSettings)
  const selectedList = useAppStore((s) => s.selectedList)
  const assignments = useAppStore((s) => s.assignments)
  const selectedSystem = useAppStore((s) => s.selectedSystem)
  const graphJson = useAppStore((s) => s.canonicalRelationshipGraphJson)
  const lastImport = useAppStore((s) => s.lastCanonicalImportResult)
  const setCanonicalImportPackageId = useAppStore((s) => s.setCanonicalImportPackageId)
  const setCanonicalImportPayloadJson = useAppStore((s) => s.setCanonicalImportPayloadJson)
  const runCanonicalJsonImport = useAppStore((s) => s.runCanonicalJsonImport)
  const goNfc = useAppStore((s) => s.goNfcWorkspace)
  const importReplayBundleFromFile = useAppStore((s) => s.importReplayBundleFromFile)

  const debugLog = useRuntimeSession((s) => s.debugLog)
  const runtimeMetrics = useRuntimeSession((s) => s.runtimeMetrics)

  const [tab, setTab] = useState<TabId>("packages")
  const [index, setIndex] = useState<PackageSummary[]>([])
  const [indexErr, setIndexErr] = useState<string | null>(null)
  const [selectedPkg, setSelectedPkg] = useState<string | null>(null)
  const [labPreviewGraph, setLabPreviewGraph] = useState<string | null>(null)
  const [templatesJson, setTemplatesJson] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const recorderRef = useRef<ReplayRecorder | null>(null)

  const site = useMemo(() => viteBaseUrl().replace(/\/?$/, "/"), [])

  useEffect(() => {
    void buildPackageIndex().then((r) => {
      if (r.ok) {
        setIndex(r.packages)
        setIndexErr(null)
      } else setIndexErr(r.error)
    })
  }, [])

  const selectedSummary = useMemo(() => index.find((p) => p.packageId === selectedPkg) ?? null, [index, selectedPkg])

  const listIds = useMemo(() => entityIdSet(selectedList ?? EMPTY_LIST), [selectedList])

  const loadTemplates = useCallback(async () => {
    if (!selectedPkg) return
    const url = `${site}packages/${selectedPkg}/entities/templates.json`.replace(/\/{2,}/g, "/")
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) {
      setTemplatesJson(null)
      return
    }
    setTemplatesJson(await res.text())
  }, [selectedPkg, site])

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  const loadSampleToImportBuffer = useCallback(async () => {
    if (!selectedPkg) return
    const url = `${site}packages/${selectedPkg}/sample_lists/default.json`.replace(/\/{2,}/g, "/")
    const txt = await fetch(url).then((r) => r.text())
    setCanonicalImportPackageId(selectedPkg)
    setCanonicalImportPayloadJson(txt)
    setTab("cert")
  }, [selectedPkg, setCanonicalImportPackageId, setCanonicalImportPayloadJson, site])

  const previewRelationships = useCallback(async () => {
    if (!selectedPkg) return
    const [adRaw, listRaw] = await Promise.all([
      fetch(`${site}packages/${selectedPkg}/imports/jsonRosterAdapter.json`).then((r) => r.json()),
      fetch(`${site}packages/${selectedPkg}/sample_lists/default.json`).then((r) => r.json())
    ])
    const adapter = parseImportAdapterJson(adRaw)
    if (!adapter) {
      setLabPreviewGraph(null)
      return
    }
    const session = ImportSessionManager.runJsonRoster({ raw: listRaw, adapter })
    if (!session.ok) {
      setLabPreviewGraph(JSON.stringify({ ok: false, errors: session.errors }, null, 2))
      return
    }
    const g = EntityRelationshipGraph.fromImportGraph(session.graph)
    setLabPreviewGraph(g.toJson())
  }, [selectedPkg, site])

  const startRecording = () => {
    const eng = getRuntimeEngine()
    const rec = new ReplayRecorder()
    const listForRec = selectedList ?? RECORDER_FALLBACK
    rec.begin({
      runtimeVersion: APP_VERSION,
      seed: "runtime-lab",
      rngStateInitial: eng.exportRngState(),
      timeMode: "logical",
      systemId: selectedSystem?.id ?? "runtime_lab",
      list: listForRec,
      assignments,
      rules: [...eng.getRules()]
    })
    eng.attachReplayRecorder(rec)
    eng.setRecordingEnabled(true)
    recorderRef.current = rec
    setRecording(true)
  }

  const stopRecording = () => {
    const eng = getRuntimeEngine()
    eng.setRecordingEnabled(false)
    eng.attachReplayRecorder(null)
    setRecording(false)
  }

  const exportBundle = () => {
    const eng = getRuntimeEngine()
    const sm = new SnapshotManager(4)
    const snap = sm.saveState(eng, { assignments })
    const bundle = exportReplayBundle({
      recorder: recorderRef.current,
      snapshots: [snap],
      list: selectedList,
      assignments,
      systemId: selectedSystem?.id ?? null,
      relationshipGraphJson: graphJson,
      lastImportOk: lastImport ? lastImport.ok : null,
      lastImportErrors: lastImport && !lastImport.ok ? lastImport.errors : [],
      label: "runtime-lab-export"
    })
    const blob = new Blob([serializeReplayBundle(bundle)], { type: "application/json" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `session-${Date.now()}.replaybundle`
    a.click()
    URL.revokeObjectURL(a.href)
    recorderRef.current = null
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "packages", label: "Packages" },
    { id: "graph", label: "Relationships" },
    { id: "flow", label: "Event flow" },
    { id: "queue", label: "Queue analytics" },
    { id: "sim", label: "Simulation" },
    { id: "bundle", label: "Replay bundle" },
    { id: "cert", label: "Certification" },
    { id: "bench", label: "Mock workbench" },
    { id: "dev", label: "Dev" },
    { id: "primitives", label: "RPG primitives" }
  ]

  return (
    <div className="stack wizard-screen">
      <div className="row-between wizard-header">
        <div>
          <p className="eyebrow">Runtime lab</p>
          <h1 className="h1">Package runtime</h1>
          <p className="muted wizard-lead">
            Deterministic engine surface: packages, graphs, diagnostics, isolated simulation, and replay bundles — system agnostic.
          </p>
        </div>
        <div className="row" style={{ flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={() => goSettings()}>
            Settings
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => goStart()}>
            Home
          </button>
        </div>
      </div>

      <div className="row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? "btn btn-primary" : "btn btn-ghost"}
            onClick={() => setTab(t.id)}
            style={{ fontSize: 13 }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "packages" ? (
        <div className="stack" style={{ gap: 16 }}>
          {indexErr ? <p className="banner-error">{indexErr}</p> : null}
          <PackageBrowserPanel packages={index} selectedId={selectedPkg} onSelect={setSelectedPkg} />
          {selectedSummary ? (
            <div className="panel panel-tight stack" style={{ gap: 10 }}>
              <h2 className="h2" style={{ fontSize: 18, margin: 0 }}>
                Package detail
              </h2>
              <p className="mono muted" style={{ fontSize: 12, margin: 0 }}>
                rule files (registry): {selectedSummary.ruleFileCount} · NFC: {String(selectedSummary.supportsNfc ?? "—")} · systemId:{" "}
                {selectedSummary.systemId ?? "—"}
              </p>
              <details>
                <summary className="muted">manifest.json</summary>
                <pre className="mono" style={{ fontSize: 10, maxHeight: 220, overflow: "auto" }}>
                  {JSON.stringify(selectedSummary.manifest, null, 2)}
                </pre>
              </details>
              <details open={false}>
                <summary className="muted">entities/templates.json</summary>
                <pre className="mono" style={{ fontSize: 10, maxHeight: 220, overflow: "auto" }}>
                  {templatesJson ?? "(not loaded or missing)"}
                </pre>
              </details>
              <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                <button type="button" className="btn" onClick={() => void loadSampleToImportBuffer()}>
                  Load sample into import buffer
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => void previewRelationships()}>
                  Preview relationship graph
                </button>
                <button type="button" className="btn btn-primary" disabled={!selectedList} onClick={() => goNfc()}>
                  Open assignment workspace
                </button>
                <button type="button" className="btn" onClick={() => void runCanonicalJsonImport()}>
                  Run canonical import (from Settings buffer)
                </button>
              </div>
            </div>
          ) : (
            <p className="muted">Select a package card for manifest detail and actions.</p>
          )}
        </div>
      ) : null}

      {tab === "graph" ? (
        <div className="stack" style={{ gap: 12 }}>
          <p className="muted" style={{ fontSize: 13 }}>
            Live graph from last successful import, or lab preview from the Packages tab.
          </p>
          <CanonicalGraphViewer graphJson={graphJson ?? labPreviewGraph} listUnitIds={listIds} />
        </div>
      ) : null}

      {tab === "flow" ? (
        <div className="stack">
          <RuntimeEventFlowView entries={debugLog} />
        </div>
      ) : null}

      {tab === "queue" ? <QueueAnalyticsPanel metrics={runtimeMetrics} /> : null}

      {tab === "sim" ? <SimulationControlPanel /> : null}

      {tab === "bundle" ? (
        <div className="stack" style={{ gap: 12 }}>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            <span className="mono">.replaybundle</span> is JSON: replay (optional), snapshots, diagnostics hashes, roster summary,
            assignments, relationship graph, certification hints.
          </p>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            <button type="button" className="btn" disabled={recording} onClick={startRecording}>
              Start replay capture
            </button>
            <button type="button" className="btn btn-ghost" disabled={!recording} onClick={stopRecording}>
              Stop capture
            </button>
            <button type="button" className="btn btn-primary" onClick={exportBundle}>
              Export .replaybundle
            </button>
          </div>
          <label className="btn btn-ghost" style={{ cursor: "pointer", width: "fit-content" }}>
            Import bundle snapshot
            <input
              type="file"
              accept="application/json,.json,.replaybundle"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                void f.text().then((t) => importReplayBundleFromFile(t))
              }}
            />
          </label>
        </div>
      ) : null}

      {tab === "cert" ? <CertificationDashboard /> : null}
      {tab === "bench" ? <MockPackageWorkbench /> : null}
      {tab === "dev" ? <DevWorkflowPanel /> : null}
      {tab === "primitives" ? <GenericPrimitivesPanel /> : null}
    </div>
  )
}
