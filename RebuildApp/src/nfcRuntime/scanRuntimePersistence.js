/**
 * Replay-safe persistence hooks for NFC scan pipeline (abstraction only).
 *
 * Future: IndexedDB / Capacitor Preferences for pending queue, processed-transaction ring,
 * and active runtime context across crash / suspend.
 *
 * Default implementation is in-memory no-op safe for production until wired.
 */

export function createScanRuntimePersistence() {
  /** @type {unknown[]} */
  let pendingMirror = []
  /** @type {string[]} */
  let recentTxMirror = []
  /** @type {Record<string, unknown> | null} */
  let contextMirror = null

  return {
    /** @param {unknown[]} queueSnapshot */
    savePendingQueue(queueSnapshot) {
      pendingMirror = Array.isArray(queueSnapshot) ? [...queueSnapshot] : []
    },

    loadPendingQueue() {
      return [...pendingMirror]
    },

    /** @param {string[]} ids */
    saveRecentTransactions(ids) {
      recentTxMirror = Array.isArray(ids) ? [...ids] : []
    },

    loadRecentTransactions() {
      return [...recentTxMirror]
    },

    /** @param {Record<string, unknown> | null} ctx */
    saveActiveContext(ctx) {
      contextMirror = ctx && typeof ctx === 'object' ? { ...ctx } : null
    },

    loadActiveContext() {
      return contextMirror ? { ...contextMirror } : null
    },
  }
}
