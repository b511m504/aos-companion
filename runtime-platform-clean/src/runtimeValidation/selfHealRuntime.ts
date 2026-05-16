import { getNfcManager } from "@/services/NFCManager"
import { useRuntimeSession } from "@/store/useRuntimeSession"

export async function healClearNfcDedupe(reason: string): Promise<void> {
  console.warn(`[runtimeValidation/selfHeal] heal_clear_nfc_dedupe reason=${reason}`)
  getNfcManager().healClearScanDedupe(reason)
}

export async function healRestartNfcSession(reason: string): Promise<void> {
  console.warn(`[runtimeValidation/selfHeal] heal_restart_nfc_session reason=${reason}`)
  const m = getNfcManager()
  await m.stopListening()
  await m.startListening()
}

export function healRuntimeUnpause(reason: string): void {
  console.warn(`[runtimeValidation/selfHeal] heal_runtime_unpause reason=${reason}`)
  useRuntimeSession.getState().setRuntimePaused(false)
}
