import { createSelector } from './_memo.js'

export const selectRuntimeContext = createSelector(
  'selectRuntimeContext',
  (s) => ({
    runtimeGroupId: s?.selectedLauncherGroupKey || '',
    packageId: s?.selectedPackage || '',
    runtimeEpoch: Number(s?.runtimeEpoch || 0),
    actionSequence: Number(s?.runtimeActionSequence || 0),
    appMode: s?.appMode || '',
    screen: s?.currentScreen || '',
  }),
  (x) => x
)

export const selectScenarioState = createSelector(
  'selectScenarioState',
  (s) => ({
    runtimeSuspendEpoch: Number(s?.runtimeSuspendEpoch || 0),
    runtimeLookupHistoryLen: Array.isArray(s?.runtimeLookupHistory)
      ? s.runtimeLookupHistory.length
      : 0,
  }),
  (x) => x
)

