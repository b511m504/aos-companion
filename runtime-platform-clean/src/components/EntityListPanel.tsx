import { useMemo } from "react"
import type { Assignment } from "@/models/types"
import { useAppStore } from "@/store/useAppStore"
import { useRuntimeSession } from "@/store/useRuntimeSession"

function statusForUnit(params: {
  unitId: string
  assignments: Assignment[]
}): { label: string; tone: "ok" | "warn" | "danger" | "muted"; uid?: string } {
  const a = params.assignments.find((x) => x.entityId === params.unitId)
  if (!a) return { label: "Needs tag", tone: "muted" }

  const dup = params.assignments.filter((x) => x.tagUid === a.tagUid)
  if (dup.length > 1) return { label: "Tag clash", tone: "danger", uid: a.tagUid }

  return { label: "Linked", tone: "ok", uid: a.tagUid }
}

export function EntityListPanel() {
  const list = useAppStore((s) => s.selectedList)
  const assignments = useAppStore((s) => s.assignments)
  const selectedEntityId = useAppStore((s) => s.selectedEntityId)
  const setSelectedEntity = useAppStore((s) => s.setSelectedEntity)
  const entityFilter = useAppStore((s) => s.entityFilter)
  const entitySearch = useAppStore((s) => s.entitySearch)
  const setEntityFilter = useAppStore((s) => s.setEntityFilter)
  const setEntitySearch = useAppStore((s) => s.setEntitySearch)
  const lastScanSuccessAt = useAppStore((s) => s.lastScanSuccessAt)
  const lastAssignedEntityId = useAppStore((s) => s.lastAssignedEntityId)
  const entityRows = useRuntimeSession((s) => s.entityRows)
  const translateLabel = useRuntimeSession((s) => s.translateLabel)

  const runtimeById = useMemo(() => new Map(entityRows.map((e) => [e.id, e])), [entityRows])

  const filteredUnits = useMemo(() => {
    if (!list) return []
    const q = entitySearch.trim().toLowerCase()
    return list.units.filter((u) => {
      if (entityFilter === "assigned" && !assignments.some((a) => a.entityId === u.id)) return false
      if (entityFilter === "unassigned" && assignments.some((a) => a.entityId === u.id)) return false
      if (!q) return true
      return u.id.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)
    })
  }, [list, assignments, entityFilter, entitySearch])

  if (!list) return null

  const recentHighlight =
    lastScanSuccessAt && Date.now() - lastScanSuccessAt < 6500 && lastAssignedEntityId
      ? lastAssignedEntityId
      : null

  return (
    <div className="panel entity-list-panel">
      <h2 className="h2">Units in this army</h2>
      <p className="muted entity-list-lead">
        Tap a unit, then use <strong>Ready to scan</strong> to link its physical tag.
      </p>

      <div className="entity-toolbar">
        <input
          type="search"
          className="entity-search"
          placeholder="Search units…"
          value={entitySearch}
          onChange={(e) => setEntitySearch(e.target.value)}
          aria-label="Search units"
        />
        <div className="segmented" role="group" aria-label="Link status filter">
          {(["all", "assigned", "unassigned"] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={`segmented-btn ${entityFilter === k ? "active" : ""}`}
              onClick={() => setEntityFilter(k)}
            >
              {k === "all" ? "All" : k === "assigned" ? "Linked" : "Needs tag"}
            </button>
          ))}
        </div>
      </div>

      <div className="entity-scroll">
        <div className="stack entity-stack">
          {filteredUnits.map((u) => {
            const st = statusForUnit({ unitId: u.id, assignments })
            const selected = selectedEntityId === u.id
            const pillClass =
              st.tone === "ok"
                ? "pill pill-ok"
                : st.tone === "danger"
                  ? "pill pill-danger"
                  : st.tone === "warn"
                    ? "pill pill-warn"
                    : "pill"
            const flash = recentHighlight === u.id
            const rt = runtimeById.get(u.id)
            const statuses = rt?.states.statuses ?? []
            const runtimeBuff = statuses.length > 0

            return (
              <button
                key={u.id}
                type="button"
                className={`entity-row entity-row-tap ${selected ? "selected" : ""} ${flash ? "entity-row-flash" : ""} ${runtimeBuff ? "entity-row-runtime-status" : ""}`}
                onClick={() => setSelectedEntity(u.id)}
              >
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 650 }}>{u.name}</div>
                  {statuses.length ? (
                    <div className="entity-runtime-statuses row" style={{ flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                      {statuses.map((s) => (
                        <span key={s} className="pill pill-runtime-status" title={`Canonical status: ${s}`}>
                          {translateLabel(`status:${s}`)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="stack" style={{ alignItems: "flex-end", gap: 6, minWidth: 0 }}>
                  <span className={pillClass}>{st.label}</span>
                  {st.uid ? (
                    <span className="mono muted tag-uid-compact" title={st.uid}>
                      {st.uid}
                    </span>
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
