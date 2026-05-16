import { runtimeClock } from './runtimeClock.js'
/**
 * Normalized runtime actions — downstream consumes these, not raw NFC envelopes.
 * @see docs/NFC_RUNTIME_PIPELINE.md
 */

export const RUNTIME_ACTION_TYPES = Object.freeze({
  ENTITY_ACTIVATE: 'ENTITY_ACTIVATE',
  ENTITY_DEACTIVATE: 'ENTITY_DEACTIVATE',
  PACKAGE_LOAD: 'PACKAGE_LOAD',
  PACKAGE_UNLOAD: 'PACKAGE_UNLOAD',
  SCENARIO_START: 'SCENARIO_START',
  SCENARIO_END: 'SCENARIO_END',
  TAG_UNBOUND: 'TAG_UNBOUND',
  TAG_UNKNOWN: 'TAG_UNKNOWN',
  ASSIGNMENT_COMMIT: 'ASSIGNMENT_COMMIT',
  /** Primary path today: NFC scan → runtime unit resolution (maps to store.resolveRuntimeTag). */
  RUNTIME_RESOLVE_TAG: 'RUNTIME_RESOLVE_TAG',
  /** NFC scan → entity resolution + roster selection (browse / roster / non-match runtime screen). */
  RUNTIME_NFC_SCAN: 'RUNTIME_NFC_SCAN',
  /** Generic package-defined semantic mutation, resolved from UID/entity mapping data. */
  PACKAGE_SEMANTIC_ACTION: 'PACKAGE_SEMANTIC_ACTION',
})

/**
 * @param {string} type
 * @param {object} fields
 */
export function createRuntimeAction(type, fields) {
  const {
    transactionId = '',
    uid = '',
    entityId = null,
    packageId = '',
    runtimeGroupId = '',
    receivedAt = runtimeClock.now(),
    actionSequence = 0,
    runtimeEpoch = 0,
    payload = {},
  } = fields || {}
  return {
    type,
    transactionId,
    uid,
    entityId,
    packageId,
    runtimeGroupId,
    receivedAt,
    actionSequence,
    runtimeEpoch,
    payload,
  }
}

/**
 * @param {Record<string, unknown>} envelope normalized scan envelope from nfcController
 * @param {object} state store snapshot (read-only)
 */
export function buildRuntimeResolveTagAction(envelope, state) {
  return createRuntimeAction(RUNTIME_ACTION_TYPES.RUNTIME_RESOLVE_TAG, {
    transactionId: String(envelope?.transactionId || ''),
    uid: String(envelope?.uid || envelope?.tagId || '').trim(),
    entityId: null,
    packageId: String(state?.selectedPackage || ''),
    runtimeGroupId: String(state?.selectedLauncherGroupKey || ''),
    receivedAt: Number(envelope?.receivedAt) || runtimeClock.now(),
    actionSequence: Number(state?.runtimeActionSequence || 0) + 1,
    runtimeEpoch: Number(state?.runtimeEpoch || 0),
    payload: typeof envelope === 'object' && envelope ? { ...envelope } : {},
  })
}

/**
 * Same envelope shape as resolve-tag; used when scans should drive roster selection + lookup outside strict match runtime.
 */
export function buildRuntimeNfcScanAction(envelope, state) {
  return createRuntimeAction(RUNTIME_ACTION_TYPES.RUNTIME_NFC_SCAN, {
    transactionId: String(envelope?.transactionId || ''),
    uid: String(envelope?.uid || envelope?.tagId || '').trim(),
    entityId: null,
    packageId: String(state?.selectedPackage || ''),
    runtimeGroupId: String(state?.selectedLauncherGroupKey || ''),
    receivedAt: Number(envelope?.receivedAt) || runtimeClock.now(),
    actionSequence: Number(state?.runtimeActionSequence || 0) + 1,
    runtimeEpoch: Number(state?.runtimeEpoch || 0),
    payload: typeof envelope === 'object' && envelope ? { ...envelope } : {},
  })
}

/**
 * Emit semantic package action after UID resolution.
 * Keeps runtime generic and deterministic (no direct state mutation by NFC handler).
 */
export function buildPackageSemanticAction({ state, uid, entityId, semanticEntityId, actionId, payload = {} }) {
  const s = state && typeof state === 'object' ? state : {}
  const txSuffix = `${String(uid || '').trim()}_${String(actionId || '').trim()}`.replace(/[^\w-]/g, '_')
  return createRuntimeAction(RUNTIME_ACTION_TYPES.PACKAGE_SEMANTIC_ACTION, {
    transactionId: `pkg_sem_${txSuffix}_${Number(s.runtimeActionSequence || 0) + 1}`,
    uid: String(uid || '').trim(),
    entityId: String(entityId || '').trim(),
    packageId: String(s.selectedPackage || ''),
    runtimeGroupId: String(s.selectedLauncherGroupKey || ''),
    receivedAt: runtimeClock.now(),
    actionSequence: Number(s.runtimeActionSequence || 0) + 1,
    runtimeEpoch: Number(s.runtimeEpoch || 0),
    payload: {
      semanticEntityId: String(semanticEntityId || '').trim(),
      actionId: String(actionId || '').trim(),
      ...payload,
    },
  })
}
