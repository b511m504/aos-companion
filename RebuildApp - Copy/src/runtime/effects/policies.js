export const RUNTIME_EFFECT_REPLAY_POLICY = Object.freeze({
  SUPPRESS: 'suppress',
  SIMULATE: 'simulate',
  REPLAY: 'replay',
})

export function shouldExecuteEffect(effect, ctx) {
  const policy = effect?.replayPolicy || RUNTIME_EFFECT_REPLAY_POLICY.SIMULATE
  if (!ctx?.replayed) return true
  if (policy === RUNTIME_EFFECT_REPLAY_POLICY.REPLAY) return true
  return false
}

export function shouldSimulateEffect(effect, ctx) {
  const policy = effect?.replayPolicy || RUNTIME_EFFECT_REPLAY_POLICY.SIMULATE
  return Boolean(ctx?.replayed) && policy === RUNTIME_EFFECT_REPLAY_POLICY.SIMULATE
}

