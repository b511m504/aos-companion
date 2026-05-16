export const packagesDomain = {
  name: 'packages',
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
      packageId: state?.selectedPackage || '',
      runtimeGroupId: state?.selectedLauncherGroupKey || '',
    }
  },
  recover({ reason }) {
    return { reason, patch: { runtimeGateWarning: `Packages recovery: ${reason}` } }
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