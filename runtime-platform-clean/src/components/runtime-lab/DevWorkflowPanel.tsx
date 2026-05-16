import { useAppStore } from "@/store/useAppStore"
import { useRuntimeSession } from "@/store/useRuntimeSession"
import { getRuntimeEngine } from "@/runtime/RuntimeEngine"
import { SnapshotManager } from "@/runtime/snapshots/SnapshotManager"

export function DevWorkflowPanel() {
  const selectedList = useAppStore((s) => s.selectedList)
  const assignments = useAppStore((s) => s.assignments)
  const devFillRandom = useAppStore((s) => s.devFillRandom)
  const clearRuntimeDebug = useRuntimeSession((s) => s.clearRuntimeDebug)
  const goNfc = useAppStore((s) => s.goNfcWorkspace)

  const quickSnap = () => {
    const eng = getRuntimeEngine()
    const sm = new SnapshotManager(1)
    const snap = sm.saveState(eng, { assignments })
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `runtime-snapshot-dev-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
        Shortcuts for local iteration. Requires a loaded roster for assignment helpers.
      </p>
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <button type="button" className="btn" disabled={!selectedList} onClick={() => devFillRandom(12)}>
          Mock assignments (12)
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => clearRuntimeDebug()}>
          Clear runtime debug log
        </button>
        <button type="button" className="btn" disabled={!selectedList} onClick={() => goNfc()}>
          Open assignment workspace
        </button>
        <button type="button" className="btn" onClick={quickSnap}>
          Snapshot quicksave (download)
        </button>
      </div>
      <p className="mono muted" style={{ fontSize: 11, margin: 0 }}>
        assignments in session: {assignments.length} · list: {selectedList?.id ?? "—"}
      </p>
    </div>
  )
}
