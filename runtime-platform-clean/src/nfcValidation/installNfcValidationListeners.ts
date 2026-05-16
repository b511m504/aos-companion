import {
  NFC_WINDOW_ERROR,
  NFC_WINDOW_READER_PROBE,
  NFC_WINDOW_TAG,
  NFC_WINDOW_TRANSPORT
} from "@/nfcValidation/nfcValidationConstants"
import { isNfcValidationHudEnabled, isNfcValidationVibrateEnabled } from "@/nfcValidation/nfcValidationEnv"
import { useNfcValidationStore } from "@/nfcValidation/nfcValidationStore"

declare global {
  interface Window {
    __nfcValidationListenersInstalled?: boolean
  }
}

function parseWindowPayload(ev: Event): Record<string, unknown> {
  const e = ev as CustomEvent<unknown> & Record<string, unknown>
  const d = e.detail
  if (d && typeof d === "object" && !Array.isArray(d)) return d as Record<string, unknown>
  return e as Record<string, unknown>
}

function nfcValidationFlash(): void {
  let el = document.getElementById("nfc-validation-flash")
  if (!el) {
    el = document.createElement("div")
    el.id = "nfc-validation-flash"
    el.setAttribute(
      "style",
      [
        "position:fixed",
        "inset:0",
        "z-index:2147483646",
        "pointer-events:none",
        "background:rgba(72,237,180,0.5)",
        "opacity:0",
        "transition:opacity 55ms ease-out"
      ].join(";")
    )
    document.body.appendChild(el)
  }
  const node = el
  node.style.opacity = "0"
  void node.offsetWidth
  node.style.opacity = "1"
  window.setTimeout(() => {
    node.style.opacity = "0"
  }, 95)
}

function vibrateShort(): void {
  if (!isNfcValidationVibrateEnabled()) return
  try {
    void navigator.vibrate?.(14)
  } catch {
    /* ignore */
  }
}

function wireAppLifecycle(): void {
  void import("@capacitor/app")
    .then(({ App }) =>
      App.addListener("appStateChange", ({ isActive }) => {
        useNfcValidationStore.getState().recordAppLifecycle(isActive ? "active" : "background")
      })
    )
    .catch(() => {
      useNfcValidationStore.getState().recordAppLifecycle("app_plugin_unavailable")
    })
}

/**
 * Registers capture-phase NFC listeners and immediate flash **before** React / `NFCManager` bubble handlers.
 * Import this module first from `main.tsx` when the validation HUD may be enabled.
 */
export function installNfcValidationListeners(): void {
  if (!isNfcValidationHudEnabled()) return
  if (typeof window === "undefined") return
  if (window.__nfcValidationListenersInstalled) return
  window.__nfcValidationListenersInstalled = true

  wireAppLifecycle()

  const onTransport = (ev: Event) => {
    useNfcValidationStore.getState().recordTransport(parseWindowPayload(ev))
  }

  const onProbe = (ev: Event) => {
    const payload = parseWindowPayload(ev)
    const now = performance.now()
    const phase = typeof payload.phase === "string" ? payload.phase : ""
    if (phase === "callback_entry") {
      nfcValidationFlash()
      vibrateShort()
    }
    useNfcValidationStore.getState().recordReaderProbe(payload, now)
  }

  const onTag = (ev: Event) => {
    const payload = parseWindowPayload(ev)
    const now = performance.now()
    useNfcValidationStore.getState().recordCanonicalTag(payload, now)
  }

  const onErr = (ev: Event) => {
    const payload = parseWindowPayload(ev)
    const msg =
      typeof payload.message === "string"
        ? payload.message
        : typeof payload.code === "string"
          ? payload.code
          : "error"
    useNfcValidationStore.getState().pushTimeline("aosNativeNfcScanError", msg)
  }

  window.addEventListener(NFC_WINDOW_TRANSPORT, onTransport, true)
  window.addEventListener(NFC_WINDOW_READER_PROBE, onProbe, true)
  window.addEventListener(NFC_WINDOW_TAG, onTag, true)
  window.addEventListener(NFC_WINDOW_ERROR, onErr, true)
}

installNfcValidationListeners()
