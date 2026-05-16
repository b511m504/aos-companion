import { RUNTIME_ACTION_TYPES } from '../../runtimeActionSchema.js'
import { nfcScanAllowsEmptyRoster } from '../../nfcScanRouting.js'

const NFC_NAV_SCREENS = new Set([
  'roster-viewer',
  'nfc-assignment',
  'package-selection',
  'faction-selection',
  'theme-selection',
  'game-selection',
  'home',
  'runtime',
])

export function guardNfcScan(state, action) {
  const uid = String(action.uid || '').trim()
  if (!uid) return { ok: false, reason: 'missing_uid' }
  if (!NFC_NAV_SCREENS.has(state.currentScreen)) {
    return { ok: false, reason: 'nfc_screen_ineligible' }
  }
  if (state.activeNfcConflict || state.nfcIdentityModal) {
    return { ok: false, reason: 'nfc_ui_blocking' }
  }
  const hasRosterUnits = Boolean(state.activeRoster?.units?.length)
  if (!hasRosterUnits && !nfcScanAllowsEmptyRoster(state)) {
    return { ok: false, reason: 'no_roster' }
  }
  return { ok: true }
}

export function guardEntityAction(state, action) {
  if (action.type === RUNTIME_ACTION_TYPES.PACKAGE_SEMANTIC_ACTION) {
    const entityId = String(action.entityId || action.payload?.entityId || '').trim()
    if (!entityId) return { ok: false, reason: 'missing_entityId' }
    if (state.appMode !== 'runtime') return { ok: false, reason: 'not_runtime_mode' }
    if (state.currentScreen !== 'runtime') return { ok: false, reason: 'not_runtime_screen' }
    if (!state.runtimeUnits || !state.runtimeUnits[entityId]) return { ok: false, reason: 'unknown_entity' }
    return { ok: true }
  }
  if (action.type === RUNTIME_ACTION_TYPES.RUNTIME_RESOLVE_TAG) {
    const uid = String(action.uid || '').trim()
    if (!uid) return { ok: false, reason: 'missing_uid' }
    if (state.appMode !== 'runtime') return { ok: false, reason: 'not_runtime_mode' }
    if (state.currentScreen !== 'runtime') return { ok: false, reason: 'not_runtime_screen' }
    if (state.activeNfcConflict || state.nfcIdentityModal) return { ok: false, reason: 'nfc_ui_blocking' }
    if (!state.activeRoster || !Array.isArray(state.activeRoster.units)) return { ok: false, reason: 'no_roster' }
    return { ok: true }
  }
  if (action.type === RUNTIME_ACTION_TYPES.RUNTIME_NFC_SCAN) {
    return guardNfcScan(state, action)
  }
  return { ok: false, reason: 'unsupported_action' }
}
