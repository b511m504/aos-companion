import { useMemo } from "react"
import { useAppStore } from "@/store/useAppStore"

export function GameSystemScreen() {
  const systems = useAppStore((s) => s.systems)
  const contentLoading = useAppStore((s) => s.contentLoading)
  const selectSystem = useAppStore((s) => s.selectSystem)
  const goStart = useAppStore((s) => s.goStart)

  const orderedSystems = useMemo(() => {
    return [...systems].sort((a, b) => {
      if (a.id === "skeleton_lab") return -1
      if (b.id === "skeleton_lab") return 1
      return a.name.localeCompare(b.name)
    })
  }, [systems])

  return (
    <div className="stack wizard-screen">
      <div className="row-between wizard-header">
        <div>
          <p className="eyebrow">Step 1 of 4</p>
          <h1 className="h1">Choose content system</h1>
          <p className="muted wizard-lead">
            <strong>Skeleton lab</strong> is the recommended entry for mock / skeleton packages (opens{" "}
            <strong>Runtime Lab</strong>). Other systems use the legacy roster and NFC binding flow.
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => goStart()}>
          Back
        </button>
      </div>

      {contentLoading ? <p className="muted">Loading systems…</p> : null}

      <div className="grid-cards grid-cards-spacious">
        {orderedSystems.map((s) => {
          const labPick = s.id === "skeleton_lab"
          return (
            <button
              key={s.id}
              type="button"
              className={`card card-xl${labPick ? " card-runtime-lab-pick" : ""}`}
              onClick={() =>
                void (async () => {
                  await selectSystem(s)
                  if (labPick) useAppStore.getState().goRuntimeLab()
                })()
              }
            >
              <div className="card-title">{s.name}</div>
              <p className="card-meta">{s.description}</p>
              {labPick ? (
                <p className="pill pill-ok" style={{ marginTop: 10, marginBottom: 0 }}>
                  Opens Runtime Lab
                </p>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}