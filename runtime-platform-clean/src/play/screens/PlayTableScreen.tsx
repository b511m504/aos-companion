import { useEffect } from "react"
import { useAppStore } from "@/store/useAppStore"
import { usePlaySessionStore } from "@/play/playSessionStore"
import { PlayUnitSheet } from "@/play/screens/PlayUnitSheet"
import { shortTagLabel } from "@/utils/uid"

const D = "div"

export function PlayTableScreen() {
  const selectedList = useAppStore((s) => s.selectedList)
  const assignments = useAppStore((s) => s.assignments)
  const goPlayAssign = useAppStore((s) => s.goPlayAssign)
  const goPlayHome = useAppStore((s) => s.goPlayHome)
  const units = usePlaySessionStore((s) => s.units)
  const round = usePlaySessionStore((s) => s.round)
  const phase = usePlaySessionStore((s) => s.phase)
  const toast = usePlaySessionStore((s) => s.toast)
  const setToast = usePlaySessionStore((s) => s.setToast)
  const glowUnitId = usePlaySessionStore((s) => s.glowUnitId)
  const selectedUnitId = usePlaySessionStore((s) => s.selectedUnitId)
  const sheetOpen = usePlaySessionStore((s) => s.sheetOpen)
  const openSheet = usePlaySessionStore((s) => s.openSheet)
  const nextRound = usePlaySessionStore((s) => s.nextRound)
  const startTableListening = usePlaySessionStore((s) => s.startTableListening)
  const stopTableListening = usePlaySessionStore((s) => s.stopTableListening)
  const persistNow = usePlaySessionStore((s) => s.persistNow)
  const recordRecovery = usePlaySessionStore((s) => s.recordRecovery)

  useEffect(() => {
    void startTableListening()
    persistNow()
    const onVis = () => {
      if (document.visibilityState === "visible") {
        recordRecovery()
        void startTableListening()
      } else {
        void stopTableListening()
        persistNow()
      }
    }
    document.addEventListener("visibilitychange", onVis)
    return () => {
      document.removeEventListener("visibilitychange", onVis)
      void stopTableListening()
      persistNow()
    }
  }, [persistNow, recordRecovery, startTableListening, stopTableListening])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 1800)
    return () => window.clearTimeout(t)
  }, [setToast, toast])

  const roster = selectedList?.units ?? []

  return (
    <D className="play-screen play-table">
      <D className="play-table-top">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => goPlayHome()}>
          Home
        </button>
        <D className="play-phase-pill">
          Round {round} · {phase}
        </D>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => goPlayAssign()}>
          Tags
        </button>
      </D>

      {toast ? (
        <D className={`play-toast play-toast-${toast.tone} play-toast-float`} role="status">
          {toast.message}
        </D>
      ) : null}

      <p className="muted play-table-hint">Tap a token on the table to select an operative.</p>

      <D className="play-table-grid">
        {roster.map((u) => {
          const play = units[u.id]
          const a = assignments.find((x) => x.entityId === u.id)
          const sel = selectedUnitId === u.id
          const glow = glowUnitId === u.id
          if (!play) return null
          const down = play.wounds >= play.maxWounds
          return (
            <button
              key={u.id}
              type="button"
              className={`play-unit-card ${sel ? "selected" : ""} ${glow ? "glow" : ""} ${down ? "down" : ""} ${play.activated ? "activated" : ""}`}
              onClick={() => openSheet(u.id)}
            >
              <span className="play-unit-card-name">{play.displayName}</span>
              <span className="play-unit-card-wounds">
                {play.wounds}/{play.maxWounds}
              </span>
              <span className="play-unit-card-status">{play.statusLabel}</span>
              {a ? <span className="play-unit-card-tag">{shortTagLabel(a.tagUid)}</span> : null}
            </button>
          )
        })}
      </D>

      <D className="play-table-actions">
        <button type="button" className="btn btn-ghost" onClick={() => nextRound()}>
          Next round
        </button>
      </D>

      {sheetOpen ? <PlayUnitSheet /> : null}
    </D>
  )
}
