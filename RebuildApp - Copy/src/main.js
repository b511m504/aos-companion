import './style.css'

import { createStore } from './state/store.js'
import { renderScreen } from './screens/index.js'
import { renderSessionBar } from './components/sessionBar.js'
import { readTagStub, ENABLE_DEV_FIXTURES } from './hardware/nfc.js'
import { getNextUnassignedEntity } from './runtime/entitySelectors.js'
import { renderNfcIdentitySheet } from './components/nfcIdentitySheet.js'
import { BUILD_INFO } from './buildInfo.js'
import { createNfcController } from './nfcRuntime/nfcController.js'
import { recordNfcInterceptRoute, warnIfOperatorRoutingInvariantBroken } from './nfcRuntime/nfcInterceptAudit.js'
import {
  nfcBridgeHeartbeat,
  recordCapacitorReadyConfirmed,
  recordRuntimeReadyEmit,
  recordRuntimeReadyError,
  recordRuntimeReadySuccess,
  setHasSpearheadBridge,
  setNotifyRuntimeMissing,
} from './nfcRuntime/nfcBridgeHeartbeat.js'
import { buildPackageSemanticAction, buildRuntimeResolveTagAction } from './runtime/runtimeActionSchema.js'
import { nfcGameplayAfterRuntimeDispatch } from './gameplayScanBridge.js'
import { tableFeedback } from './presentation/feedbackHooks.js'
import { createGameplayAction, GAMEPLAY_ACTION_TYPES } from './domain/gameplayActionTypes.js'
import { replayRuntimeActions } from './runtime/runtimeReplay.js'
import { replayRuntimeSession } from './runtime/replayRuntimeSession.js'
import { exportRuntimeSnapshotBundle, replayFromSnapshotBundle } from './runtime/runtimeSnapshotRecovery.js'
import { buildRuntimeDebugExport } from './runtime/runtimeDebugExport.js'
import { getRuntimeDomainOwnership } from './runtime/runtimeDomainRouter.js'
import { resetRuntimeClockNow, setRuntimeClockNow } from './runtime/runtimeClock.js'
import {
  selectActiveEntities,
  selectAssignmentsForPackage,
  selectRuntimeContext,
  selectScenarioState,
  selectVisibleRuntimeUnits,
} from './runtime/selectors/index.js'

console.log('[BOOT] NFC binding app')

globalThis.__SPEARHEAD_RUNTIME_ID__ = 'runtime_' + Math.random().toString(36).slice(2)
globalThis.__SPEARHEAD_RUNTIME_PING__ = true
if (typeof window !== 'undefined') window.__SPEARHEAD_RUNTIME_PING__ = true

const IS_DEV_BUILD = Boolean(import.meta.env?.DEV)

if (IS_DEV_BUILD) {
  console.warn(
    'SPEARHEAD_RUNTIME_CONTEXT',
    'bootstrap',
    globalThis.__SPEARHEAD_RUNTIME_ID__,
    typeof location !== 'undefined' ? location.href : '(no-location)',
    typeof document !== 'undefined' ? document.readyState : '(no-document)',
    new Date().toISOString()
  )
}

/** Must stay false for NFC assignments + tabletop state to survive process restart. */
const FORCE_CLEAN_RUNTIME = false

const appRoot = document.querySelector('#app')
const diagnosticsHoldRoots = new WeakSet()
let renderPrevScreen = ''
if (IS_DEV_BUILD) {
  console.info('BUILD_INFO', BUILD_INFO.displayVersion || BUILD_INFO.appVersion, BUILD_INFO.gitHash)
}

function snapshotStorageKeys() {
  const keys = []
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key) keys.push(key)
    }
  } catch {
    // ignore
  }
  return keys
}

async function forceCleanRuntimeOnBoot() {
  if (!FORCE_CLEAN_RUNTIME) return
  try {
    localStorage.clear()
  } catch {
    // ignore
  }
  try {
    sessionStorage.clear()
  } catch {
    // ignore
  }
  try {
    if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
      const dbs = await indexedDB.databases()
      for (const db of dbs) {
        if (db?.name) indexedDB.deleteDatabase(db.name)
      }
    }
  } catch {
    // ignore
  }
  console.warn('FORCE CLEAN RUNTIME EXECUTED')
}

async function waitForCapacitorReady({ timeoutMs = 15000, intervalMs = 100 } = {}) {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    const cap = globalThis.Capacitor
    const plugins = cap?.Plugins

    const ok = Boolean(cap && plugins && plugins.SpearheadBridge)

    if (ok) {
      console.warn('SPEARHEAD_RUNTIME_CONTEXT', 'capacitor_ready_confirmed', {
        pluginKeys: Object.keys(plugins || {}),
        runtimeId: globalThis.__SPEARHEAD_RUNTIME_ID__,
        href: typeof location !== 'undefined' ? location.href : '(no-location)',
      })

      console.warn('SPEARHEAD_RUNTIME_CONTEXT', 'spearhead_bridge_object', {
        keys: Object.keys(globalThis.Capacitor?.Plugins?.SpearheadBridge || {}),
        typeofNotify: typeof globalThis.Capacitor?.Plugins?.SpearheadBridge?.notifyRuntimeReady,
      })

      return true
    }

    await new Promise((r) => setTimeout(r, intervalMs))
  }

  console.error('SPEARHEAD_RUNTIME_CONTEXT', 'capacitor_ready_timeout', {
    hasCapacitor: !!globalThis.Capacitor,
    pluginKeys: Object.keys(globalThis.Capacitor?.Plugins || {}),
  })

  return false
}

if (IS_DEV_BUILD) {
  console.warn('[BOOT] app bootstrap start')
}

