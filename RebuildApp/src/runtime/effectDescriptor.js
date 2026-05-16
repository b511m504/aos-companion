/**
 * Deterministic effect descriptor metadata for replay, ordering, and sync.
 */

/**
 * @param {object[]} effects
 * @param {object} action normalized runtime action
 * @returns {object[]}
 */
export function stampEffectDescriptors(effects, action) {
  const list = Array.isArray(effects) ? effects : []
  const tx = String(action?.transactionId || action?.uid || 'unknown_tx')
  const causedByAction = {
    type: String(action?.type || ''),
    actionSequence: Number(action?.actionSequence ?? 0),
    runtimeEpoch: Number(action?.runtimeEpoch ?? 0),
    uid: action?.uid != null ? String(action.uid) : '',
  }
  return list.map((eff, i) => {
    const base = eff && typeof eff === 'object' ? eff : { type: String(eff) }
    const effectId =
      base.effectId != null && String(base.effectId).trim()
        ? String(base.effectId).trim()
        : `${tx}:e${i}`
    const payload =
      base.payload && typeof base.payload === 'object' && !Array.isArray(base.payload)
        ? { ...base.payload }
        : {}
    return {
      ...base,
      type: String(base.type || ''),
      replayPolicy: String(base.replayPolicy || 'simulate'),
      payload,
      effectId,
      transactionId: base.transactionId != null ? String(base.transactionId) : tx,
      causedByAction: base.causedByAction && typeof base.causedByAction === 'object' ? base.causedByAction : causedByAction,
    }
  })
}
