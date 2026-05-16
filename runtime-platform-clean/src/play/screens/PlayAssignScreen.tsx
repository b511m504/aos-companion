import { useEffect, useMemo } from "react"
import { useAppStore } from "@/store/useAppStore"
import { usePlaySessionStore } from "@/play/playSessionStore"
import { getNfcManager } from "@/services/NFCManager"
import { ConflictDialog } from "@/components/ConflictDialog"
import { shortTagLabel } from "@/utils/uid"

const D = "div"

export function PlayAssignScreen() {
  const selectedList = useAppStore((s) => s.selectedList)
  const assignments = useAppStore((s) => s.assignments)
  const selectedEntityId = useAppStore((s) => s.selectedEntityId)
  const awaitingScan = useAppStore((s) => s.awaitingScan)
  const scanFeedback = useAppStore((s) => s.scanFeedback)
  const setSelectedEntity = useAppStore((s) => s.setSelectedEntity)
  const setAwaitingScan = useAppStore((s) => s.setAwaitingScan)
  const goPlayTable = useAppStore((s) => s.goPlayTable)
  const goPlayHome = useAppStore((s) => s.goPlayHome)
  const toast = usePlaySessionStore((s) => s.toast)
  const setToast = usePlaySessionStore((s) => s.setToast)
  const units = usePlaySessionStore((s) => s.units)

  const linked = useMemo(() => new Set(assignments.map((a) => a.entityId)), [assignments])
  const roster = selectedList?.units ?? []
  const allLinked = roster.length > 0 && roster.every((u) => linked.has(u.id))
  const current = roster.find((u) => u.id === selectedEntityId)

  useEffect(() => {
    if (!selectedList) return
    const first = roster.find((u) => !linked.has(u.id))
    if (first && !selectedEntityId) setSelectedEntity(first.id)
  }, [linked, roster, selectedEntityId, selectedList, setSelectedEntity])

  useEffect(() => {
    if (!selectedEntityId || allLinked) return
    void (async () => {
      await getNfcManager().startListening()
      await setAwaitingScan(true)
    })()
    return () => {
      void getNfcManager().stopListening()
    }
  }, [allLinked, selectedEntityId, setAwaitingScan])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(t)
  }, [setToast, toast])

  if (!selectedList) {
    return (
      <D className="play-screen">
        <p className="muted">No roster loaded.</p>
        <button type="button" className="btn" onClick={() => goPlayHome()}>
          Home
        </button>
      </D>
    )
  }

  return (
    <D className="play-screen play-assign">
      <D className="row-between play-assign-header">
        <D>
          <p className="eyebrow">Link tokens</p>
          <h1 className="h1">Assign tags</h1>
          <p className="muted play-lead">Select a unit, then tap its base token to the phone.</p>
        </D>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!allLinked}
          onClick={() => {
            goPlayTable()
            void usePlaySessionStore.getState().startTableListening()
          }}
        >
          To table →
        </button>
      </D>

      {toast ? (
        <D className={`play-toast play-toast-${toast.tone}`} role="status">
          {toast.message}
        </D>
      ) : null}

      {awaitingScan && current ? (
        <D className="play-assign-prompt" aria-live="polite">
          <span className="play-assign-pulse" />
          <strong>Tap NFC token</strong>
          <span className="muted">{current.name}</span>
        </D>
      ) : allLinked ? (
        <D className="play-assign-prompt ok">All operatives linked — head to the table.</D>
      ) : null}

      {scanFeedback.kind === "error" ? (
        <p className="play-toast play-toast-warn">{scanFeedback.message}</p>
      ) : null}

      <ul className="play-roster-list">
        {roster.map((u) => {
          const a = assignments.find((x) => x.entityId === u.id)
          const sel = u.id === selectedEntityId
          const play = units[u.id]
          return (
            <li key={u.id}>
              <button
                type="button"
                className={`play-roster-card ${sel ? "selected" : ""} ${a ? "linked" : ""}`}
                onClick={() => {
                  setSelectedEntity(u.id)
                  if (!a) void setAwaitingScan(true)
                }}
              >
                <span className="play-roster-name">{u.name}</span>
                <span className="play-roster-meta">
                  {a ? `Tag ${shortTagLabel(a.tagUid)}` : "Tap to link"}
                  {play ? ` · ${play.maxWounds}W` : ""}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <ConflictDialog />
    </D>
  )
}
