import { useAppStore } from "@/store/useAppStore"

export function FactionScreen() {
  const system = useAppStore((s) => s.selectedSystem)
  const factions = useAppStore((s) => s.factions)
  const contentLoading = useAppStore((s) => s.contentLoading)
  const selectFaction = useAppStore((s) => s.selectFaction)
  const goSystems = useAppStore((s) => s.goSystems)
  const goRuntimeLab = useAppStore((s) => s.goRuntimeLab)

  if (!system) {
    return (
      <div className="stack">
        <p className="muted">Choose a content system first.</p>
        <button type="button" className="btn" onClick={() => goSystems()}>
          Back to systems
        </button>
      </div>
    )
  }

  return (
    <div className="stack wizard-screen">
      <div className="row-between wizard-header">
        <div>
          <p className="eyebrow">Step 2 of 4</p>
          <h1 className="h1">Choose collection</h1>
          <p className="muted wizard-lead">
            Content system: <strong style={{ color: "var(--text)" }}>{system.name}</strong>
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => goSystems()}>
          Back
        </button>
      </div>

      {system.id === "skeleton_lab" ? (
        <div className="panel panel-tight row-between" style={{ gap: 12, flexWrap: "wrap" }}>
          <p className="muted" style={{ margin: 0, flex: "1 1 200px" }}>
            For skeleton packages, skip this wizard when you only need imports, graphs, or simulation — use Runtime Lab.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => goRuntimeLab()}>
            Open Runtime Lab
          </button>
        </div>
      ) : null}

      {contentLoading ? <p className="muted">Loading collections…</p> : null}

      <div className="grid-cards grid-cards-spacious">
        {factions.map((f) => (
          <button key={f.id} type="button" className="card card-xl" onClick={() => void selectFaction(f)}>
            <div className="row-between" style={{ alignItems: "center" }}>
              <div className="card-title" style={{ margin: 0 }}>
                {f.name}
              </div>
              <div
                aria-hidden
                className="faction-icon-placeholder"
              />
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
