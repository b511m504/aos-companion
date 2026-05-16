import { NFC_WINDOW_TAG } from "@/nfcValidation/nfcValidationConstants"
import { getNfcManager } from "@/services/NFCManager"

/**
 * Dispatches the same window event name the Android bridge uses, then feeds {@link NFCManager}
 * when native window hooks are not attached (simulated / web), avoiding double-delivery on Android native.
 */
export function injectSyntheticNfcEvent(detail: Record<string, unknown>): void {
  window.dispatchEvent(new CustomEvent(NFC_WINDOW_TAG, { detail }))
  const mgr = getNfcManager()
  if (!mgr.isNativeTagListenerAttached()) {
    mgr.injectCanonicalTagEvent(detail)
  }
}

/** Minimal canonical-shaped payload for harness scans (uid is authoritative for NFCManager). */
export function buildSyntheticCanonicalTagPayload(params: {
  uid: string
  synthetic?: boolean
  pureReaderModeTest?: boolean
}): Record<string, unknown> {
  const now = Date.now()
  return {
    uid: params.uid,
    synthetic: params.synthetic ?? false,
    technologies: [],
    messages: [],
    timestamp: now,
    nativeCallbackUptimeMs: now % 1_000_000,
    transport: "reader_mode",
    PURE_READERMODE_TEST: params.pureReaderModeTest ?? false
  }
}
