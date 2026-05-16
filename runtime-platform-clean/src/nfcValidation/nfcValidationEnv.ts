import { isDevToolsUnlocked } from "@/play/devMode"
import { NFC_VALIDATION_SESSION_KEY, NFC_VALIDATION_VIBRATE_KEY } from "@/nfcValidation/nfcValidationConstants"

function captureUrlOverride(): void {
  if (typeof window === "undefined") return
  const p = new URLSearchParams(window.location.search)
  if (p.get("nfcValidate") === "1" || p.get("nfc_diag") === "1") {
    sessionStorage.setItem(NFC_VALIDATION_SESSION_KEY, "1")
  }
}

captureUrlOverride()

/**
 * Dev: always on. Production: `VITE_NFC_VALIDATION_HUD=true` build, or open once with
 * `?nfcValidate=1` / `?nfc_diag=1` (stored in sessionStorage for that WebView session).
 */
export function isNfcValidationHudEnabled(): boolean {
  if (typeof window === "undefined") return false
  if (!isDevToolsUnlocked()) return false
  if (import.meta.env.VITE_NFC_VALIDATION_HUD === "true") return true
  return sessionStorage.getItem(NFC_VALIDATION_SESSION_KEY) === "1"
}

export function isNfcValidationVibrateEnabled(): boolean {
  if (typeof window === "undefined") return true
  return localStorage.getItem(NFC_VALIDATION_VIBRATE_KEY) !== "0"
}

export function setNfcValidationVibrateEnabled(on: boolean): void {
  localStorage.setItem(NFC_VALIDATION_VIBRATE_KEY, on ? "1" : "0")
}
