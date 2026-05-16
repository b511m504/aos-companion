import { useState } from "react"
import type { ArmyList } from "@/models/types"
import { useAppStore } from "@/store/useAppStore"
import { runBrowserIsolatedSimulation } from "@/runtime/dev/runIsolatedSimulation"

const LAB_FALLBACK: ArmyList = {
  id: "lab-list",
  name: "Lab list",
  factionId: "lab",
  units: [
    { id: "lab-e1", name: "Entity 1", tags: ["lab"] },
    { id: "lab-e2", name: "Entity 2", tags: ["lab"] }
  ]
}

export function SimulationControlPanel() {
  const selectedList = useAppStore((s) => s.selectedList)
  const assignments = useAppStore((s) => s.assignments)
  const selectedSystem = useAppStore((s) => s.selectedSystem)
  const [seed, setSeed] = useState("lab-ui")
  const [steps, setSteps] = useState(120)
  const [checkpoint, setCheckpoint] = useState(0)
  const [logicalClock, setLogicalClock] = useState(true)
  const [deterministicClock, setDeterministicClock] = useState(true)
  const [ledger, setLedger] = useState(false)
  const [strict, setStrict] = useState(false)
  const [soak, setSoak] = useState(false)
  const [useIndexRules, setUseIndexRules] = useState(true)
  const [exportReplay, setExportReplay] = useState(false)
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState<string>("")

  const list = selectedList ?? LAB_FALLBACK

  const run = async () => {
    setBusy(true)
    setLast("")
    try {
      const maxTurns = soak ? Math.min(2_000_000, Math.max(steps, 50_000)) : Math.min(200_000, Math.max(1, steps))
      const r = await runBrowserIsolatedSimulation({
        seed,
        maxTurns,
        checkpointEvery: Math.max(0, checkpoint),
        timeMode: logicalClock ? "logical" : "wall",
        deterministicClock,
        eventLedger: ledger,
        strictValidation: strict,
        useLiveRuleIndex: useIndexRules,
        rulesOverride: [],
        list,
        assignments,
        systemId: selectedSystem?.id ?? "runtime_lab",
        exportReplay: exportReplay && maxTurns <= 5000
      })
      setLast(JSON.stringify(r, null, 2))
    } catch (e) {
      setLast(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
        Isolated <span className="mono">SimulationRunner</span> (does not replace the live singleton engine). Uses your selected roster when
        available; otherwise a tiny lab roster.
      </p>
      <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
        <label className="muted" style={{ fontSize: 12 }}>
          seed
          <input className="entity-search" value={seed} onChange={(e) => setSeed(e.target.value)} style={{ marginLeft: 6 }} />
        </label>
        <label className="muted" style={{ fontSize: 12 }}>
          steps
          <input
            type="number"
            className="entity-search"
            value={steps}
            onChange={(e) => setSteps(parseInt(e.target.value, 10) || 1)}
            style={{ marginLeft: 6, width: 100 }}
          />
        </label>
        <label className="muted" style={{ fontSize: 12 }}>
          checkpoint
          <input
            type="number"
            className="entity-search"
            value={checkpoint}
            onChange={(e) => setCheckpoint(parseInt(e.target.value, 10) || 0)}
            style={{ marginLeft: 6, width: 80 }}
          />
        </label>
      </div>
      <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
        <label className="muted" style={{ fontSize: 12 }}>
          <input type="checkbox" checked={logicalClock} onChange={() => setLogicalClock(!logicalClock)} /> logical time
        </label>
        <label className="muted" style={{ fontSize: 12 }}>
          <input type="checkbox" checked={deterministicClock} onChange={() => setDeterministicClock(!deterministicClock)} /> deterministic
          clock
        </label>
        <label className="muted" style={{ fontSize: 12 }}>
          <input type="checkbox" checked={ledger} onChange={() => setLedger(!ledger)} /> event ledger
        </label>
        <label className="muted" style={{ fontSize: 12 }}>
          <input type="checkbox" checked={strict} onChange={() => setStrict(!strict)} /> strict validation
        </label>
        <label className="muted" style={{ fontSize: 12 }}>
          <input type="checkbox" checked={soak} onChange={() => setSoak(!soak)} /> soak-shaped steps (capped)
        </label>
        <label className="muted" style={{ fontSize: 12 }}>
          <input type="checkbox" checked={useIndexRules} onChange={() => setUseIndexRules(!useIndexRules)} /> merged package rules index
        </label>
        <label className="muted" style={{ fontSize: 12 }}>
          <input type="checkbox" checked={exportReplay} onChange={() => setExportReplay(!exportReplay)} /> replay JSON (≤5000 steps)
        </label>
      </div>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run()}>
        {busy ? "Running…" : "Run isolated simulation"}
      </button>
      {last ? (
        <pre className="mono panel panel-tight" style={{ fontSize: 10, maxHeight: 320, overflow: "auto", margin: 0 }}>
          {last}
        </pre>
      ) : null}
    </div>
  )
}
