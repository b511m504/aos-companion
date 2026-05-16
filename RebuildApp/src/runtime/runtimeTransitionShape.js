/**
 * Structural checks for pure transition outputs before apply.
 * Does not deep-clone or stringify patches (keeps hot path cheap).
 */

function isDevDeepFreezeEnabled() {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV === true) return true
  } catch {
    /* ignore */
  }
  try {
    return globalThis.__SPEARHEAD_RUNTIME_DEV_FREEZE__ === true
  } catch {
    return false
  }
}

/** @param {object} o */
function deepFreezeObject(o) {
  if (o == null || typeof o !== 'object') return
  Object.freeze(o)
  for (const k of Object.keys(o)) {
    const v = o[k]
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreezeObject(v)
  }
}

/**
 * Dev-only: freeze transition artifacts to catch post-return mutation.
 * Does not freeze live store state.
 * @param {object} result
 */
export function maybeDevDeepFreezeTransitionArtifacts(result) {
  if (!isDevDeepFreezeEnabled() || !result || typeof result !== 'object') return
  try {
    if (result.patch != null && typeof result.patch === 'object' && !Array.isArray(result.patch)) {
      deepFreezeObject(result.patch)
    }
    if (Array.isArray(result.effects)) deepFreezeObject(result.effects)
    if (Array.isArray(result.recordActions)) deepFreezeObject(result.recordActions)
  } catch (e) {
    console.warn('SPEARHEAD_RUNTIME_DEV_FREEZE skipped', String(e?.message || e))
  }
}

/**
 * @param {unknown} result
 * @returns {string | null} error code or null when valid
 */
export function validateRuntimeTransitionResultShape(result) {
  if (result == null) return 'transition_not_object'
  if (typeof result !== 'object') return 'transition_not_object'
  if (typeof result.handled !== 'boolean') return 'handled_not_boolean'
  if (!result.handled) return null
  const { patch, effects, recordActions, outcome, reason } = result
  if (patch != null && (typeof patch !== 'object' || Array.isArray(patch))) return 'patch_invalid'
  if (effects != null && !Array.isArray(effects)) return 'effects_invalid'
  if (recordActions != null && !Array.isArray(recordActions)) return 'record_actions_invalid'
  if (outcome != null && typeof outcome !== 'string') return 'transition_outcome_not_string'
  if (reason != null && typeof reason !== 'string' && typeof reason !== 'number') {
    return 'transition_reason_not_scalar'
  }
  return null
}
