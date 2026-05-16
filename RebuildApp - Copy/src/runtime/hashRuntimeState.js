/**
 * Deterministic runtime state hashing for replay verification, snapshots, and future sync.
 * Uses sorted-key stable stringify + FNV-1a 32 (same as runtimeStateHash.js).
 */

import { stableStringify, fnv1a32, hashRuntimeStateShape } from './runtimeStateHash.js'

/**
 * Keys included in `mode: 'full'` — gameplay + routing slice only (omit UI-only noise where possible).
 * Extend deliberately when new persisted gameplay fields are added.
 */
export const RUNTIME_FULL_HASH_KEYS = [
  'runtimeEpoch',
  'runtimeActionSequence',
  'runtimeTransitionFrozen',
  'runtimeSuspendEpoch',
  'currentScreen',
  'appMode',
  'selectedPackage',
  'selectedLauncherGroupKey',
  'activeThemeId',
  'runtimeRegistry',
  'activeRoster',
  'runtimeUnits',
  'nfcAssignments',
  'assignedTags',
  'nfcHistoricalTags',
  'runtimeResolvedTag',
  'runtimeResolvedUnit',
  'runtimeLastLookupResult',
  'runtimeLookupHistory',
  'packageNfcHighlightEntityId',
  'packageNfcHighlightTagId',
  'packageNfcLookupSource',
  'packageBrowseNfcEntityCount',
  'nfcLastScanRoute',
  'gameplay',
]

/**
 * @param {object} state
 * @param {{ mode?: 'shape' | 'full' }} [options]
 * @returns {string} hex hash
 */
export function hashRuntimeState(state, options = {}) {
  const mode = options.mode === 'full' ? 'full' : 'shape'
  if (mode === 'shape') return hashRuntimeStateShape(state)
  const slice = {}
  for (const k of RUNTIME_FULL_HASH_KEYS) {
    if (state && Object.prototype.hasOwnProperty.call(state, k)) {
      slice[k] = state[k]
    }
  }
  return fnv1a32(stableStringify(slice))
}

export { stableStringify, fnv1a32 } from './runtimeStateHash.js'
