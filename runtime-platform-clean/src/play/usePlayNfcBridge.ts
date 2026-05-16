import { useEffect } from "react"
import { getNfcManager } from "@/services/NFCManager"
import { usePlaySessionStore } from "@/play/playSessionStore"
import { useAppStore } from "@/store/useAppStore"

/**
 * Routes NFC reads for the play-mode tabletop loop (assignment + live table).
 */
export function usePlayNfcBridge(): void {
  const applyScanUid = useAppStore((s) => s.applyScanUid)

  useEffect(() => {
    return getNfcManager().subscribe((uid) => {
      const st = useAppStore.getState()
      if (st.screen === "play_table") {
        usePlaySessionStore.getState().onTableScan(uid)
        return
      }
      if (st.screen === "play_assign" && st.awaitingScan) {
        applyScanUid(uid)
        return
      }
      if (st.screen === "validate" && st.validationListening) {
        st.applyValidationScan(uid)
        return
      }
      if (st.awaitingScan) applyScanUid(uid)
    })
  }, [applyScanUid])
}