await forceCleanRuntimeOnBoot()
const BOOT_STORAGE_KEYS = snapshotStorageKeys()
const store = createStore()
globalThis.__SPEARHEAD_STORE_GET__ = () => store.getState()
if (IS_DEV_BUILD) {
  console.warn('[BOOT] store initialized', store.getState?.()?.currentScreen ?? '(no-screen)')
}

try {
  const u = new URL(location.href)
  if (u.searchParams.get('interactionLab') === '1' || u.searchParams.get('interactionTest') === '1') {
    globalThis.__SPEARHEAD_INTERACTION_LAB_URL__ = true
    store.setCurrentScreen('interaction-test')
  }
  if (u.searchParams.get('noDedupe') === '1') {
    globalThis.__SPEARHEAD_DISABLE_ACTION_DEDUPE__ = true
  }
} catch {
  /* ignore invalid URL */
}

function applyScanPresentationFeedback(res) {
  if (!res || typeof res !== 'object') return
  if (res.outcome === 'resolved') {
    tableFeedback.scanSuccess()
    return
  }
  if (res.outcome === 'rejected') {
    if (res.reason === 'duplicate_ignored') tableFeedback.scanDuplicate()
    else tableFeedback.scanRejected()
  }
}

function applyNfcDispatchDiagnostics(res) {
  if (!res) return
  if (res.outcome === 'failed') {
    store.recordNfcTransportFailure(res.reason || 'failed')
    return
  }
  if (res.outcome !== 'rejected' || !res.reason) return
  const benign = new Set([
    'duplicate_ignored',
    'unknown_tag',
    'no_roster',
    'unit_not_in_roster',
    'nfc_ui_blocking',
    'not_runtime_mode',
    'not_runtime_screen',
    'package_entity_missing',
    'package_scan_ignored',
  ])
  if (!benign.has(res.reason)) {
    store.recordNfcTransportFailure(res.reason)
  }
}

const nfcController = createNfcController({
  onStateChange: () => render(),
  getScanFailureContext: () => {
    const s = store.getState()
    return {
      currentScreen: s.currentScreen,
      appMode: s.appMode,
      selectedPackage: s.selectedPackage || '',
      runtimeGroup: s.selectedLauncherGroupKey || '',
      runtimeSystemId: s.runtimeRegistry?.metadata?.systemId ?? '',
      listenerCount: nfcBridgeHeartbeat.listenerAttachCount ?? 0,
      queueDepth: nfcBridgeHeartbeat.scanQueueDepth ?? 0,
      nfcLastScanRoute: s.nfcLastScanRoute || '',
      packageBrowseNfcEntityCount: s.packageBrowseNfcEntityCount ?? 0,
    }
  },
  interceptScan: (tagId, envelope) => {
    const s = store.getState()
    warnIfOperatorRoutingInvariantBroken(s)
    const routeCtx = {
      transactionId: envelope?.transactionId,
      currentScreen: s.currentScreen,
      appMode: s.appMode,
    }
    const uid = String(tagId || '').trim()
    const nr = nfcController.getState()
    const assignmentPairing = Boolean(
      nr.activeAssignment?.selectedUnitId && nr.activeAssignment?.waitingForScan
    )
    const runtimeIntercept = s.currentScreen === 'runtime' && s.appMode === 'runtime'

    if (runtimeIntercept) {
      const action = buildRuntimeResolveTagAction(envelope, store.getState())
      const res = store.dispatchRuntimeAction(action)
      if (res?.outcome === 'resolved') {
        const snap = store.getState()
        const lookup = snap.runtimeLastLookupResult
        const semanticActionId = String(lookup?.semanticActionId || '').trim()
        if (semanticActionId) {
          const semanticAction = buildPackageSemanticAction({
            state: snap,
            uid,
            entityId: String(lookup?.unitId || ''),
            semanticEntityId: String(lookup?.semanticEntityId || ''),
            actionId: semanticActionId,
            payload: {
              ...(snap.packageRuntimeDefinition?.actionsById?.[semanticActionId]?.payload || {}),
            },
          })
          store.dispatchRuntimeAction(semanticAction)
        }
      }
      applyNfcDispatchDiagnostics(res)
      applyScanPresentationFeedback(res)
      nfcGameplayAfterRuntimeDispatch(store, action, envelope, res.outcome)
      recordNfcInterceptRoute('runtime', routeCtx)
      return res
    }

    if (s.currentScreen === 'operator-validation') {
      store.applyValidationScan(uid)
      recordNfcInterceptRoute('validation', routeCtx)
      return { handled: true, outcome: 'resolved' }
    }

    if (s.currentScreen === 'nfc-assignment' && s.appMode === 'nfc_assignment') {
      if (!assignmentPairing) {
        recordNfcInterceptRoute('rejected_no_pair', routeCtx)
        return { handled: true, outcome: 'rejected', reason: 'no_unit_selected' }
      }
      recordNfcInterceptRoute('assignment_queue', routeCtx)
      return { handled: false }
    }

    recordNfcInterceptRoute('rejected_idle', routeCtx)
    return { handled: true, outcome: 'rejected', reason: 'nfc_idle' }
  },
  commitAssignment: (unitId, tagId) => {
    if (store.isAssignmentCommitLocked()) {
      return false
    }
    store.selectAssignmentUnit(unitId)
    store.applyStubTagAssignment(tagId)
    const s = store.getState()
    const r = s.lastAssignmentResult
    if (r?.ok) {
      tableFeedback.scanSuccess()
      nfcController.resetSelection()
    } else if (r?.reason === 'tag_already_assigned') {
      tableFeedback.scanDuplicate()
    } else if (r?.reason === 'no_unit_selected' || r?.reason === 'empty_uid') {
      tableFeedback.scanRejected()
    }
    return true
  },
  getPostCommitScanState: () => {
    const s = store.getState()
    return {
      conflict: Boolean(
        s.activeNfcConflict || s.nfcIdentityModal || s.lastAssignmentResult?.reason === 'tag_already_assigned'
      ),
      success: Boolean(s.lastAssignmentResult?.ok),
    }
  },
  clearAssignmentInStore: (unitId) => store.clearNfcAssignmentForUnit(unitId),
  resetAssignmentsInStore: () => store.resetActiveNfcSessionLinks(),
})

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      store.bumpRuntimeSuspendEpoch()
      store.suspendRuntimeDomains()
      nfcController.updateSuspendState({ runtimeBackgroundHold: true })
    } else {
      nfcController.updateSuspendState({ runtimeBackgroundHold: false })
      store.verifyRuntimeResumeContext()
      const s = store.getState()
      if (String(s.selectedPackage || '').startsWith('operator:')) {
        store.notifyOperatorSessionResume()
      }
    }
  })
}

