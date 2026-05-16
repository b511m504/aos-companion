export const scenariosDomain = {
  name: 'scenarios',
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
      runtimeSuspendEpoch: Number(state?.runtimeSuspendEpoch || 0),
    }
  },
  recover({ reason }) {
    return { reason, patch: { runtimeGateWarning: `Scenarios recovery: ${reason}` } }
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