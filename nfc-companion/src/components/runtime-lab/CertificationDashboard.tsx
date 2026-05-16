import { useAppStore } from "@/store/useAppStore"

export function CertificationDashboard() {
  const last = useAppStore((s) => s.lastCanonicalImportResult)
  const graph = useAppStore((s) => s.canonicalRelationshipGraphJson)

  const importStatus =
    last === null ? "not run" : last.ok ? "graph validation passed" : `failed (${last.errors.length} issues)`

  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
        Browser-side checks reflect the last canonical import session. Full certification (replay soak, CLI hashes) still runs in tooling
        outside the app.
      </p>
      <div className="panel panel-tight">
        <p className="mono" style={{ margin: 0, fontSize: 12 }}>
          canonical import: <strong>{importStatus}</strong>
        </p>
        {last && !last.ok ? (
          <ul className="mono muted" style={{ fontSize: 11, margin: "8px 0 0", paddingLeft: 18 }}>
            {last.errors.slice(0, 12).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}
        {last && last.ok ? (
          <p className="mono muted" style={{ fontSize: 11, margin: "8px 0 0" }}>
            entities {last.metrics.entityCount} · edges {last.metrics.edgeCount} · {last.metrics.durationMs.toFixed(1)} ms
          </p>
        ) : null}
        <p className="mono muted" style={{ fontSize: 11, margin: "8px 0 0" }}>
          relationship graph JSON: {graph ? `${graph.length} chars` : "none"}
        </p>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        CLI: <span className="mono">npm run import-cert -- --adapter … --raw …</span> (see repo scripts)
      </p>
    </div>
  )
}
