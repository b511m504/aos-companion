import { useEffect } from "react"
import { useAppStore } from "@/store/useAppStore"
import { StartScreen } from "@/screens/StartScreen"
import { GameSystemScreen } from "@/screens/GameSystemScreen"
import { FactionScreen } from "@/screens/FactionScreen"
import { ListSelectionScreen } from "@/screens/ListSelectionScreen"
import { NfcAssignmentWorkspace } from "@/screens/NfcAssignmentWorkspace"
import { SettingsScreen } from "@/screens/SettingsScreen"
import { ValidateScreen } from "@/screens/ValidateScreen"
import { RuntimeLabScreen } from "@/components/runtime-lab/RuntimeLabScreen"
import { AppScreenChrome } from "@/components/AppScreenChrome"
import { useNfcRuntimeSync } from "@/hooks/useNfcRuntimeSync"
import { useNfcScanBridge } from "@/hooks/useNfcScanBridge"
import { useRuntimeSession } from "@/store/useRuntimeSession"

export function App() {
  useNfcRuntimeSync()
  useNfcScanBridge()

  const screen = useAppStore((s) => s.screen)
  const errorBanner = useAppStore((s) => s.errorBanner)
  const clearError = useAppStore((s) => s.clearError)
  const bootstrap = useAppStore((s) => s.bootstrap)
  const probeNfc = useAppStore((s) => s.probeNfc)

  useEffect(() => {
    void bootstrap()
    void probeNfc()
  }, [bootstrap, probeNfc])

  /** Deep link / bookmark: `#runtime_lab` or `?launch=runtime_lab` (Android / Capacitor friendly). */
  useEffect(() => {
    const fromHash = () => {
      const raw = window.location.hash.replace(/^#/, "").trim()
      if (raw === "runtime_lab" || raw === "runtime-lab") {
        useAppStore.getState().goRuntimeLab()
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)
      }
    }
    const fromQuery = () => {
      const params = new URLSearchParams(window.location.search)
      const launch = params.get("launch")?.trim()
      if (launch === "runtime_lab" || launch === "runtime-lab") {
        useAppStore.getState().goRuntimeLab()
        params.delete("launch")
        const q = params.toString()
        window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`)
      }
    }
    fromHash()
    fromQuery()
    window.addEventListener("hashchange", fromHash)
    return () => window.removeEventListener("hashchange", fromHash)
  }, [])

  useEffect(() => {
    useRuntimeSession.getState().registerUiBridge({
      selectEntity: (id) => useAppStore.getState().setSelectedEntity(id)
    })
  }, [])

  return (
    <div className="app-shell">
      <main className="app-main">
        <AppScreenChrome />
        {errorBanner ? (
          <div className="banner-error row-between">
            <span>{errorBanner}</span>
            <button type="button" className="btn btn-ghost" onClick={() => clearError()}>
              Dismiss
            </button>
          </div>
        ) : null}

        {screen === "start" ? <StartScreen /> : null}
        {screen === "system" ? <GameSystemScreen /> : null}
        {screen === "faction" ? <FactionScreen /> : null}
        {screen === "list" ? <ListSelectionScreen /> : null}
        {screen === "nfc" ? <NfcAssignmentWorkspace /> : null}
        {screen === "validate" ? <ValidateScreen /> : null}
        {screen === "settings" ? <SettingsScreen /> : null}
        {screen === "runtime_lab" ? <RuntimeLabScreen /> : null}
      </main>
    </div>
  )
}