const capacitorReady = await waitForCapacitorReady()
if (capacitorReady) {
  recordCapacitorReadyConfirmed()
}

if (!capacitorReady) {
  console.error('SPEARHEAD_RUNTIME_CONTEXT', 'startup_aborted_capacitor_not_ready')
} else {
  console.warn('SPEARHEAD_RUNTIME_CONTEXT', 'bridge_start_begin')

  await nfcController.startBridge()

  globalThis.__SPEARHEAD_TEST_SCAN__ = (uid, options) => nfcController.injectTestScan(uid, options)
  globalThis.__SPEARHEAD_NFC_STRESS__ = (profile = 'rapid') => {
    const tags = Object.keys(store.getState().assignedTags || {})
    const mappedUid = tags[0] || 'stress-unmapped-tag'
    const cfg =
      profile === 'spam'
        ? { burst: 28, gapMs: 0 }
        : profile === 'unknown'
          ? { burst: 6, gapMs: 22 }
          : { burst: 12, gapMs: 20 }
    const uid = profile === 'unknown' ? `unknown-${Date.now().toString(36)}` : mappedUid
    nfcController.injectTestScan(uid, { ...cfg, sourcePath: `stress_${profile}` })
    return { profile, uid, note: 'Watch nfcScanReceiptState / duplicate_ignored under spam or rapid' }
  }
  globalThis.__SPEARHEAD_RUNTIME_REPLAY__ = (events, options) =>
    replayRuntimeActions(store, events, options)
  globalThis.__SPEARHEAD_REPLAY_SESSION__ = (opts) => replayRuntimeSession(opts)
  globalThis.__SPEARHEAD_RUNTIME_SNAPSHOT_EXPORT__ = (actions = []) =>
    exportRuntimeSnapshotBundle(store.getState(), actions)
  globalThis.__SPEARHEAD_RUNTIME_SNAPSHOT_REPLAY__ = (bundle, extra) => replayFromSnapshotBundle(bundle, extra)
  globalThis.__SPEARHEAD_RUNTIME_EXPORT__ = () => buildRuntimeDebugExport(store.getState())
  globalThis.__SPEARHEAD_RUNTIME_RECOVER__ = (reason, action = null) =>
    store.attemptRuntimeRecoveryHook({
      reason,
      action,
      runtimeEpoch: store.getState().runtimeEpoch,
    })
  globalThis.__SPEARHEAD_RUNTIME_DOMAIN_OWNERSHIP__ = () => getRuntimeDomainOwnership()
  globalThis.__SPEARHEAD_RUNTIME_SET_CLOCK__ = (baseMs = Date.now(), stepMs = 1) => {
    let t = Number(baseMs) || 0
    const step = Number(stepMs) || 1
    setRuntimeClockNow(() => {
      const cur = t
      t += step
      return cur
    })
    return true
  }
  globalThis.__SPEARHEAD_RUNTIME_RESET_CLOCK__ = () => {
    resetRuntimeClockNow()
    return true
  }

  console.warn('SPEARHEAD_RUNTIME_CONTEXT', 'bridge_start_complete')

  globalThis.SPEARHEAD_RUNTIME_READY = true
  if (typeof window !== 'undefined') window.SPEARHEAD_RUNTIME_READY = true
  console.warn(
    'SPEARHEAD_RUNTIME_CONTEXT',
    'runtime_ready_emit',
    globalThis.__SPEARHEAD_RUNTIME_ID__,
    typeof location !== 'undefined' ? location.href : '(no-location)'
  )
  console.warn(
    'SPEARHEAD_RUNTIME_CONTEXT',
    'plugin_check',
    {
      hasCapacitor: !!globalThis.Capacitor,
      hasPlugins: !!globalThis.Capacitor?.Plugins,
      pluginKeys: Object.keys(globalThis.Capacitor?.Plugins || {}),
      hasSpearheadBridge: !!globalThis.Capacitor?.Plugins?.SpearheadBridge,
    }
  )

  setHasSpearheadBridge(!!globalThis.Capacitor?.Plugins?.SpearheadBridge)

  console.warn(
    'SPEARHEAD_RUNTIME_CONTEXT',
    'runtime_ready_notify_begin',
    typeof window !== 'undefined' ? window.__SPEARHEAD_RUNTIME_ID__ : globalThis.__SPEARHEAD_RUNTIME_ID__,
    typeof location !== 'undefined' ? location.href : '(no-location)'
  )

  recordRuntimeReadyEmit()

  try {
    if (!globalThis.Capacitor?.Plugins?.SpearheadBridge?.notifyRuntimeReady) {
      setNotifyRuntimeMissing(true)
      console.error('SPEARHEAD_RUNTIME_CONTEXT', 'notify_runtime_missing')
    } else {
      await globalThis.Capacitor.Plugins.SpearheadBridge.notifyRuntimeReady({
        runtimeId: globalThis.__SPEARHEAD_RUNTIME_ID__,
        href: typeof location !== 'undefined' ? location.href : '',
      })
      console.warn('SPEARHEAD_RUNTIME_CONTEXT', 'runtime_ready_notify_success')
      recordRuntimeReadySuccess()
    }
  } catch (err) {
    recordRuntimeReadyError(err)
    console.error('SPEARHEAD_RUNTIME_READY_ERR', err)
    console.error('SPEARHEAD_RUNTIME_CONTEXT', 'runtime_ready_notify_error', err)
  }

  globalThis.addEventListener('beforeunload', () => nfcController.stopBridge())
  /** Debug / recovery: WebView tier recreation — stop+start listeners without reloading shell. */
  globalThis.__SPEARHEAD_RESTART_NFC_BRIDGE__ = () => nfcController.restartBridge()
}

