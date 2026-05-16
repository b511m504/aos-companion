import { RUNTIME_ACTION_TYPES } from './runtimeActionSchema.js'
import { nfcScanAllowsEmptyRoster } from './nfcScanRouting.js'
import { guardGameplayAction } from './domains/gameplay/guards.js'

/**
 * Transition guards — no partial mutations; reject before dispatch.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function assertRuntimeTransition(state, action) {
  if (!action || typeof action.type !== 'string') {
    return { ok: false, reason: 'missing_type' }
  }
  const currentEpoch = Number(state?.runtimeEpoch || 0)
  const actionEpoch = Number(action?.runtimeEpoch ?? currentEpoch)
  if (actionEpoch !== currentEpoch) {
    return { ok: false, reason: 'stale_epoch_rejected' }
  }
  const currentSeq = Number(state?.runtimeActionSequence || 0)
  const actionSeq = Number(action?.actionSequence || currentSeq + 1)
  if (actionSeq <= currentSeq) {
    return { ok: false, reason: 'stale_sequence_rejected' }
  }

  switch (action.type) {
    case RUNTIME_ACTION_TYPES.RUNTIME_RESOLVE_TAG: {
      const uid = String(action.uid || '').trim()
      if (!uid) return { ok: false, reason: 'missing_uid' }
      if (state.appMode !== 'runtime') return { ok: false, reason: 'not_runtime_mode' }
      if (state.currentScreen !== 'runtime') return { ok: false, reason: 'not_runtime_screen' }
      if (state.activeNfcConflict || state.nfcIdentityModal) {
        return { ok: false, reason: 'nfc_ui_blocking' }
      }
      if (!state.activeRoster || !Array.isArray(state.activeRoster.units)) {
        return { ok: false, reason: 'no_roster' }
      }
      return { ok: true }
    }
    case RUNTIME_ACTION_TYPES.RUNTIME_NFC_SCAN: {
      const uid = String(action.uid || '').trim()
      if (!uid) return { ok: false, reason: 'missing_uid' }
      if (state.activeNfcConflict || state.nfcIdentityModal) {
        return { ok: false, reason: 'nfc_ui_blocking' }
      }
      const hasRosterUnits = Boolean(state.activeRoster?.units?.length)
      if (!hasRosterUnits && !nfcScanAllowsEmptyRoster(state)) {
        return { ok: false, reason: 'no_roster' }
      }
      const allowed = new Set([
        'roster-viewer',
        'nfc-assignment',
        'package-selection',
        'faction-selection',
        'theme-selection',
        'game-selection',
        'home',
        'runtime',
      ])
      if (!allowed.has(state.currentScreen)) {
        return { ok: false, reason: 'nfc_screen_ineligible' }
      }
      return { ok: true }
    }
    default: {
      if (String(action.type || '').startsWith('GAMEPLAY_')) {
        return guardGameplayAction(state, action)
      }
      return { ok: false, reason: 'unsupported_action' }
    }
  }
}
