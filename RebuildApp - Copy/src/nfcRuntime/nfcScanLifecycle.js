/**
 * Compact grep-friendly scan lifecycle lines (one line per stage).
 * Stages: received | enqueued | dispatched | resolved | committed | rejected | duplicate_suppressed | failed
 */

function esc(s) {
  if (s == null) return ''
  return String(s).replace(/\s+/g, ' ').slice(0, 120)
}

/**
 * @param {string} stage
 * @param {{ uid?: string, transactionId?: string, queueDepth?: number, elapsedMs?: number, sourcePath?: string, note?: string }} fields
 */
export function logScanLifecycle(stage, fields = {}) {
  const {
    uid = '',
    transactionId = '',
    queueDepth = 0,
    elapsedMs,
    sourcePath = '',
    note = '',
  } = fields
  const parts = [
    `SPEARHEAD_NFC_PIPELINE scan_${stage}`,
    `uid=${esc(uid)}`,
    `tx=${esc(transactionId)}`,
    `q=${queueDepth}`,
  ]
  if (sourcePath) parts.push(`src=${esc(sourcePath)}`)
  if (elapsedMs != null && Number.isFinite(elapsedMs)) parts.push(`ms=${Math.round(elapsedMs)}`)
  if (note) parts.push(`note=${esc(note)}`)
  console.warn(parts.join(' '))
}

export function logDuplicateTransactionSuppressed(uid, transactionId, queueDepth) {
  console.warn(
    `SPEARHEAD_NFC_PIPELINE duplicate_transaction_suppressed uid=${esc(uid)} tx=${esc(transactionId)} q=${queueDepth}`
  )
}

export function logQueueWatchdogWarning(reason, detail = {}) {
  console.warn('SPEARHEAD_NFC_PIPELINE queue_watchdog_warning', reason, detail)
}
