import { strict as assert } from 'node:assert'
import {
  transitionResolveTag,
  resolveVirtualUnitForBinding,
} from '../src/runtime/domains/entities/transitions.js'
import { assertRuntimeTransition } from '../src/runtime/runtimeGuards.js'
import { selectActiveEntities, selectRuntimeContext } from '../src/runtime/selectors/index.js'
import { hashRuntimeStateShape } from '../src/runtime/runtimeStateHash.js'
import { replayRuntimeActions } from '../src/runtime/runtimeReplay.js'
import { compressReplayEvents, expandReplayEvents } from '../src/runtime/runtimeReplayCompression.js'
import {
  RUNTIME_EFFECT_REPLAY_POLICY,
} from '../src/runtime/effects/index.js'
import { shouldExecuteEffect, shouldSimulateEffect } from '../src/runtime/effects/policies.js'
import { getRuntimeDomainOwnership } from '../src/runtime/runtimeDomainRouter.js'

function mkBase() {
  return {
    appMode: 'runtime',
    currentScreen: 'runtime',
    activeNfcConflict: null,
    nfcIdentityModal: null,
    runtimeEpoch: 4,
    runtimeActionSequence: 3,
    runtimeSuspendEpoch: 2,
    runtimeLookupHistory: [],
    runtimeUnits: {},
    selectedPackage: 'pkg-1',
    selectedLauncherGroupKey: 'grp-1',
    activeRoster: { units: [{ id: 'u1', name: 'Unit 1', wounds: 3 }] },
    assignedTags: { TAG1: { unitId: 'u1' } },
    nfcAssignments: { u1: { uid: 'TAG1' } },
    nfcScanDedupe: null,
  }
}

function mkAction(seq = 4, epoch = 4) {
  return {
    type: 'RUNTIME_RESOLVE_TAG',
    transactionId: `tx-${seq}`,
    uid: 'TAG1',
    actionSequence: seq,
    runtimeEpoch: epoch,
    receivedAt: 1000 + seq,
  }
}

{
  const s = mkBase()
  assert.equal(assertRuntimeTransition(s, mkAction()).ok, true)
  assert.equal(assertRuntimeTransition(s, mkAction(3, 4)).reason, 'stale_sequence_rejected')
  assert.equal(assertRuntimeTransition(s, mkAction(4, 3)).reason, 'stale_epoch_rejected')
}

{
  const s = mkBase()
  const r1 = transitionResolveTag(s, mkAction())
  const r2 = transitionResolveTag(s, mkAction())
  assert.deepEqual(r1, r2, 'transition must stay deterministic')
}

{
  const navState = {
    ...mkBase(),
    appMode: 'selection-flow',
    currentScreen: 'roster-viewer',
    nfcScanDedupe: null,
  }
  const navAction = {
    type: 'RUNTIME_NFC_SCAN',
    transactionId: 'tx-nav',
    uid: 'TAG1',
    actionSequence: 4,
    runtimeEpoch: 4,
    receivedAt: 2000,
  }
  assert.equal(assertRuntimeTransition(navState, navAction).ok, true)
  const tr = transitionResolveTag(navState, navAction)
  assert.equal(tr.outcome, 'resolved')
  assert.equal(tr.patch.nfcTapSelectDetailOpen, true)
}

{
  const r = resolveVirtualUnitForBinding(
    {
      activeRoster: null,
      runtimeRegistry: {
        entities: [{ entityId: 'u1', display: { name: 'Reg' }, gameplay: { woundsMax: 4 } }],
        metadata: {},
      },
      nfcAssignments: {},
    },
    { unitId: 'u1' }
  )
  assert.equal(r.lookupSource, 'registry')
}

