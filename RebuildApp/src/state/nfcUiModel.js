/**
 * NFC UI state model (render-time contract)
 *
 * LAYER 1 — Active session linkage (authoritative for linked visuals):
 * - state.nfcAssignments / state.assignedTags
 *
 * LAYER 2 — Historical recognition memory (never drives base card render):
 * - state.nfcHistoricalTags
 *
 * LAYER 3 — Live interaction state (ephemeral):
 * - state.nfcScanPhase, state.selectedEntityId, state.lastAssignmentResult, modals/highlights
 *
 * Package ownership note:
 * - package/list membership is informational (`activeRoster`, `runtimeRegistry`).
 * - it does NOT imply NFC linkage and must never auto-mark cards linked.
 */

export function isLinkedNow(state, entityId) {
  return Boolean(state.nfcAssignments?.[entityId]?.uid)
}

/**
 * Card render order:
 * 1) linkedNow (active linkage only)
 * 2) live interaction state
 * 3) default blank (unassigned)
 *
 * Historical memory is intentionally excluded from this derivation.
 */
export function deriveNfcCardState(state, entityId) {
  if (state.activeNfcConflict?.targetUnitId === entityId) return 'identity-pending'
  if (state.nfcIdentityModal?.requestedEntityId === entityId) return 'identity-pending'

  if (isLinkedNow(state, entityId)) return 'assigned'

  const focused = state.selectedEntityId === entityId || state.selectedUnitId === entityId
  if (!focused) return 'unassigned'

  if (state.nfcScanPhase === 'scanning') return 'active-scanning'

  const r = state.lastAssignmentResult
  const target =
    r?.requestedEntityId ?? r?.requestedUnitId ?? state.selectedEntityId ?? state.selectedUnitId
  const isTarget = target === entityId
  const isErrorPhase = ['write_failure', 'unsupported_tag'].includes(state.nfcScanPhase || 'waiting')
  if (isTarget && r && !r.ok && isErrorPhase) return 'error'

  const historicalKnown = Object.values(state.nfcHistoricalTags || {}).some(
    (entry) => entry?.entityId === entityId
  )
  if (historicalKnown) return 'historically-known'

  return 'focus-wait'
}

