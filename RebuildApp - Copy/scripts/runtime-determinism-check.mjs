import { strict as assert } from 'node:assert'
import { transitionResolveTag } from '../src/runtime/domains/entities/transitions.js'
import { assertRuntimeTransition } from '../src/runtime/runtimeGuards.js'
import { hashRuntimeStateShape } from '../src/runtime/runtimeStateHash.js'
import { resetRuntimeClockNow, setRuntimeClockNow } from '../src/runtime/runtimeClock.js'

let _determinismClock = 5000
setRuntimeClockNow(() => _determinismClock)

function baseState() {
  return {
    appMode: 'runtime',
    currentScreen: 'runtime',
    activeNfcConflict: null,
    nfcIdentityModal: null,
    runtimeEpoch: 2,
    runtimeActionSequence: 10,
    runtimeLookupHistory: [],
    runtimeUnits: {},
    nfcScanDedupe: null,
    selectedPackage: 'pkg-alpha',
    selectedLauncherGroupKey: 'grp-a',
    activeRoster: { units: [{ id: 'u1', name: 'Unit 1', wounds: 3 }] },
    assignedTags: { TAG1: { unitId: 'u1' } },
  }
}

const action = {
  type: 'RUNTIME_RESOLVE_TAG',
  transactionId: 'tx-1',
  uid: 'TAG1',
  actionSequence: 11,
  runtimeEpoch: 2,
  receivedAt: 1000,
}

const guardOk = assertRuntimeTransition(baseState(), action)
assert.equal(guardOk.ok, true)

const r1 = transitionResolveTag(baseState(), action)
const r2 = transitionResolveTag(baseState(), action)
assert.deepEqual(r1, r2)
assert.equal(r1.outcome, 'resolved')

const stale = assertRuntimeTransition(baseState(), { ...action, runtimeEpoch: 1 })
assert.equal(stale.ok, false)
assert.equal(stale.reason, 'stale_epoch_rejected')

const seqStale = assertRuntimeTransition(baseState(), { ...action, actionSequence: 10 })
assert.equal(seqStale.ok, false)
assert.equal(seqStale.reason, 'stale_sequence_rejected')

const hashA = hashRuntimeStateShape(baseState())
const s2 = baseState()
s2.runtimeUnits.u1 = { activated: true, destroyed: false }
const hashB = hashRuntimeStateShape(s2)
assert.notEqual(hashA, hashB)

const navState = {
  ...baseState(),
  appMode: 'selection-flow',
  currentScreen: 'roster-viewer',
}
const navAction = {
  type: 'RUNTIME_NFC_SCAN',
  transactionId: 'tx-nav-1',
  uid: 'TAG1',
  actionSequence: 11,
  runtimeEpoch: 2,
  receivedAt: 2000,
}
assert.equal(assertRuntimeTransition(navState, navAction).ok, true)
const n1 = transitionResolveTag(navState, navAction)
const n2 = transitionResolveTag(navState, navAction)
assert.deepEqual(n1, n2)
assert.equal(n1.outcome, 'resolved')
assert.equal(n1.patch.nfcTapSelectDetailOpen, true)

const pkgBrowse = {
  appMode: 'selection-flow',
  currentScreen: 'package-selection',
  activeNfcConflict: null,
  nfcIdentityModal: null,
  runtimeEpoch: 5,
  runtimeActionSequence: 0,
  runtimeLookupHistory: [],
  runtimeUnits: {},
  nfcScanDedupe: null,
  activeRoster: null,
  runtimeRegistry: {
    entities: [{ entityId: 'u1', display: { name: 'Ghost' }, gameplay: { woundsMax: 2 } }],
    metadata: {},
  },
  assignedTags: { TAG1: { unitId: 'u1', unitName: 'Ghost' } },
  selectedPackage: '',
  selectedLauncherGroupKey: '',
  nfcAssignments: {},
}
const pkgAct = {
  type: 'RUNTIME_NFC_SCAN',
  transactionId: 'tx-pkg',
  uid: 'TAG1',
  actionSequence: 1,
  runtimeEpoch: 5,
  receivedAt: 4000,
  payload: { scanRoute: 'package_browse_no_roster' },
}
assert.equal(assertRuntimeTransition(pkgBrowse, pkgAct).ok, true)
const pr = transitionResolveTag(pkgBrowse, pkgAct)
assert.equal(pr.outcome, 'resolved')
assert.equal(pr.patch.nfcScanReceiptState, 'package_entity_resolved')
assert.equal(pr.patch.packageNfcHighlightEntityId, 'u1')

const badAct = { ...pkgAct, uid: 'NOPE', actionSequence: 2 }
assert.equal(assertRuntimeTransition(pkgBrowse, badAct).ok, true)
const br = transitionResolveTag(pkgBrowse, badAct)
assert.equal(br.patch.nfcScanReceiptState, 'package_entity_missing')

resetRuntimeClockNow()
console.log('runtime-determinism-check: ok')