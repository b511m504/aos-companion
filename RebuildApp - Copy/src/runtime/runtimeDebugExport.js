import { getRuntimeJournalSnapshot } from './runtimeEventJournal.js'
import { getRuntimeSnapshots } from './runtimeSnapshots.js'
import { hashRuntimeStateShape } from './runtimeStateHash.js'
import { getRuntimeDomainOwnership } from './runtimeDomainRouter.js'
import { getRuntimeEffectsStats } from './effects/index.js'
import { getSelectorInstrumentationSnapshot } from './runtimeSelectorInstrumentation.js'
import { gameplayDomain } from './domains/gameplay/index.js'

export function buildRuntimeDebugExport(state) {
  return {
    runtimeVersion: 1,
    runtimeEpoch: Number(state?.runtimeEpoch || 0),
    runtimeContext: {
      packageId: String(state?.selectedPackage || ''),
      runtimeGroupId: String(state?.selectedLauncherGroupKey || ''),
      actionSequence: Number(state?.runtimeActionSequence || 0),
    },
    gameplay: typeof gameplayDomain.serializeSnapshot === 'function' ? gameplayDomain.serializeSnapshot(state) : null,
    gameplayTimeline: Array.isArray(state?.gameplay?.timeline)
      ? state.gameplay.timeline.slice(-12).map((e) => ({ seq: e.seq, type: e.type }))
      : [],
    domainOwnership: getRuntimeDomainOwnership(),
    effects: getRuntimeEffectsStats(),
    selectors: getSelectorInstrumentationSnapshot(),
    actions: getRuntimeJournalSnapshot(),
    snapshots: getRuntimeSnapshots(),
    hashes: {
      current: hashRuntimeStateShape(state),
      snapshots: getRuntimeSnapshots().map((s) => ({
        actionSequence: s.actionSequence,
        runtimeEpoch: s.runtimeEpoch,
        hash: s.hash,
      })),
    },
    invariantWarnings: getRuntimeJournalSnapshot()
      .filter((e) => String(e?.outcome || '') === 'rejected' || String(e?.outcome || '') === 'failed')
      .map((e) => ({
        at: e.t,
        reason: e.reason,
        severity:
          String(e.reason || '').includes('stale_epoch') || String(e.reason || '').includes('audit_threw')
            ? 'critical'
            : 'warning',
      })),
  }
}

