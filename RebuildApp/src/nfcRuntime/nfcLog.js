/**
 * NFC logging policy: minimal always-on pipeline lines + optional deep diagnostics.
 *
 * Set `globalThis.__SPEARHEAD_NFC_VERBOSE_DIAG__ = true` in the WebView console to re-enable
 * legacy `SPEARHEAD_ASSIGN_DIAG`-style chatter without a rebuild.
 *
 * Default surface (always on): `SPEARHEAD_NFC_PIPELINE scan_*`, `SPEARHEAD_RUNTIME_ACTION`,
 * `SPEARHEAD_RUNTIME_TRANSITION rejected`, `SPEARHEAD_RUNTIME_RESUME`, `SPEARHEAD_RUNTIME_INVARIANT`.
 */

export function nfcVerboseDiagEnabled() {
  try {
    return typeof globalThis !== 'undefined' && globalThis.__SPEARHEAD_NFC_VERBOSE_DIAG__ === true
  } catch {
    return false
  }
}

/** Verbose assignment / queue / bridge attach tracing (opt-in). */
export function nfcDiag(...args) {
  if (nfcVerboseDiagEnabled()) console.warn(...args)
}

/** One line per meaningful pipeline step (grep: SPEARHEAD_NFC_PIPELINE). */
export function nfcPipeline(...args) {
  console.warn('SPEARHEAD_NFC_PIPELINE', ...args)
}
