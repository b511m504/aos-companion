export const sessionsDomain = {
  name: 'sessions',
  handles() {
    return false
  },
  guard() {
    return { ok: false, reason: 'unsupported_action' }
  },
  transition() {
    return { handled: false }
  },
  invariants() {
    return []
  },
  selectors: {},
  replayExpectation(result) {
    return { handled: Boolean(result?.handled), outcome: String(result?.outcome || '') }
  },
  serializeSnapshot(state) {
    return {
      runtimeEpoch: Number(state?.runtimeEpoch || 0),
      runtimeActionSequence: Number(state?.runtimeActionSequence || 0),
    }
  },
  recover({ reason }) {
    return { reason, patch: { runtimeGateWarning: `Sessions recovery: ${reason}` } }
  },
  initialize() {
    return null
  },
  suspend() {
    return null
  },
  resume() {
    return null
  },
  reset() {
    return null
  },
}