/** Cancels an in-flight pairing chain when the user taps another piece */
let nfcPairSessionGen = 0

function cssEscapeSelector(id) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(id)
  return String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function awaitDoubleFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  })
}

function scrollEntityCardIntoView(entityId) {
  const id = cssEscapeSelector(entityId)
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-entity-card="${id}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

async function runSinglePairAttempt() {
  const s = store.getState()
  const id = s.selectedEntityId ?? s.selectedUnitId
  if (!id) return
  if (!ENABLE_DEV_FIXTURES) return
  store.prepareNfcScan()
  try {
    const tag = await readTagStub()
    if (tag?.id) store.applyStubTagAssignment(tag.id)
  } catch (err) {
    console.warn('NFC_STUB_DISABLED', err?.message || err)
  }
}

/**
 * Tap-driven pairing: listen → read tag → on success auto-advance to next unpaired piece (assembly-line UX).
 * Session generation invalidates prior chains when the user taps a different piece.
 */
function sleepPairingMs(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function runPairingAssemblyLine(startEntityId, sessionGen) {
  if (!ENABLE_DEV_FIXTURES) return
  let entityId = startEntityId
  while (entityId && sessionGen === nfcPairSessionGen) {
    let pre = store.getState()
    if (pre.nfcIdentityModal || pre.nfcRuntimeLookupMode) return

    store.selectAssignmentUnit(entityId)
    await awaitDoubleFrame()
    scrollEntityCardIntoView(entityId)
    await awaitDoubleFrame()
    if (sessionGen !== nfcPairSessionGen) return
    pre = store.getState()
    if (pre.nfcIdentityModal || pre.nfcRuntimeLookupMode) return

    store.prepareNfcScan()
    let tag = null
    try {
      tag = await readTagStub()
    } catch (err) {
      console.warn('NFC_STUB_DISABLED', err?.message || err)
      return
    }
    if (sessionGen !== nfcPairSessionGen) return

    pre = store.getState()
    if (pre.nfcIdentityModal || pre.nfcRuntimeLookupMode) return

    if (!tag?.id) return
    store.applyStubTagAssignment(tag.id)
    const s = store.getState()
    if (s.nfcIdentityModal) return
    if (!s.lastAssignmentResult?.ok) return

    const linger = s.lastAssignmentResult?.reassigned ? 480 : 360
    await sleepPairingMs(linger)
    if (sessionGen !== nfcPairSessionGen) return

    const next = getNextUnassignedEntity(store.getState())
    entityId = next?.entityId ?? null
  }
}

async function clearAllRuntimeDataAndReload() {
  try {
    localStorage.clear()
  } catch {
    // ignore
  }

  try {
    sessionStorage.clear()
  } catch {
    // ignore
  }

  try {
    if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
      const dbs = await indexedDB.databases()
      for (const db of dbs) {
        if (db?.name) {
          indexedDB.deleteDatabase(db.name)
        }
      }
    }
  } catch {
    // ignore
  }

  window.location.reload()
}

function render() {
  try {
    renderInner()
  } catch (err) {
    console.error('[RENDER] fatal', err)
    const msg = err instanceof Error ? `${err.message}\n${err.stack || ''}` : String(err)
    const root = appRoot || document.body
    if (root) {
      root.innerHTML = `
        <div style="padding:16px;font:14px system-ui,sans-serif;background:#1a0f12;color:#ffd0d8;white-space:pre-wrap;">
          <strong>Render failed</strong><br/>
          ${String(msg).replace(/</g, '&lt;')}
        </div>`
    }
  }
}

function renderInner() {
  const root = appRoot ?? document.getElementById('app')
  if (!root) {
    console.error('[RENDER] missing #app container')
    return
  }
  store.recordRender()
  const state = store.getState()
  const opPkg = String(state.selectedPackage || '').startsWith('operator:')
  if (renderPrevScreen === 'nfc-assignment' && state.currentScreen !== 'nfc-assignment' && opPkg) {
    nfcController.resetSelection()
  }
  renderPrevScreen = state.currentScreen

  nfcController.updateSuspendState({
    conflictBlocking: Boolean(state.nfcIdentityModal || state.activeNfcConflict),
    runtimeCriticalHold: Boolean(state.runtimeTransitionFrozen),
  })
  nfcController.setUnits(state.activeRoster?.units || [])
  nfcController.syncAssignmentsFromStore(state.nfcAssignments)
  const nfcRuntime = nfcController.getState()
  const runtimeProjections = {
    runtimeContext: selectRuntimeContext(state),
    scenarioState: selectScenarioState(state),
    activeEntities: selectActiveEntities(state),
    assignmentsForPackage: selectAssignmentsForPackage(state),
    visibleRuntimeUnits: selectVisibleRuntimeUnits(state),
  }
  const matchMode = state.currentScreen === 'runtime'
  const runtimePrepareOverlay = state.runtimePrepareOverlay === true
  const battlefieldRevealPulse = state.battlefieldRevealPulse === true
  const labScreen = state.currentScreen === 'interaction-test'
  const operatorFlow = [
    'operator-package',
    'operator-faction',
    'roster-import',
    'operator-overview',
    'operator-validation',
    'nfc-assignment',
  ].includes(state.currentScreen)

  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.classList.toggle(
      'spearhead-interaction-lab-active',
      Boolean(labScreen || globalThis.__SPEARHEAD_INTERACTION_LAB_URL__)
    )
  }

  const appHeader = matchMode
    ? `
      <header class="app-header app-header--match">
        <div class="app-header__text">
          <p class="app-header__eyebrow">Table</p>
          <h1 class="app-header__title">Match</h1>
          <p class="app-header__subtitle">Gameplay mode</p>
        </div>
      </header>`
    : operatorFlow
      ? `
      <header class="app-header app-header--operator">
        <div class="app-header__text">
          <p class="app-header__eyebrow">Tournament utility</p>
          <h1 class="app-header__title">NFC tag binding</h1>
          <p class="app-header__subtitle">Link physical bases to roster entries.</p>
        </div>
      </header>`
      : `
      <header class="app-header app-header--launcher">
        <div class="app-header__text">
          <p class="app-header__eyebrow">Spearhead</p>
          <h1 class="app-header__title">Launcher</h1>
          <p class="app-header__subtitle">Legacy browse and tools.</p>
        </div>
      </header>`

  const showIdentitySheet =
    !labScreen &&
    state.currentScreen !== 'nfc-assignment' &&
    !(String(state.selectedPackage || '').startsWith('operator:') && state.appMode === 'nfc_assignment')

  root.innerHTML = `
    <main class="app-shell theme-${state.activeThemeId || 'default-dark'}${matchMode ? ' app-shell--match' : ''}${operatorFlow ? ' app-shell--operator' : ''}${battlefieldRevealPulse ? ' app-shell--battlefield-reveal-pulse' : ''}">
      ${appHeader}
      ${labScreen ? '' : renderSessionBar(state)}
      <section class="screen${matchMode ? ' screen--match' : ''}">
        ${renderScreen(state, { nfcRuntime, runtimeProjections })}
      </section>
      ${showIdentitySheet ? renderNfcIdentitySheet(state) : ''}
    </main>
    ${
      runtimePrepareOverlay
        ? `<div class="runtime-prepare-overlay" aria-busy="true" aria-live="polite">
      <div class="runtime-prepare-overlay__ring" aria-hidden="true"></div>
      <p class="runtime-prepare-overlay__label">Preparing battlefield…</p>
    </div>`
        : ''
    }
  `

  wireDelegatedDataActions(root)
  wireOperatorDiagnosticsHold(root)
}

