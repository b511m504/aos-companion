import { useAppStore } from "@/store/useAppStore"
import { isDevToolsUnlocked } from "@/play/devMode"

const PLAY_SCREENS = new Set([
  "play_home",
  "play_session",
  "play_assign",
  "play_table",
  "play_unit"
])

/**
 * Dev-only chrome. Play mode uses its own in-screen navigation.
 */
export function AppScreenChrome() {
  const screen = useAppStore((s) => s.screen)
  const goStart = useAppStore((s) => s.goStart)
  const goRuntimeLab = useAppStore((s) => s.goRuntimeLab)
  const goSettings = useAppStore((s) => s.goSettings)
  const goSystems = useAppStore((s) => s.goSystems)
  const goPlayHome = useAppStore((s) => s.goPlayHome)

  if (!isDevToolsUnlocked()) return null
  if (PLAY_SCREENS.has(screen)) return null
  if (screen === "start") return null

  return (
    <nav className="app-screen-chrome" aria-label="Developer navigation">
      <div className="app-screen-chrome-inner row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => goPlayHome()}>
          Play app
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => goStart()}>
          Dev home
        </button>
        <button
          type="button"
          className={screen === "runtime_lab" ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
          onClick={() => goRuntimeLab()}
        >
          Runtime Lab
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => goSettings()}>
          Settings
        </button>
        <span className="app-screen-chrome-sep" aria-hidden="true" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => goSystems()}>
          Legacy session
        </button>
      </div>
    </nav>
  )
}
