/**
 * Internal NFC intercept audit — no user-visible UI.
 * Logs one terminal route per interceptScan invocation (pre-commit path).
 */

const seenTx = new Set()
const SEEN_TX_CAP = 64

function rememberTx(tx) {
  if (!tx) return
  seenTx.add(tx)
  while (seenTx.size > SEEN_TX_CAP) {
    const first = seenTx.values().next().value
    seenTx.delete(first)
  }
}

/**
 * @param {string} routeId One of: runtime | validation | assignment_queue | rejected_no_pair | rejected_idle
 * @param {{ transactionId?: string, currentScreen?: string, appMode?: string }} ctx
 */
export function recordNfcInterceptRoute(routeId, ctx = {}) {
  const tx = String(ctx.transactionId || '')
  if (tx && seenTx.has(tx)) {
    console.warn('SPEARHEAD_NFC_INVARIANT', 'duplicate_intercept_tx', { tx, routeId })
  }
  if (tx) rememberTx(tx)

  if (import.meta.env.DEV) {
    console.debug('SPEARHEAD_NFC_ROUTE', {
      routeId,
      tx: tx || undefined,
      screen: ctx.currentScreen,
      appMode: ctx.appMode,
    })
  }
}

/**
 * @param {{ currentScreen?: string, appMode?: string, selectedPackage?: string }} s
 */
export function warnIfOperatorRoutingInvariantBroken(s) {
  const screen = String(s?.currentScreen || '')
  const mode = String(s?.appMode || '')
  const op = String(s?.selectedPackage || '').startsWith('operator:')
  if (!op) return
  if (screen === 'operator-validation' && mode === 'nfc_assignment') {
    console.warn('SPEARHEAD_NFC_INVARIANT', 'operator_validation_screen_with_nfc_assignment_mode')
  }
}
