import { useMemo, useState } from "react"
import type { PackageSummary } from "@/services/packageIndexService"

export function PackageBrowserPanel(props: {
  packages: PackageSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const [q, setQ] = useState("")
  const [group, setGroup] = useState<"all" | "skeleton" | "other">("all")

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    return props.packages.filter((p) => {
      if (group === "skeleton" && p.group !== "skeleton") return false
      if (group === "other" && p.group !== "other") return false
      if (!qq) return true
      const hay = `${p.packageId} ${p.name ?? ""} ${p.tags.join(" ")} ${p.entityTypes?.join(" ") ?? ""}`.toLowerCase()
      return hay.includes(qq)
    })
  }, [props.packages, q, group])

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <input className="entity-search" placeholder="Search packages…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="entity-search" aria-label="Group" value={group} onChange={(e) => setGroup(e.target.value as typeof group)}>
          <option value="all">All groups</option>
          <option value="skeleton">Skeleton lab</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="grid-cards grid-cards-spacious">
        {filtered.map((p) => (
          <button
            key={p.packageId}
            type="button"
            className="card card-xl"
            onClick={() => props.onSelect(p.packageId)}
            style={{
              textAlign: "left",
              outline: props.selectedId === p.packageId ? "2px solid var(--accent, #6cf)" : undefined
            }}
          >
            <div className="card-title mono">{p.packageId}</div>
            <p className="card-meta" style={{ margin: "6px 0" }}>
              {p.name ?? "—"} · rules {p.ruleFileCount}
            </p>
            <p className="mono muted" style={{ fontSize: 11, margin: 0 }}>
              adapters: {p.adapters.length ? p.adapters.join(", ") : "—"} · tags: {p.tags.join(", ")}
            </p>
            {p.entityTypes?.length ? (
              <p className="mono muted" style={{ fontSize: 11, margin: "6px 0 0" }}>
                entity types: {p.entityTypes.slice(0, 8).join(", ")}
                {p.entityTypes.length > 8 ? "…" : ""}
              </p>
            ) : null}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? <p className="muted">No packages match filters.</p> : null}
    </div>
  )
}
