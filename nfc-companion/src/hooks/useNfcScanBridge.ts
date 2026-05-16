import { useEffect } from "react"
import { getNfcManager } from "@/services/NFCManager"
import { useAppStore } from "@/store/useAppStore"

/**
 * Routes NFC reads to assignment linking or validation-only checks (never both).
 */
export function useNfcScanBridge(): void {
  const applyScanUid = useAppStore((s) => s.applyScanUid)
  const applyValidationScan = useAppStore((s) => s.applyValidationScan)

  useEffect(() => {
    const mgr = getNfcManager()
    return mgr.subscribe((uid) => {
      const st = useAppStore.getState()
      if (st.screen === "validate" && st.validationListening) {
        applyValidationScan(uid)
        return
      }
      if (st.awaitingScan) applyScanUid(uid)
    })
  }, [applyScanUid, applyValidationScan])
}
