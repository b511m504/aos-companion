import { useEffect, useState } from "react"
import { useAppStore } from "@/store/useAppStore"
import { getNfcManager } from "@/services/NFCManager"
import { persistence } from "@/store/persistenceSingleton"
import type { NfcHardwareError } from "@/models/types"
import { devMockExportBundleJson } from "@/utils/devTesting"
import { APP_VERSION } from "@/buildInfo"
import { RuntimeDebugPanel } from "@/components/RuntimeDebugPanel"

function CanonicalImportStatus() {
  const last = useAppStore((s) => s.lastCanonicalImportResult)
  if (!last) return null
  if (last.ok) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Last import: {last.metrics.entityCount} entities · {last.metrics.edgeCount} edges · {last.metrics.durationMs.toFixed(1)} ms
      </p>
    )
  }
  return (
    <p className="muted" style={{ margin: 0, fontSize: 13 }}>
      Last import failed: {last.errors.slice(0, 5).join(" · ")}
    </p>
  )
}

export function SettingsScreen() {
  const goStart = useAppStore((s) => s.goStart)
  const goRuntimeLab = useAppStore((s) => s.goRuntimeLab)
  const nfcMode = useAppStore((s) => s.nfcMode)
  const setNfcMode = useAppStore((s) => s.setNfcMode)
  const nativeNfcAvailable = useAppStore((s) => s.nativeNfcAvailable)
  const probeNfc = useAppStore((s) => s.probeNfc)
  const nfcScanState = useAppStore((s) => s.nfcScanState)
  const nfcDebounceMs = useAppStore((s) => s.nfcDebounceMs)
  const setNfcDebounceMs = useAppStore((s) => s.setNfcDebounceMs)
  const assignments = useAppStore((s) => s.assignments)
  const selectedList = useAppStore((s) => s.selectedList)
  const selectedFaction = useAppStore((s) => s.selectedFaction)
  const selectedSystem = useAppStore((s) => s.selectedSystem)
  const clearCurrentListAssignments = useAppStore((s) => s.clearCurrentListAssignments)
  const exportCurrentBundle = useAppStore((s) => s.exportCurrentBundle)
  const copyExportToClipboard = useAppStore((s) => s.copyExportToClipboard)
  const importBundleJson = useAppStore((s) => s.importBundleJson)
  const setImportBundleJson = useAppStore((s) => s.setImportBundleJson)
  const runImportPreview = useAppStore((s) => s.runImportPreview)
  const applyImport = useAppStore((s) => s.applyImport)
  const importPreview = useAppStore((s) => s.importPreview)
  const clearImportPreview = useAppStore((s) => s.clearImportPreview)
  const devFillRandom = useAppStore((s) => s.devFillRandom)
  const devStress = useAppStore((s) => s.devStress)
  const [hwErr, setHwErr] = useState<NfcHardwareError | null>(null)
  const [stressMsg, setStressMsg] = useState<string | null>(null)

  useEffect(() => {
    return getNfcManager().subscribeHardwareError((e) => setHwErr(e))
  }, [])

  return (
    <div className="stack wizard-screen">
      <div className="row-between wizard-header">
        <div>
          <p className="eyebrow">Setup</p>
          <h1 className="h1">Settings</h1>
          <p className="muted wizard-lead">NFC reader, backups, and optional tools.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-primary" onClick={() => goRuntimeLab()}>
            Runtime Lab
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => goStart()}>
            Home
          </button>
        </div>
      </div>

      <div className="panel stack">
        <h2 className="h2">Runtime Lab</h2>
        <p className="muted" style={{ marginTop: -6 }}>
          Browse packages from <span className="mono">/packages/package_registry.json</span>, load sample imports, inspect
          relationships, run isolated simulations, and export replay bundles — without going through the legacy roster
          wizard.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => goRuntimeLab()}>
          Open Runtime Lab
        </button>
      </div>

      <div className="panel stack">
        <h2 className="h2">NFC reader</h2>
        <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
          <button
            type="button"
            className={`btn ${nfcMode === "native" ? "btn-primary" : ""}`}
            disabled={!nativeNfcAvailable}
            onClick={() => void setNfcMode("native")}
          >
            Tablet NFC
          </button>
          <button
            type="button"
            className={`btn ${nfcMode === "simulated" ? "btn-primary" : ""}`}
            onClick={() => void setNfcMode("simulated")}
          >
            Practice mode
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void probeNfc()}>
            Refresh hardware check
          </button>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Reader state: <span className="mono">{nfcScanState}</span>
          {getNfcManager().isSessionActive() ? " · scanning session on" : ""}
        </p>
        <div className="field">
          <label className="muted" htmlFor="debounce">
            Ignore repeat taps of the same tag (milliseconds)
          </label>
          <input
            id="debounce"
            type="number"
            min={0}
            max={10000}
            step={50}
            value={nfcDebounceMs}
            onChange={(e) => setNfcDebounceMs(Number(e.target.value) || 0)}
          />
        </div>
        {hwErr ? (
          <div className="banner-error row-between">
            <span>
              <strong>{hwErr.code}</strong>: {hwErr.message}
            </span>
            <button type="button" className="btn btn-ghost" onClick={() => getNfcManager().clearHardwareError()}>
              Clear
            </button>
          </div>
        ) : null}
      </div>

      <div className="panel stack">
        <h2 className="h2">This army</h2>
        <p className="muted" style={{ marginTop: -6 }}>
          {selectedList ? `${selectedList.name}` : "No army loaded — start a session and pick an army first."}
        </p>
        <button
          type="button"
          className="btn btn-danger"
          disabled={!selectedList}
          onClick={() => {
            if (window.confirm("Remove all tag links for this army on this device?")) clearCurrentListAssignments()
          }}
        >
          Clear all tag links
        </button>
      </div>

      <details className="panel advanced-block">
        <summary className="advanced-summary">Advanced — import &amp; export</summary>
        <div className="stack" style={{ marginTop: 14, gap: 14 }}>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            For backups, migrations, or power users. Not part of normal setup. Paste a previously exported tag-link
            file, preview, then apply.
          </p>
          <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
            <button type="button" className="btn" disabled={!selectedList} onClick={() => copyExportToClipboard()}>
              Copy tag links to clipboard
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!selectedList || !selectedFaction || !selectedSystem}
              onClick={() => {
                if (!selectedList || !selectedFaction || !selectedSystem) return
                setImportBundleJson(
                  devMockExportBundleJson({
                    list: selectedList,
                    factionId: selectedFaction.id,
                    gameSystemId: selectedSystem.id
                  })
                )
              }}
            >
              Fill sample file (testing)
            </button>
          </div>
          <textarea
            className="import-textarea"
            rows={8}
            placeholder="Paste exported tag-link JSON here…"
            value={importBundleJson}
            onChange={(e) => setImportBundleJson(e.target.value)}
          />
          <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
            <button type="button" className="btn" disabled={!importBundleJson.trim()} onClick={() => runImportPreview()}>
              Preview
            </button>
            <button type="button" className="btn btn-primary" disabled={!importPreview?.canApplyStrict} onClick={() => applyImport("strict")}>
              Apply all (strict)
            </button>
            <button type="button" className="btn btn-primary" disabled={!importPreview} onClick={() => applyImport("safe_partial")}>
              Apply safe (skip conflicts)
            </button>
            <button type="button" className="btn btn-ghost" disabled={!importPreview} onClick={() => clearImportPreview()}>
              Clear preview
            </button>
          </div>
          {importPreview ? (
            <div className="panel panel-tight">
              <p className="muted" style={{ margin: "0 0 8px", fontSize: 13 }}>
                Rows ready: {importPreview.applicable.length} · Issues: {importPreview.rejected.length}
              </p>
              <ul className="mono" style={{ fontSize: 12, maxHeight: 160, overflow: "auto", paddingLeft: 18 }}>
                {importPreview.rows.map((r) => (
                  <li key={r.index}>
                    #{r.index} {r.status}
                    {r.detail ? ` — ${r.detail}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <details className="muted">
            <summary>View raw export</summary>
            <pre className="mono import-pre">{exportCurrentBundle() || "—"}</pre>
          </details>
        </div>
      </details>

      <details className="panel advanced-block">
        <summary className="advanced-summary">Advanced — canonical roster import (all packages)</summary>
        <div className="stack" style={{ marginTop: 14, gap: 14 }}>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Paste a package <span className="mono">sample_lists</span> JSON. The app loads{" "}
            <span className="mono">/packages/&lt;id&gt;/imports/jsonRosterAdapter.json</span>, normalizes entities, validates the graph,
            then sets the active army (clears NFC links for that list until you re-bind).
          </p>
          <div className="field">
            <label className="muted" htmlFor="canon-pkg">
              Package id
            </label>
            <input
              id="canon-pkg"
              className="mono"
              value={useAppStore((s) => s.canonicalImportPackageId)}
              onChange={(e) => useAppStore.getState().setCanonicalImportPackageId(e.target.value)}
            />
          </div>
          <textarea
            className="import-textarea"
            rows={10}
            placeholder='Lists JSON (schemaVersion + lists[] with units[])'
            value={useAppStore((s) => s.canonicalImportPayloadJson)}
            onChange={(e) => useAppStore.getState().setCanonicalImportPayloadJson(e.target.value)}
          />
          <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
            <button type="button" className="btn btn-primary" onClick={() => void useAppStore.getState().runCanonicalJsonImport()}>
              Run canonical import
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => useAppStore.getState().clearCanonicalImportSession()}>
              Clear import buffer
            </button>
          </div>
          <CanonicalImportStatus />
        </div>
      </details>

      <details className="panel advanced-block">
        <summary className="advanced-summary">Advanced — event runtime</summary>
        <div className="stack" style={{ marginTop: 14, gap: 14 }}>
          <RuntimeDebugPanel />
        </div>
      </details>

      <details className="panel advanced-block">
        <summary className="advanced-summary">Developer — stress test</summary>
        <div className="stack" style={{ marginTop: 14, gap: 12 }}>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Random tag assignments to validate storage. Use only on a test army.
          </p>
          <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
            <button type="button" className="btn" disabled={!selectedList} onClick={() => devFillRandom(12)}>
              Random links (12 units)
            </button>
            <button
              type="button"
              className="btn"
              disabled={!selectedList}
              onClick={() => {
                const r = devStress(250)
                setStressMsg(r.ok ? "Stress check passed." : (r.error ?? "Stress check failed."))
              }}
            >
              Run stress check
            </button>
          </div>
          {stressMsg ? <p className="muted" style={{ margin: 0 }}>{stressMsg}</p> : null}
        </div>
      </details>

      <div className="panel stack">
        <h2 className="h2">About this build</h2>
        <ul className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Version {APP_VERSION}</li>
          <li>Saves: {persistence.backendId}</li>
          <li>Tag links in this session: {assignments.length}</li>
          <li>Tablet NFC: {nativeNfcAvailable ? "available" : "not available"}</li>
        </ul>
      </div>
    </div>
  )
}
