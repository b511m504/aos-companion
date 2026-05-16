/**
 * Pure mapping: NFC / roster resolution outcome → gameplay intent action (not dispatched here).
 * Call site (e.g. after `dispatchRuntimeAction` for RUNTIME_*`) may dispatch the returned action.
 */

import { createGameplayAction, GAMEPLAY_ACTION_TYPES } from './gameplayActionTypes.js'

/**
 * @param {{ uid: string, resolvedEntityId?: string|null, source?: string }} ctx
 * @param {object} envelope normalized NFC envelope fields (transactionId, receivedAt, …)
 * @param {object} state store snapshot
 * @returns {object | null} fields to merge into a full dispatch action (caller adds epoch/sequence)
 */
export function buildGameplayScanDetectedAction(ctx, envelope, state) {
  const uid = String(ctx?.uid || '').trim()
  if (!uid) return null
  const resolvedEntityId = ctx?.resolvedEntityId != null ? String(ctx.resolvedEntityId) : ''
  return createGameplayAction(GAMEPLAY_ACTION_TYPES.ENTITY_SCAN_DETECTED, {
    uid,
    entityId: resolvedEntityId || null,
    packageId: String(state?.selectedPackage || ''),
    runtimeGroupId: String(state?.selectedLauncherGroupKey || ''),
    receivedAt: Number(envelope?.receivedAt) || 0,
    transactionId: String(envelope?.transactionId || ''),
    payload: {
      source: String(ctx?.source || 'nfc'),
      resolvedEntityId: resolvedEntityId || null,
    },
  })
}
