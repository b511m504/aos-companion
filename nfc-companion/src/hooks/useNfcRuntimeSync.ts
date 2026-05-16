import { useEffect } from "react"
import { getNfcManager } from "@/services/NFCManager"
import { useAppStore } from "@/store/useAppStore"

/** Keeps UI in sync with NFCManager scan machine (no UI → plugin coupling). */
export function useNfcRuntimeSync(): void {
  const setNfcScanState = useAppStore((s) => s.setNfcScanState)
  const nfcMode = useAppStore((s) => s.nfcMode)

  useEffect(() => {
    getNfcManager().setMode(nfcMode)
  }, [nfcMode])

  useEffect(() => {
    const mgr = getNfcManager()
    const off = mgr.subscribeScanState(setNfcScanState)
    setNfcScanState(mgr.getScanState())
    return off
  }, [setNfcScanState])
}
