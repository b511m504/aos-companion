export function createInitialNfcRuntimeState() {
  return {
    activeAssignment: {
      selectedUnitId: null,
      waitingForScan: false,
      lastScannedTagId: '',
      assignments: {},
    },
    diagnostics: {
      available: false,
      enabled: false,
      listenerActive: false,
      lastRawTag: '',
      bridgeName: 'none',
      pluginLoaded: false,
      pluginKeys: [],
      appResumed: false,
      mainActivityAlive: false,
      adapterState: 'unknown',
      bridgePresent: false,
      webViewPresent: false,
      lastIntentAction: '',
      lastPayloadJson: '',
      lastEventAt: '',
      lastLifecycleAt: '',
    },
    units: [],
  }
}

export function cloneNfcRuntimeState(state) {
  return {
    activeAssignment: {
      selectedUnitId: state.activeAssignment.selectedUnitId,
      waitingForScan: state.activeAssignment.waitingForScan,
      lastScannedTagId: state.activeAssignment.lastScannedTagId,
      assignments: { ...(state.activeAssignment.assignments || {}) },
    },
    diagnostics: {
      ...state.diagnostics,
    },
    units: [...(state.units || [])],
  }
}
