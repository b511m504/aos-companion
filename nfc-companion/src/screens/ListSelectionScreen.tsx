import { useAppStore } from "@/store/useAppStore"

export function ListSelectionScreen() {
  const faction = useAppStore((s) => s.selectedFaction)
  const system = useAppStore((s) => s.selectedSystem)
  const lists = useAppStore((s) => s.lists)
  const contentLoading = useAppStore((s) => s.contentLoading)
  const selectList = useAppStore((s) => s.selectList)
  const goNfcWorkspace = useAppStore((s) => s.goNfcWorkspace)
  const goRuntimeLab = useAppStore((s) => s.goRuntimeLab)
  const goFaction = useAppStore((s) => s.goFaction)
  const goSystems = useAppStore((s) => s.goSystems)

  if (!faction || !system) {
    return (
      <div className="stack">
        <p className="muted">Choose a content system and collection first.</p>
        <button type="button" className="btn" onClick={() => goSystems()}>
          Back
        </button>
      </div>
    )
  }

  return (
    <div className="stack wizard-screen">
      <div className="row-between wizard-header">
        <div>
          <p className="eyebrow">Step 3 of 4</p>
          <h1 className="h1">Choose roster</h1>
          <p className="muted wizard-context">
            {system.name} · {faction.name}
          </p>
          <p className="muted wizard-lead">
            Pick a saved roster for this session. For <span className="mono">skeleton_lab</span>, you will open{" "}
            <strong>Runtime Lab</strong> next (recommended). Other systems continue to the NFC binding workspace.
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => goFaction()}>
          Back
        </button>
      </div>

      {contentLoading ? <p className="muted">Loading rosters…</p> : null}

      <div className="grid-cards grid-cards-spacious list-pick-grid">
        {lists.map((l) => {
          const n = l.units.length
          return (
            <button
              key={l.id}
              type="button"
              className="card card-xl list-army-card list-roster-card"
              onClick={() => {
                selectList(l)
                if (system.id === "skeleton_lab") {
                  goRuntimeLab()
                } else {
                  goNfcWorkspace()
                }
              }}
            >
              <div className="list-card-top">
                <div className="card-title list-card-title">{l.name}</div>
                <span className="list-card-count" aria-hidden="true">
                  {n} {n === 1 ? "entity" : "entities"}
                </span>
              </div>
              <p className="card-meta list-card-faction">{faction.name}</p>
              {l.description ? <p className="card-sub list-card-desc">{l.description}</p> : null}
              <p className="card-cta list-card-cta">
                {system.id === "skeleton_lab" ? "Open in Runtime Lab" : "Continue to NFC workspace"}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
