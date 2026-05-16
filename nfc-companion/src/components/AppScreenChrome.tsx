import { useAppStore } from "@/store/useAppStore"

/**
 * Persistent top navigation so Runtime Lab is reachable from any non-start screen (mobile / Android).
 */
export function AppScreenChrome() {
  const screen = useAppStore((s) => s.screen)
  const goStart = useAppStore((s) => s.goStart)
  const goRuntimeLab = useAppStore((s) => s.goRuntimeLab)
  const goSettings = useAppStore((s) => s.goSettings)
  const goSystems = useAppStore((s) => s.goSystems)

  if (screen === "start") return null

  return (
    <nav className="app-screen-chrome" aria-label="Primary">
      <div className="app-screen-chrome-inner row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => goStart()}>
          Home
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
