/**
 * NFC → gameplay follow-up dispatch (no gameplay mutation outside store).
 * Call after `RUNTIME_RESOLVE_TAG` / `RUNTIME_NFC_SCAN` commits (resolved, unknown, or duplicate UX).
 */

import { buildGameplayScanDetectedAction } from './domain/nfcGameplayIntent.js'
import { createGameplayAction, GAMEPLAY_ACTION_TYPES } from './domain/gameplayActionTypes.js'
import { RUNTIME_ACTION_TYPES } from './runtime/runtimeActionSchema.js'

function nextGameplayDispatchEnvelope(store, actionFields) {
  const s = store.getState()
  return {
    ...actionFields,
    runtimeEpoch: Number(s.runtimeEpoch || 0),
    actionSequence: Number(s.runtimeActionSequence || 0) + 1,
    receivedAt: Number(actionFields?.receivedAt) || Date.now(),
  }
}

/**
 * @param {{ getState: Function, dispatchRuntimeAction: Function }} store
 * @param {object} envelope normalized NFC envelope
 * @param {string} source diagnostic label
 */
export function dispatchGameplayScanFollowup(store, envelope, source) {
  const uid = String(envelope?.uid || envelope?.tagId || '').trim()
  if (!uid || typeof store.getState !== 'function' || typeof store.dispatchRuntimeAction !== 'function') return

  const s = store.getState()
  const assigned = s.assignedTags?.[uid]
  const assignedEntity = assigned?.unitId || assigned?.entityId || ''
  const fromRegistry = s.gameplay?.entityRegistry?.entityIdByUid?.[uid]
  const resolved =
    String(s.runtimeResolvedUnit?.id || '').trim() ||
    String(fromRegistry || '').trim() ||
    String(s.selectedEntityId || '').trim() ||
    String(s.packageNfcHighlightEntityId || '').trim() ||
    String(assignedEntity || '').trim()

  const intent = buildGameplayScanDetectedAction(
    { uid, resolvedEntityId: resolved || null, source },
    envelope,
    s
  )
  if (!intent) return

  return store.dispatchRuntimeAction(nextGameplayDispatchEnvelope(store, intent))
}

function dispatchGameplayUiFeedback(store, envelope, partialUi) {
  const s = store.getState()
  return store.dispatchRuntimeAction(
    nextGameplayDispatchEnvelope(
      store,
      createGameplayAction(GAMEPLAY_ACTION_TYPES.UI_SET, {
        uid: String(envelope?.uid || envelope?.tagId || '').trim(),
        transactionId: String(envelope?.transactionId || ''),
        payload: partialUi,
        receivedAt: Number(envelope?.receivedAt) || 0,
      })
    )
  )
}

/**
 * @param {{ getState: Function, dispatchRuntimeAction: Function }} store
 * @param {object} action dispatched runtime NFC action
 * @param {object} envelope scan envelope (may equal action fields)
 * @param {'resolved'|'rejected'|'failed'} outcome
 */
export function nfcGameplayAfterRuntimeDispatch(store, action, envelope, outcome) {
  const uid = String(envelope?.uid || envelope?.tagId || action?.uid || '').trim()
  const merged =
    envelope && typeof envelope === 'object'
      ? { ...envelope, uid: uid || envelope.uid, tagId: uid || envelope.tagId }
      : { uid, tagId: uid, transactionId: action?.transactionId, receivedAt: action?.receivedAt }

  const types = [RUNTIME_ACTION_TYPES.RUNTIME_RESOLVE_TAG, RUNTIME_ACTION_TYPES.RUNTIME_NFC_SCAN]
  if (!types.includes(action?.type) || !uid) return

  if (outcome === 'resolved') {
    dispatchGameplayScanFollowup(store, merged, 'nfc_runtime_resolved')
    return
  }

  const s = store.getState()
  const receipt = String(s.nfcScanReceiptState || '')
  if (receipt === 'unknown_tag' || receipt === 'package_entity_missing') {
    const intent = buildGameplayScanDetectedAction(
      { uid, resolvedEntityId: null, source: 'nfc_unknown_tag' },
      merged,
      s
    )
    if (intent) store.dispatchRuntimeAction(nextGameplayDispatchEnvelope(store, intent))
    return
  }

  if (receipt === 'duplicate_ignored' || receipt === 'package_scan_ignored') {
    dispatchGameplayUiFeedback(store, merged, {
      feedback: { kind: 'duplicate_scan', uid, receipt },
    })
  }
}
