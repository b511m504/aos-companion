/**
 * Watchdog kind strings for journalRuntimeEvent / diagnostics (no hard crashes).
 */
export const WATCHDOG_EVENT = {
  QUEUE_OVERFLOW: 'watchdog_queue_overflow',
  SCAN_STORM: 'watchdog_scan_storm',
  SUSPEND_STUCK: 'watchdog_suspend_stuck',
  EFFECT_RETRY_LOOP: 'watchdog_effect_retry_loop',
  JOURNAL_PRESSURE: 'watchdog_journal_pressure',
}

/**
 * Deterministic same-UID storm gate (sliding window by timestamps, no randomness).
 * @param {{ windowMs: number, maxSameUid: number }} opts
 */
export function createScanStormGate(opts) {
  const windowMs = Math.max(50, Number(opts?.windowMs || 420))
  const maxSameUid = Math.max(2, Number(opts?.maxSameUid || 7))
  /** @type {{ uid: string, at: number }[]} */
  const ring = []

  /**
   * @param {string} uid
   * @param {number} now
   * @returns {{ ok: true } | { ok: false, count: number }}
   */
  return function gate(uid, now) {
    const u = String(uid || '').trim()
    if (!u) return { ok: true }
    while (ring.length > 0 && now - ring[0].at > windowMs) ring.shift()
    ring.push({ uid: u, at: now })
    const count = ring.filter((h) => h.uid === u).length
    if (count > maxSameUid) return { ok: false, count }
    return { ok: true }
  }
}
