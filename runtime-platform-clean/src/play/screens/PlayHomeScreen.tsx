import { useRef, useState } from "react"
import { useAppStore } from "@/store/useAppStore"
import { isDevToolsUnlocked, unlockDevTools } from "@/play/devMode"
import { usePlaySessionStore } from "@/play/playSessionStore"

export function PlayHomeScreen() {
  const contentLoading = useAppStore((s) => s.contentLoading)
  const nativeNfcAvailable = useAppStore((s) => s.nativeNfcAvailable)
  const goPlaySession = useAppStore((s) => s.goPlaySession)
  const goSettings = useAppStore((s) => s.goSettings)
  const goRuntimeLab = useAppStore((s) => s.goRuntimeLab)
  const hasSaved = usePlaySessionStore((s) => s.hasSavedSession)
  const resumeSaved = usePlaySessionStore((s) => s.resumeSavedSession)
  const [devUnlocked, setDevUnlocked] = useState(isDevToolsUnlocked())
  const pressTimer = useRef<number | null>(null)

  const longPressProps = {
    onPointerDown: () => {
      if (pressTimer.current) window.clearTimeout(pressTimer.current)
      pressTimer.current = window.setTimeout(() => {
        unlockDevTools()
        setDevUnlocked(true)
      }, 2500)
    },
    onPointerUp: () => {
      if (pressTimer.current) window.clearTimeout(pressTimer.current)
    },
    onPointerLeave: () => {
      if (pressTimer.current) window.clearTimeout(pressTimer.current)
    }
  }

  return (
    <div className="play-home">
      <div className="play-home-inner">
        <p className="eyebrow" {...longPressProps}>
          Tabletop NFC
        </p>
        <h1 className="play-title">Strike Team</h1>
        <p className="play-lead">
          Tap physical tokens to select operatives, track wounds, and run a real skirmish on the table.
        </p>
        <p className={`play-nfc-status ${nativeNfcAvailable ? "ok" : ""}`}>
          {contentLoading ? "Loading…" : nativeNfcAvailable ? "NFC ready" : "Practice mode (simulated scans)"}
        </p>

        <button
          type="button"
          className="btn btn-primary play-cta"
          disabled={contentLoading}
          onClick={() => goPlaySession()}
        >
          {hasSaved() ? "Session" : "New session"}
        </button>

        {hasSaved() ? (
          <button
            type="button"
            className="btn play-cta-secondary"
            disabled={contentLoading}
            onClick={() => void resumeSaved()}
          >
            Continue last match
          </button>
        ) : null}

        {devUnlocked ? (
          <div className="play-dev-row">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => goRuntimeLab()}>
              Runtime Lab
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => goSettings()}>
              Settings
            </button>
          </div>
        ) : (
          <p className="muted play-hint">Long-press the eyebrow label to unlock developer tools.</p>
        )}
      </div>
    </div>
  )
}
