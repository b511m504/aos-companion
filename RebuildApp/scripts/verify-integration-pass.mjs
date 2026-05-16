/**
 * Integration verification pass (Node): replay hash parity, storm gate, serialization, effect IDs.
 * NFC hardware / WebView / timeline overlay require manual checks on device.
 */
import { strict as assert } from 'node:assert'
import { transitionResolveTag } from '../src/runtime/domains/entities/transitions.js'
import { assertRuntimeTransition } from '../src/runtime/runtimeGuards.js'
import { replayRuntimeSession } from '../src/runtime/replayRuntimeSession.js'
import { exportRuntimeSnapshotBundle, replayFromSnapshotBundle } from '../src/runtime/runtimeSnapshotRecovery.js'
import { stampEffectDescriptors } from '../src/runtime/effectDescriptor.js'
import { simulateReplayEffectsOnly } from '../src/runtime/effects/scheduler.js'
import { assertSerializable } from '../src/runtime/assertSerializable.js'
import { createScanStormGate } from '../src/runtime/runtimeWatchdog.js'
import { hashRuntimeState } from '../src/runtime/hashRuntimeState.js'
import { resetRuntimeClockNow, setRuntimeClockNow } from '../src/runtime/runtimeClock.js'

/** Pin wall clock so latency patches are deterministic (transition idempotency check). */
setRuntimeClockNow(() => 51210)

function baseRuntimeState() {
  return {
    appMode: 'runtime',
    currentScreen: 'runtime',
    activeNfcConflict: null,
    nfcIdentityModal: null,
    runtimeEpoch: 7,
    runtimeActionSequence: 20,
    runtimeSuspendEpoch: 0,
    runtimeLookupHistory: [],
    runtimeUnits: {},
    nfcScanDedupe: null,
    selectedPackage: 'pkg-verify',
    selectedLauncherGroupKey: 'grp-verify',
    activeRoster: { units: [{ id: 'u1', name: 'Unit 1', wounds: 3 }] },
    assignedTags: { TAGVERIFY: { unitId: 'u1' } },
    nfcAssignments: { u1: { uid: 'TAGVERIFY' } },
    runtimeTransitionFrozen: false,
    packageNfcHighlightEntityId: null,
    packageNfcHighlightTagId: null,
    packageNfcLookupSource: null,
    packageBrowseNfcEntityCount: 0,
    nfcLastScanRoute: '',
  }
}

function mkResolve(seq) {
  return {
    type: 'RUNTIME_RESOLVE_TAG',
    transactionId: `tx-verify-${seq}`,
    uid: 'TAGVERIFY',
    actionSequence: seq,
    runtimeEpoch: 7,
    receivedAt: 5000 + seq,
  }
}

console.log('[verify] replayRuntimeSession hash parity')
{
  const initial = baseRuntimeState()
  const actions = [mkResolve(21), mkResolve(22)]
  const a = replayRuntimeSession({
    initialState: JSON.parse(JSON.stringify(initial)),
    actions: JSON.parse(JSON.stringify(actions)),
    skipRuntimeGuards: false,
    skipDomainGuard: false,
    hashMode: 'shape',
  })
  const b = replayRuntimeSession({
    initialState: JSON.parse(JSON.stringify(initial)),
    actions: JSON.parse(JSON.stringify(actions)),
    skipRuntimeGuards: false,
    skipDomainGuard: false,
    hashMode: 'shape',
  })
  assert.equal(a.finalHash, b.finalHash, 'replay finalHash must match')
  assert.equal(a.transitionCount, b.transitionCount)
  assert.equal(a.transitionCount, actions.length)
}

console.log('[verify] replay matches live transition apply (hash after manual apply)')
{
  const initial = baseRuntimeState()
  const actions = [mkResolve(21)]
  let manual = JSON.parse(JSON.stringify(initial))
  const tr = transitionResolveTag(manual, actions[0])
  assert.equal(tr.handled, true)
  Object.assign(manual, tr.patch)
  const replay = replayRuntimeSession({
    initialState: JSON.parse(JSON.stringify(initial)),
    actions,
    hashMode: 'shape',
  })
  assert.equal(
    hashRuntimeState(manual, { mode: 'shape' }),
    replay.finalHash,
    'session replay hash should match sequential transition apply'
  )
}

console.log('[verify] snapshot export + replayFromSnapshotBundle')
{
  const initial = baseRuntimeState()
  const actions = [mkResolve(21)]
  const bundle = exportRuntimeSnapshotBundle(initial, actions, { hashMode: 'shape' })
  assert.ok(bundle.expectedFinalHash, 'export embeds expectedFinalHash')
  const out = replayFromSnapshotBundle(bundle, {})
  assert.equal(out.baselineIntegrity, true)
  assert.equal(out.replayParity, true)
  assert.equal(out.hashMatch, true)
  assert.equal(out.ok, true, `snapshot replay failed: ${JSON.stringify({ out })}`)
}

console.log('[verify] stampEffectDescriptors determinism')
{
  const action = { type: 'RUNTIME_RESOLVE_TAG', transactionId: 'tx-dup', actionSequence: 1, runtimeEpoch: 1, uid: 'U' }
  const effects = [{ type: 'NFC_UI_SCROLL_ENTITY', replayPolicy: 'simulate', payload: { entityId: 'u1' } }]
  const s1 = stampEffectDescriptors(effects, action)
  const s2 = stampEffectDescriptors(effects, action)
  assert.deepEqual(s1, s2)
  assert.equal(s1[0].effectId, 'tx-dup:e0')
  assert.equal(s1[0].transactionId, 'tx-dup')
  assert.equal(s1[0].causedByAction.type, 'RUNTIME_RESOLVE_TAG')
}

console.log('[verify] simulateReplayEffectsOnly (replayed)')
{
  const action = { transactionId: 'tx-eff' }
  const effects = [
    { type: 'PERSIST_SYNC', replayPolicy: 'simulate', payload: {} },
    { type: 'OVERLAY_NOTIFY', replayPolicy: 'replay', payload: { message: 'x' } },
  ]
  const r = simulateReplayEffectsOnly(effects, { replayed: true, action, silent: true })
  assert.equal(r.suppressed, 0)
  assert.ok(r.simulated >= 1)
  assert.ok(r.executed >= 1)
}

console.log('[verify] assertSerializable rejects invalid')
{
  assert.equal(assertSerializable(() => {}).ok, false)
  assert.equal(assertSerializable(Promise.resolve(1)).ok, false)
  const cyclic = {}
  cyclic.self = cyclic
  assert.equal(assertSerializable(cyclic).ok, false)
}

console.log('[verify] scan storm gate')
{
  const gate = createScanStormGate({ windowMs: 100, maxSameUid: 3 })
  let t = 1000
  assert.equal(gate('UID', t).ok, true)
  t += 10
  assert.equal(gate('UID', t).ok, true)
  t += 10
  assert.equal(gate('UID', t).ok, true)
  t += 10
  const last = gate('UID', t)
  assert.equal(last.ok, false)
  assert.ok(last.count > 3)
}

console.log('[verify] entitiesDomain.transition idempotent for duplicate call')
{
  const s = baseRuntimeState()
  const act = mkResolve(21)
  assert.equal(assertRuntimeTransition(s, act).ok, true)
  const t1 = transitionResolveTag(s, act)
  const t2 = transitionResolveTag(s, act)
  assert.deepEqual(t1, t2)
}

resetRuntimeClockNow()

console.log('[verify] ALL NODE CHECKS PASSED')
