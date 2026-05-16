import { patchNfcPipelineMetrics, nfcBridgeHeartbeat } from '../nfcRuntime/nfcBridgeHeartbeat.js'
import { getRuntimeJournalSnapshot } from './runtimeEventJournal.js'
import { getRuntimeSnapshots } from './runtimeSnapshots.js'
import { getSelectorInstrumentationSnapshot } from './runtimeSelectorInstrumentation.js'

function statusFromUtil(journalUtil, snapshotUtil, queueDepth) {
  if (journalUtil > 0.9 || snapshotUtil > 0.9 || queueDepth > 24) return 'warning'
  if (journalUtil > 0.75 || snapshotUtil > 0.75 || queueDepth > 16) return 'elevated'
  return 'ok'
}

export function updateRuntimeMemoryPressure(extra = {}) {
  const journal = getRuntimeJournalSnapshot()
  const snapshots = getRuntimeSnapshots()
  const selector = getSelectorInstrumentationSnapshot()
  const journalUtilization = Math.min(1, journal.length / 128)
  const snapshotUtilization = Math.min(1, snapshots.length / 48)
  const replayCacheSize = Number(extra.replayCacheSize || 0)
  const queueDepth = Number(nfcBridgeHeartbeat.scanQueueDepth || 0)
  const status = statusFromUtil(journalUtilization, snapshotUtilization, queueDepth)
  patchNfcPipelineMetrics({
    runtimeMemoryPressureStatus: status,
    runtimeJournalUtilization: journalUtilization,
    runtimeSnapshotUtilization: snapshotUtilization,
    runtimeReplayCacheSize: replayCacheSize,
    selectorMemoCacheSize: selector.selectorMemoCacheSize,
  })
  if (status === 'warning') {
    console.warn('SPEARHEAD_RUNTIME_MEMORY pressure_warning', {
      journalUtilization,
      snapshotUtilization,
      queueDepth,
      replayCacheSize,
      selectorMemoCacheSize: selector.selectorMemoCacheSize,
    })
  }
}

