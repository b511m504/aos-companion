import { useAppStore } from "@/store/useAppStore"
import { usePlaySessionStore } from "@/play/playSessionStore"

export function PlaySessionScreen() {
  const goPlayHome = useAppStore((s) => s.goPlayHome)
  const startSkeleton = usePlaySessionStore((s) => s.startSkeletonSession)
  const hasSaved = usePlaySessionStore((s) => s.hasSavedSession)
  const resumeSaved = usePlaySessionStore((s) => s.resumeSavedSession)
  const clearSession = usePlaySessionStore((s) => s.clearSession)

  return (
    <div className="play-screen stack">
      <button type="button" className="btn btn-ghost btn-sm play-back" onClick={() => goPlayHome()}>
        ← Home
      </button>
      <p className="eyebrow">Session</p>
      <h1 className="h1">Skeleton Strike Team</h1>
      <p className="muted play-lead">
        Six operatives · Kill Team style · UID-only NFC tokens. Assign tags once, then play on the table.
      </p>

      <button type="button" className="btn btn-primary play-cta" onClick={() => void startSkeleton()}>
        Start new match
      </button>

      {hasSaved() ? (
        <>
          <button type="button" className="btn play-cta-secondary" onClick={() => void resumeSaved()}>
            Resume saved match
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              clearSession()
              goPlayHome()
            }}
          >
            Discard saved match
          </button>
        </>
      ) : null}
    </div>
  )
}
