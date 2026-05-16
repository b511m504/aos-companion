import { renderNfcAssignmentRuntimeScreen } from '../nfcRuntime/nfcUiBindings.js'

export function renderNfcAssignmentScreen(state, nfcRuntime) {
  const units = state.activeRoster?.units || []
  return renderNfcAssignmentRuntimeScreen(state, nfcRuntime, units)
}
