import { getRuntimeEngine } from "@/runtime/RuntimeEngine"
import {
  checkRuntimeInvariants,
  type InvariantViolation
} from "@/runtime/invariants/RuntimeInvariants"
import { getNfcManager } from "@/services/NFCManager"

/** Single assertion helper for harness scenarios. */
export function assertRuntimeInvariant(id: string, ok: boolean, detail: string): InvariantViolation | null {
  if (ok) return null
  return { id, detail }
}

/** Structural engine checks plus lightweight NFC / session probes. */
export function checkAllRuntimeInvariants(): InvariantViolation[] {
  const eng = getRuntimeEngine()
  const v = checkRuntimeInvariants(eng)
  const mgr = getNfcManager()
  const st = mgr.getStatus()
  const subs = mgr.getHarnessSubscriptionCounts()
  if (subs.scanHandlers > 50) {
    v.push({ id: "nfc_scan_handler_storm", detail: `scanHandlers=${subs.scanHandlers}` })
  }
  if (st.sessionActive && st.scanState === "error" && st.lastHardwareError) {
    v.push({
      id: "nfc_hardware_error_sticky",
      detail: `${st.lastHardwareError.code}: ${st.lastHardwareError.message}`
    })
  }
  return v
}