function wireOperatorDiagnosticsHold(root) {
  if (typeof document === 'undefined' || !root || diagnosticsHoldRoots.has(root)) return
  diagnosticsHoldRoots.add(root)
  let timer = null
  const cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }
  const onDown = (ev) => {
    const t = ev.target?.closest?.('[data-operator-diagnostics-hold]')
    if (!t || !root.contains(t)) return
    cancel()
    timer = globalThis.setTimeout(async () => {
      timer = null
      try {
        const { stringifyOperatorDiagnosticsPayload } = await import('./services/operatorDiagnosticsExport.js')
        const json = stringifyOperatorDiagnosticsPayload({ state: store.getState(), buildInfo: BUILD_INFO })
        const blob = new Blob([json], { type: 'application/json' })
        const u = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = u
        a.download = `operator-diagnostics-${Date.now()}.json`
        a.click()
        URL.revokeObjectURL(u)
      } catch (e) {
        console.error('diagnostics export failed', e)
      }
    }, 780)
  }
  root.addEventListener('pointerdown', onDown, { capture: true })
  root.addEventListener('pointerup', cancel, { capture: true })
  root.addEventListener('pointercancel', cancel, { capture: true })
}

function wireDelegatedDataActions(root) {
  const shell = root.querySelector('main.app-shell')
  if (!shell) return

  let lastDedupeKey = ''
  let lastDedupeTs = 0

  const shouldDedupe = (action, value, effect) => {
    if (globalThis.__SPEARHEAD_DISABLE_ACTION_DEDUPE__) return false
    const key = `${action}\t${value}\t${effect}`
    const now = Date.now()
    if (key === lastDedupeKey && now - lastDedupeTs < 480) return true
    lastDedupeKey = key
    lastDedupeTs = now
    return false
  }

  const activate = (ev) => {
    const t = ev.target
    if (!(t instanceof Element)) return
    const el = t.closest('[data-action]')
    if (!el || !shell.contains(el)) return
    if (el.closest('[disabled], [aria-disabled="true"]')) return

    const action = el.getAttribute('data-action') || ''
    if (!action) return
    const value = el.getAttribute('data-value') || ''
    const effect = el.getAttribute('data-effect') || ''

    if (shouldDedupe(action, value, effect)) return

    void (async () => {
      try {
        await handleAction(action, value, effect, el)
      } catch (err) {
        console.error('UI action error', action, err)
      }
    })()
  }

  shell.addEventListener('touchend', activate, { passive: true })
  shell.addEventListener('click', activate)
}

