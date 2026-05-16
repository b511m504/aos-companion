import { useMemo, useState } from "react"

export type GraphWire = {
  edges?: { id: string; kind: string; fromInstanceId: string; toInstanceId: string }[]
}

export function CanonicalGraphViewer(props: {
  graphJson: string | null
  listUnitIds: ReadonlySet<string>
  maxEdgesRender?: number
}) {
  const max = props.maxEdgesRender ?? 600
  const [kindFilter, setKindFilter] = useState("")
  const [q, setQ] = useState("")

  const parsed = useMemo(() => {
    if (!props.graphJson) return null
    try {
      return JSON.parse(props.graphJson) as GraphWire
    } catch {
      return null
    }
  }, [props.graphJson])

  const stats = useMemo(() => {
    if (!parsed?.edges) return null
    const edges = parsed.edges
    const kinds = new Map<string, number>()
    let orphan = 0
    const transportPairs = new Set<string>()
    const circ: string[] = []
    for (const e of edges) {
      kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1)
      if (!props.listUnitIds.has(e.fromInstanceId) || !props.listUnitIds.has(e.toInstanceId)) orphan++
      if (e.kind === "transport_passenger") {
        const key = `${e.fromInstanceId}\t${e.toInstanceId}`
        const rev = `${e.toInstanceId}\t${e.fromInstanceId}`
        if (transportPairs.has(rev)) circ.push(`${e.fromInstanceId}<->${e.toInstanceId}`)
        transportPairs.add(key)
      }
    }
    return { total: edges.length, kinds, orphan, circ }
  }, [parsed, props.listUnitIds])

  const filteredEdges = useMemo(() => {
    if (!parsed?.edges) return []
    return parsed.edges
      .filter((e) => (kindFilter ? e.kind.includes(kindFilter) : true))
      .filter((e) => {
        if (!q.trim()) return true
        const qq = q.toLowerCase()
        return (
          e.id.toLowerCase().includes(qq) ||
          e.kind.toLowerCase().includes(qq) ||
          e.fromInstanceId.toLowerCase().includes(qq) ||
          e.toInstanceId.toLowerCase().includes(qq)
        )
      })
      .sort((a, b) => `${a.kind}\t${a.fromInstanceId}\t${a.toInstanceId}`.localeCompare(`${b.kind}\t${b.fromInstanceId}\t${b.toInstanceId}`))
  }, [parsed, kindFilter, q])

  if (!props.graphJson) {
    return <p className="muted">No relationship graph loaded. Run a canonical import or load a session with graph export.</p>
  }
  if (!parsed?.edges) {
    return <p className="muted">Graph JSON has no edges array.</p>
  }

  const slice = filteredEdges.slice(0, max)
  const truncated = filteredEdges.length > max

  return (
    <div className="stack" style={{ gap: 12 }}>
      {stats ? (
        <div className="panel panel-tight">
          <p className="mono" style={{ margin: 0, fontSize: 12 }}>
            edges={stats.total} · orphan/missing endpoints≈{stats.orphan}
            {stats.circ.length ? ` · circular transport hints=${stats.circ.length}` : ""}
          </p>
          <p className="mono muted" style={{ margin: "6px 0 0", fontSize: 11 }}>
            kinds: {[...stats.kinds.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, n]) => `${k}:${n}`).join(" · ")}
          </p>
        </div>
      ) : null}
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <input
          className="entity-search"
          placeholder="Filter edges (id, kind, entity id)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Edge filter"
        />
        <input
          className="entity-search"
          placeholder="Kind contains…"
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          aria-label="Kind filter"
        />
      </div>
      {truncated ? (
        <p className="muted" style={{ fontSize: 12 }}>
          Showing first {max} of {filteredEdges.length} edges (deterministic sort). Tighten filters for full in-UI render or export JSON.
        </p>
      ) : null}
      <div style={{ maxHeight: 360, overflow: "auto", border: "1px solid var(--border, #3334)", borderRadius: 8 }}>
        <table className="mono" style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", background: "var(--panel-2, #1a1a20)" }}>
              <th style={{ padding: 6 }}>kind</th>
              <th style={{ padding: 6 }}>from</th>
              <th style={{ padding: 6 }}>to</th>
              <th style={{ padding: 6 }}>id</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((e) => {
              const badFrom = !props.listUnitIds.has(e.fromInstanceId)
              const badTo = !props.listUnitIds.has(e.toInstanceId)
              const hi = badFrom || badTo ? "#5a1a1a" : undefined
              return (
                <tr key={e.id} style={{ background: hi }}>
                  <td style={{ padding: 4, wordBreak: "break-all" }}>{e.kind}</td>
                  <td style={{ padding: 4, wordBreak: "break-all" }}>{e.fromInstanceId}</td>
                  <td style={{ padding: 4, wordBreak: "break-all" }}>{e.toInstanceId}</td>
                  <td style={{ padding: 4, wordBreak: "break-all" }}>{e.id}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