{
  const pkgState = {
    ...mkBase(),
    appMode: 'selection-flow',
    currentScreen: 'package-selection',
    activeRoster: null,
    runtimeRegistry: {
      entities: [{ entityId: 'u1', display: { name: 'On Foot' }, gameplay: { woundsMax: 3 } }],
      metadata: {},
    },
    assignedTags: { TAG1: { unitId: 'u1', unitName: 'On Foot' } },
    runtimeActionSequence: 0,
    runtimeEpoch: 6,
    nfcScanDedupe: null,
  }
  const act = {
    type: 'RUNTIME_NFC_SCAN',
    transactionId: 'tx-pkg',
    uid: 'TAG1',
    actionSequence: 1,
    runtimeEpoch: 6,
    receivedAt: 5000,
    payload: { scanRoute: 'package_browse_no_roster' },
  }
  assert.equal(assertRuntimeTransition(pkgState, act).ok, true)
  const tr = transitionResolveTag(pkgState, act)
  assert.equal(tr.outcome, 'resolved')
  assert.equal(tr.patch.nfcScanReceiptState, 'package_entity_resolved')
  assert.equal(tr.patch.packageNfcHighlightEntityId, 'u1')
  const unknownAct = { ...act, uid: 'UNKNOWN', actionSequence: 2 }
  assert.equal(assertRuntimeTransition(pkgState, unknownAct).ok, true)
  const unk = transitionResolveTag(pkgState, unknownAct)
  assert.equal(unk.patch.nfcScanReceiptState, 'package_entity_missing')
}

{
  const s = mkBase()
  const a = selectRuntimeContext(s)
  const b = selectRuntimeContext(s)
  assert.deepEqual(a, b, 'context selector deterministic')
  const e1 = selectActiveEntities(s)
  const e2 = selectActiveEntities(s)
  assert.deepEqual(e1, e2, 'entity selector deterministic')
}

{
  const s1 = mkBase()
  const s2 = mkBase()
  assert.equal(hashRuntimeStateShape(s1), hashRuntimeStateShape(s2), 'equal states hash equally')
  s2.runtimeUnits.u1 = { activated: true, destroyed: false }
  assert.notEqual(hashRuntimeStateShape(s1), hashRuntimeStateShape(s2), 'activation set affects hash')
}

{
  const events = [mkAction(4, 4), mkAction(5, 4)]
  function makeReplayStore() {
    let state = mkBase()
    return {
      getState() {
        return state
      },
      dispatchRuntimeAction(action) {
        const tr = transitionResolveTag(state, action)
        if (tr?.patch) state = { ...state, ...tr.patch }
        return { handled: true, outcome: tr?.outcome || 'resolved' }
      },
    }
  }
  const sA = makeReplayStore()
  replayRuntimeActions(sA, events, { verifyDeterminism: true, checkpointInterval: 1 })
  const hashA = hashRuntimeStateShape(sA.getState())
  const sB = makeReplayStore()
  replayRuntimeActions(sB, events, { verifyDeterminism: true, checkpointInterval: 1 })
  const hashB = hashRuntimeStateShape(sB.getState())
  assert.equal(hashA, hashB, 'replay equivalence hash must match')
}

{
  const effectAudio = { type: 'AUDIO', replayPolicy: RUNTIME_EFFECT_REPLAY_POLICY.SUPPRESS }
  const effectFx = { type: 'FX', replayPolicy: RUNTIME_EFFECT_REPLAY_POLICY.SIMULATE }
  const effectPersist = { type: 'PERSIST', replayPolicy: RUNTIME_EFFECT_REPLAY_POLICY.REPLAY }
  assert.equal(shouldExecuteEffect(effectAudio, { replayed: true }), false)
  assert.equal(shouldSimulateEffect(effectFx, { replayed: true }), true)
  assert.equal(shouldExecuteEffect(effectPersist, { replayed: true }), true)
}

{
  const events = [mkAction(4, 4), mkAction(5, 4), mkAction(6, 4)]
  const compressed = compressReplayEvents(events)
  const expanded = expandReplayEvents(compressed)
  assert.equal(expanded.length, events.length, 'replay compression must expand deterministically')
  for (let i = 0; i < events.length; i += 1) {
    assert.equal(expanded[i].actionSequence, events[i].actionSequence)
  }
}

{
  const ownership = getRuntimeDomainOwnership()
  assert.ok(ownership.length >= 5, 'expected all runtime domains')
  for (const d of ownership) {
    assert.equal(d.hasInitialize, true)
    assert.equal(d.hasSuspend, true)
    assert.equal(d.hasResume, true)
    assert.equal(d.hasReset, true)
  }
}

console.log('runtime-regression-suite: ok')

