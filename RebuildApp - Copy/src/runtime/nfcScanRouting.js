/**
 * NFC scan routing — which launcher screens accept RUNTIME_NFC_SCAN without a hydrated roster.
 * @see docs/NFC_ENTITY_SCAN_ARCH.md
 */

/** Package launcher / browse flows: scans resolve from assignedTags + optional runtimeRegistry only. */
export const NFC_PACKAGE_BROWSE_SCREENS = new Set([
  'package-selection',
  'faction-selection',
  'theme-selection',
  'game-selection',
  'home',
])

/** Screens that use roster-backed entity cards when a list is loaded. */
export const NFC_ROSTER_CONTEXT_SCREENS = new Set(['roster-viewer', 'nfc-assignment', 'runtime'])

export function isPackageBrowseNfcScreen(screen) {
  return NFC_PACKAGE_BROWSE_SCREENS.has(String(screen || ''))
}

export function isRosterContextNfcScreen(screen) {
  return NFC_ROSTER_CONTEXT_SCREENS.has(String(screen || ''))
}

/**
 * NFC_SCAN may run on package browse without activeRoster; other screens need roster units.
 */
export function nfcScanAllowsEmptyRoster(state) {
  return isPackageBrowseNfcScreen(state?.currentScreen)
}