async function handleAction(action, value, effect = '', el = null) {
  /** @type {unknown} */
  let handleReturn
  try {
    switch (action) {
    case 'go-interaction-lab':
      store.setCurrentScreen('interaction-test')
      break
    case 'operator-select-game':
      store.selectOperatorGame(value)
      break
    case 'operator-select-faction':
      store.selectOperatorFaction(value)
      break
    case 'operator-back-package':
      store.setCurrentScreen('operator-package')
      break
    case 'operator-back-faction':
      store.setCurrentScreen('operator-faction')
      break
    case 'operator-import-paste': {
      const ta = document.querySelector('textarea[name="operatorRosterJson"]')
      const nameEl = document.querySelector('input[name="operatorListName"]')
      const text = ta?.value ?? ''
      const listName = nameEl?.value ?? ''
      store.importOperatorRosterFromText(text, listName)
      break
    }
    case 'operator-import-file': {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'application/json,.json'
      input.addEventListener('change', async () => {
        const file = input.files?.[0]
        if (!file) return
        try {
          const text = await file.text()
          const nameEl = document.querySelector('input[name="operatorListName"]')
          const listName =
            (nameEl?.value && String(nameEl.value).trim()) ||
            file.name.replace(/\.[^/.]+$/, '') ||
            'Imported list'
          store.importOperatorRosterFromText(text, listName)
        } catch (err) {
          console.error('[import] invalid JSON', err)
        }
      })
      input.click()
      break
    }
    case 'go-home':
      store.setCurrentScreen('home')
      break
    case 'go-game-selection':
      store.setCurrentScreen('game-selection')
      break
    case 'go-faction-selection':
      store.setCurrentScreen('faction-selection')
      break
    case 'select-launcher-group':
      store.selectLauncherGroup(value)
      break
    case 'browse-all-packages':
      store.browseAllPackages()
      break
    case 'set-package-faction-filter':
      store.setPackageFactionFilter(value)
      break
    case 'select-faction':
      store.selectFaction(value)
      break
    case 'select-package':
      await store.selectPackage(value)
      break
    case 'start-demo':
      await store.selectPackage(value)
      break
    case 'load-demo-list':
      await store.selectPackage('Test Army Alpha')
      break
    case 'load-demo-package':
      await store.selectPackage('demo-40k-strike')
      break
    case 'resume-last-session':
      nfcController.updateSuspendState({ restoreInProgress: true })
      try {
        await store.resumeLastSession()
      } finally {
        nfcController.updateSuspendState({ restoreInProgress: false })
      }
      break
    case 'match-resume-table':
      nfcController.updateSuspendState({ restoreInProgress: true })
      try {
        await store.resumeLastSession({ enterTable: true })
      } finally {
        nfcController.updateSuspendState({ restoreInProgress: false })
      }
      break
    case 'match-bootstrap-demo':
      store.bootstrapDemoMatch()
      break
    case 'select-launcher-theme':
      store.setLauncherTheme(value)
      break
    case 'continue-to-roster':
      store.continueToRosterFromTheme()
      break
    case 'skip-theme-default':
      store.skipThemeDefault()
      break
    case 'trigger-json-import':
    case 'trigger-scenario-import': {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'application/json,.json'
      input.addEventListener('change', async () => {
        const file = input.files?.[0]
        if (!file) return
        try {
          const text = await file.text()
          const raw = JSON.parse(text)
          const base =
            action === 'trigger-scenario-import'
              ? file.name.replace(/\.[^/.]+$/, '') || 'Imported scenario'
              : file.name.replace(/\.[^/.]+$/, '') || 'Imported list'
          store.importPackageFromJson(raw, base)
        } catch (err) {
          console.error('[import] invalid JSON', err)
        }
      })
      input.click()
      break
    }
    case 'clear-local-runtime-data':
      await clearAllRuntimeDataAndReload()
      break
    case 'select-unit':
      store.setSelectedUnit(value)
      break
    case 'go-package-selection':
      store.setCurrentScreen('package-selection')
      break
    case 'go-roster-viewer':
      store.setCurrentScreen('roster-viewer')
      break
    case 'go-nfc-assignment':
      store.navigateNfcAssignment()
      {
        const sid = store.getState().selectedEntityId
        if (sid) nfcController.selectUnit(sid)
        else nfcController.resetSelection()
      }
      break
    case 'go-operator-overview':
      store.navigateOperatorOverview()
      nfcController.resetSelection()
      break
    case 'go-operator-validation':
      store.navigateOperatorValidation()
      nfcController.resetSelection()
      break
    case 'operator-back-roster-import':
      store.setCurrentScreen('roster-import')
      break
    case 'dismiss-operator-hydration-warning':
      store.dismissOperatorHydrationWarning()
      break
    case 'operator-clear-assignments': {
      const st = store.getState()
      if (st.operatorPendingClear) store.confirmOperatorClearAssignments()
      else store.requestOperatorClearAssignments()
      break
    }
    case 'operator-cancel-clear':
      store.cancelOperatorClearAssignments()
      break
    case 'operator-export-backup': {
      const json = store.getOperatorAssignmentBackupJson()
      if (!json) break
      const blob = new Blob([json], { type: 'application/json' })
      const u = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = u
      a.download = `nfc-tags-backup-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(u)
      break
    }
    case 'operator-import-backup': {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'application/json,.json'
      input.addEventListener('change', async () => {
        const file = input.files?.[0]
        if (!file) return
        try {
          const text = await file.text()
          const parsed = JSON.parse(text)
          if (store.getState().currentScreen !== 'operator-overview') {
            store.navigateOperatorOverview()
          }
          store.previewOperatorAssignmentImport(parsed)
        } catch {
          store.navigateOperatorOverview()
          store.previewOperatorAssignmentImport({})
        }
        render()
      })
      input.click()
      break
    }
    case 'operator-import-commit': {
      const mode = value === 'replace_all' ? 'replace_all' : 'merge_safe'
      const res = store.commitOperatorAssignmentImport(mode)
      if (!res?.ok && res?.code === 'NEEDS_OVERWRITE') {
        /* preview banner will show hint via store */
      }
      nfcController.syncAssignmentsFromStore(store.getState().nfcAssignments)
      break
    }
    case 'operator-backup-preview-dismiss':
      store.clearOperatorBackupImportPreview()
      break
    case 'operator-reassign-cancel':
      store.cancelOperatorInlineReassign()
      nfcController.resetSelection()
      break
    case 'operator-reassign-confirm': {
      const ok = store.confirmOperatorInlineReassign()
      if (ok) {
        tableFeedback.scanSuccess()
        nfcController.resetSelection()
      }
      break
    }
    case 'go-nfc-test':
      store.setCurrentScreen('nfc-test')
      break
    case 'exit-nfc-assignment':
      store.exitNfcAssignment()
      nfcController.resetSelection()
      break
    case 'simulate-nfc-stub':
    case 'scan-nfc-tag':
      await runSinglePairAttempt()
      break
    case 'retry-nfc-scan':
      store.retryNfcScan()
      await runSinglePairAttempt()
      break
    case 'skip-assignment-unit':
      store.skipToNextUnassignedUnit()
      break
    case 'clear-nfc-assignment': {
      const s = store.getState()
      const sel = value || s.selectedEntityId || s.selectedUnitId
      const tagId = sel ? s.nfcAssignments?.[sel]?.uid || '' : ''
      console.log('CLEAR_UNIT_REQUEST', sel || '(none)', tagId || '(none)')
      nfcController.clearAssignment(sel)
      console.log('CLEAR_UNIT_SUCCESS', nfcController.getState().activeAssignment.assignments || {})
      break
    }
    case 'nfc-select-unit':
      store.selectAssignmentUnit(value)
      nfcController.selectUnit(value)
      break
    case 'nfc-clear-unit':
      nfcController.clearAssignment(value)
      break
    case 'nfc-reset-session':
      nfcController.resetSession()
      break
    case 'nfc-simulate-event': {
      const fakeTagId = `sim-${Date.now().toString(36)}`
      globalThis.SPEARHEAD_NFC_NATIVE_RECEIVE?.({
        action: 'SIMULATED_NFC_INTENT',
        tagId: fakeTagId,
        source: 'manual-test-button',
        at: new Date().toISOString(),
      })
      break
    }
    case 'start-runtime':
      store.attemptEnterRuntime()
      break
    case 'dismiss-tag-identity-sheet':
      store.dismissPhysicalTagConflict()
      break
    case 'jump-to-linked-piece':
      if (value) {
        const focused = store.jumpToOwnedPhysicalPiece(value)
        if (focused) {
          scrollEntityCardIntoView(value)
          window.setTimeout(() => store.clearPhysicalUiPulses(), 2200)
        }
      }
      break
    case 'reassign-physical-tag': {
      const tag = el?.getAttribute('data-nfc-tag') || ''
      if (tag && value) {
        const moved = store.reassignPhysicalTagToEntity(tag, value)
        scrollEntityCardIntoView(value)
        window.setTimeout(() => store.clearPhysicalUiPulses(), 900)
        if (moved) {
          const s = store.getState()
          if (!s.nfcRuntimeLookupMode) {
            const next = getNextUnassignedEntity(s)
            if (next?.entityId) {
              nfcPairSessionGen += 1
              const gen = nfcPairSessionGen
              await runPairingAssemblyLine(next.entityId, gen)
            }
          }
        }
      }
      break
    }
    case 'relink-inline-tag': {
      const moved = store.relinkRecognizedTagInline()
      if (moved) {
        const s = store.getState()
        const focused = s.selectedEntityId ?? s.selectedUnitId
        if (focused) scrollEntityCardIntoView(focused)
        window.setTimeout(() => store.clearPhysicalUiPulses(), 900)
        if (!s.nfcRuntimeLookupMode) {
          const next = getNextUnassignedEntity(s)
          if (next?.entityId) {
            nfcPairSessionGen += 1
            const gen = nfcPairSessionGen
            await runPairingAssemblyLine(next.entityId, gen)
          }
        }
      }
      break
    }
    case 'nfc-tap-entity': {
      store.selectAssignmentUnit(value)
      nfcController.selectUnit(value)
      break
    }
    case 'close-nfc-tap-detail':
      store.clearNfcTapSelectDetail()
      break
    case 'close-package-nfc-highlight':
      store.clearPackageNfcHighlight()
      break
    case 'go-runtime':
      store.attemptEnterRuntime()
      break
    case 'simulate-runtime-scan': {
      if (!ENABLE_DEV_FIXTURES) break
      try {
        const tag = await readTagStub()
        if (tag?.id) {
          const env = {
            uid: tag.id,
            tagId: tag.id,
            transactionId: `sim_${Date.now()}`,
            receivedAt: Date.now(),
            queueSequence: 0,
            sourcePath: 'dev_simulate',
          }
          const action = buildRuntimeResolveTagAction(env, store.getState())
          const res = store.dispatchRuntimeAction(action)
          applyNfcDispatchDiagnostics(res)
          applyScanPresentationFeedback(res)
          nfcGameplayAfterRuntimeDispatch(store, action, env, res.outcome)
        }
      } catch (err) {
        console.warn('NFC_STUB_DISABLED', err?.message || err)
      }
      break
    }
    case 'runtime-toggle-activated':
      store.toggleRuntimeUnitActivated(value)
      break
    case 'runtime-toggle-destroyed':
      store.toggleRuntimeUnitDestroyed(value)
      break
    case 'runtime-wound-down':
      store.applyRuntimeWoundDelta(value, -1)
      break
    case 'runtime-wound-up':
      store.applyRuntimeWoundDelta(value, 1)
      break
    case 'runtime-add-status':
      store.addRuntimeStatusEffect(value, effect || 'Demo effect')
      break
    case 'gameplay-next-phase': {
      const s = store.getState()
      const phases = ['command', 'movement', 'shooting', 'charge', 'fight']
      const cur = String(s.gameplay?.phase || 'command')
      const idx = phases.indexOf(cur)
      const nextPh = phases[idx < 0 ? 0 : (idx + 1) % phases.length]
      store.dispatchRuntimeAction({
        ...createGameplayAction(GAMEPLAY_ACTION_TYPES.PHASE_CHANGED, {
          transactionId: `gp_phase_${s.runtimeActionSequence}`,
          payload: { phase: nextPh },
        }),
        runtimeEpoch: s.runtimeEpoch,
        actionSequence: s.runtimeActionSequence + 1,
        receivedAt: Date.now(),
      })
      tableFeedback.phaseChanged()
      break
    }
    case 'gameplay-advance-turn': {
      const s = store.getState()
      const nextTurn = (Number(s.gameplay?.turn) || 1) + 1
      store.dispatchRuntimeAction({
        ...createGameplayAction(GAMEPLAY_ACTION_TYPES.TURN_ADVANCED, {
          transactionId: `gp_turn_${s.runtimeActionSequence}`,
          payload: { turn: nextTurn },
        }),
        runtimeEpoch: s.runtimeEpoch,
        actionSequence: s.runtimeActionSequence + 1,
        receivedAt: Date.now(),
      })
      tableFeedback.phaseChanged()
      break
    }
    case 'gameplay-advance-round': {
      const s = store.getState()
      const nextRound = (Number(s.gameplay?.round) || 1) + 1
      store.dispatchRuntimeAction({
        ...createGameplayAction(GAMEPLAY_ACTION_TYPES.ROUND_ADVANCED, {
          transactionId: `gp_round_${s.runtimeActionSequence}`,
          payload: { round: nextRound },
        }),
        runtimeEpoch: s.runtimeEpoch,
        actionSequence: s.runtimeActionSequence + 1,
        receivedAt: Date.now(),
      })
      tableFeedback.phaseChanged()
      break
    }
    case 'gameplay-feedback-dismiss': {
      const s = store.getState()
      store.dispatchRuntimeAction({
        ...createGameplayAction(GAMEPLAY_ACTION_TYPES.UI_SET, {
          transactionId: `gp_ui_${s.runtimeActionSequence}`,
          payload: { feedback: null },
        }),
        runtimeEpoch: s.runtimeEpoch,
        actionSequence: s.runtimeActionSequence + 1,
        receivedAt: Date.now(),
      })
      break
    }
    case 'gameplay-register-dismiss': {
      const s = store.getState()
      store.dispatchRuntimeAction({
        ...createGameplayAction(GAMEPLAY_ACTION_TYPES.UI_SET, {
          transactionId: `gp_ui_${s.runtimeActionSequence}`,
          payload: { registerOpen: false, registerUid: '', feedback: null },
        }),
        runtimeEpoch: s.runtimeEpoch,
        actionSequence: s.runtimeActionSequence + 1,
        receivedAt: Date.now(),
      })
      break
    }
    case 'gameplay-register-submit': {
      const form = document.getElementById('gameplay-register-form')
      if (!form) break
      const fd = new FormData(form)
      const uid = String(fd.get('registerUid') || '').trim()
      const entityType = String(fd.get('entityType') || 'miniature').trim()
      const ownerId = String(fd.get('ownerId') || 'p1').trim()
      const displayName = String(fd.get('displayName') || '').trim()
      if (!uid) break
      const s = store.getState()
      const regSeq = Number(s.gameplay?.entityRegistry?.registrationSeq) || 0
      const entityId = `ge_${String(regSeq + 1).padStart(6, '0')}`
      store.dispatchRuntimeAction({
        ...createGameplayAction(GAMEPLAY_ACTION_TYPES.ENTITY_REGISTERED, {
          entityId,
          uid,
          transactionId: `gp_reg_${s.runtimeActionSequence}`,
          payload: {
            entityType,
            ownerId,
            revision: 1,
            displayName: displayName || entityId,
            wounds: 3,
            appendToRuntimeForces: true,
          },
        }),
        runtimeEpoch: s.runtimeEpoch,
        actionSequence: s.runtimeActionSequence + 1,
        receivedAt: Date.now(),
      })
      break
    }
    default:
      console.debug('[event] unknown action ignored', action)
    }
    handleReturn = undefined
  } catch (err) {
    console.error('handleAction', action, err)
    throw err
  }
}

globalThis.__SPEARHEAD_RENDER__ = render

store.subscribe(render)
if (IS_DEV_BUILD) {
  console.warn('[BOOT] render subscribed')
}
render()
if (IS_DEV_BUILD) {
  console.warn('[BOOT] initial render completed')
}

if (typeof globalThis !== 'undefined' && globalThis.__SPEARHEAD_RUNTIME_TIMELINE__ === true) {
  import('./components/runtimeTimelineOverlay.js')
    .then((m) => {
      m.mountRuntimeTimelineOverlay({ store })
    })
    .catch((e) => console.warn('[BOOT] runtime timeline overlay', e))
}
