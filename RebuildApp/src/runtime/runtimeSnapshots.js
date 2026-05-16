import { patchNfcPipelineMetrics } from '../nfcRuntime/nfcBridgeHeartbeat.js'
import { hashRuntimeStateShape } from './runtimeStateHash.js'
import { getRuntimeDomains } from './runtimeDomainRouter.js'
import { runtimeClock } from './runtimeClock.js'

const MAX_SNAPSHOTS = 48
const snapshots = []

export function pushRuntimeSnapshot(state, action) {
  const domainSnapshots = {}
  for (const d of getRuntimeDomains()) {
    if (typeof d.serializeSnapshot === 'function') {
      domainSnapshots[d.name] = d.serializeSnapshot(state)
    }
  }
  snapshots.push({
    at: runtimeClock.now(),
    runtimeGroupId: String(state?.selectedLauncherGroupKey || ''),
    packageId: String(state?.selectedPackage || ''),
    activeEntities: Object.entries(state?.runtimeUnits || {})
      .filter(([, ru]) => ru?.activated || ru?.destroyed)
      .map(([id]) => id)
      .sort(),
    assignmentVersion: Object.keys(state?.nfcAssignments || {}).length,
    scenarioStateVersion: Number(state?.runtimeSuspendEpoch || 0),
    actionSequence: Number(action?.actionSequence || state?.runtimeActionSequence || 0),
    runtimeEpoch: Number(state?.runtimeEpoch || 0),
    hash: hashRuntimeStateShape(state),
    domains: domainSnapshots,
  })
  while (snapshots.length > MAX_SNAPSHOTS) snapshots.shift()
  patchNfcPipelineMetrics({ runtimeSnapshotCount: snapshots.length })
}

export function getRuntimeSnapshots() {
  return [...snapshots]
}