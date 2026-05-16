import { processRawPackageJson, fetchBuiltInPackageJson } from '../services/packagePipeline.js'
import {
  loadPackageRuntimeDefinition,
  resolveSemanticMappingFromPackageDefinition,
} from '../services/packageRuntimeLoader.js'
import {
  getPackageEntry,
  isQuickStartPackageEntry,
  registerImportedPackageFromRuntime,
  mapAdapterSystemIdToLauncherGroup,
} from '../packages/packageRegistry.js'
import { rememberPackageLoad } from '../services/recentLists.js'
import { loadSessionSnapshot, saveSessionSnapshot } from '../services/sessionSnapshot.js'
import { listThemeIds } from '../themes/index.js'
import { activeRosterShapeFromRegistry } from '../runtime/activeRosterFromRegistry.js'
import { getNfcBindableEntities, getNextUnassignedEntity } from '../runtime/entitySelectors.js'
import { assertRuntimeTransition } from '../runtime/runtimeGuards.js'
import { auditRuntimeInvariants } from '../runtime/runtimeInvariants.js'
import {
  journalInvariantWarnings,
  journalRuntimeEvent,
  journalRuntimeTransition,
} from '../runtime/runtimeEventJournal.js'
import { resolveRuntimeDomain, runRuntimeDomainLifecycle } from '../runtime/runtimeDomainRouter.js'
import { runRuntimePurityChecks } from '../runtime/runtimePurity.js'
import {
  maybeDevDeepFreezeTransitionArtifacts,
  validateRuntimeTransitionResultShape,
} from '../runtime/runtimeTransitionShape.js'
import { hashRuntimeStateShape } from '../runtime/runtimeStateHash.js'
import { pushRuntimeSnapshot } from '../runtime/runtimeSnapshots.js'
import { attemptRuntimeRecovery } from '../runtime/runtimeRecovery.js'
import { recordTransitionPerf } from '../runtime/runtimePerf.js'
import { scheduleRuntimeEffects } from '../runtime/effects/index.js'
import { updateRuntimeMemoryPressure } from '../runtime/runtimeMemory.js'
import { createInitialGameplayState, cloneGameplayState } from '../domain/gameState.js'
import {
  appendRuntimeReplayActionLog,
  getRuntimeReplayActionLog as getReplayLogSlice,
  clearRuntimeReplayActionLog,
} from '../runtime/runtimeReplayLog.js'
import { devAssertSerializableOrWarn } from '../runtime/assertSerializable.js'
import { createGameplayAction, GAMEPLAY_ACTION_TYPES } from '../domain/gameplayActionTypes.js'
import {
  buildDemoRuntimeRegistry,
  DEMO_SCENARIO_PRESETS,
} from '../domain/demoScenario.js'
import {
  getOperatorFaction,
  getOperatorGame,
  makeOperatorPackageKey,
  parseOperatorPackageKey,
} from '../domain/operatorCatalog.js'
import {
  buildOperatorRuntimeRegistry,
  normalizeOperatorRosterRows,
} from '../services/operatorRosterBuilder.js'
import {
  applyTagReassignmentToTarget,
  assignTagToEntity,
  assignmentCommitLockExpiry,
  buildAssignedTagsMirror,
  lookupAssignmentByUid,
  normalizeUid,
  removeAssignmentForEntity,
  sanitizePersistedNfcBundle,
  validateAssignments,
} from '../services/operatorAssignmentService.js'
import {
  exportAssignmentBundle,
  importAssignmentBundle,
  previewAssignmentBundleImport,
  validateAssignmentBundle,
} from '../services/operatorAssignmentBackup.js'

const OPERATOR_RESUME_SCREENS = new Set([
  'operator-package',
  'operator-faction',
  'roster-import',
  'operator-overview',
  'operator-validation',
  'nfc-assignment',
])

function normalizeOperatorResumeScreen(raw) {
  const s = String(raw || '').trim()
  if (OPERATOR_RESUME_SCREENS.has(s)) return s
  return 'operator-overview'
}

function operatorAppModeForScreen(screen) {
  return screen === 'nfc-assignment' ? 'nfc_assignment' : 'operator'
}

const VALID_SCREENS = [
  'operator-package',
  'operator-faction',
  'roster-import',
  'operator-overview',
  'operator-validation',
  'home',
  'game-selection',
  'faction-selection',
  'package-selection',
  'theme-selection',
  'roster-viewer',
  'nfc-assignment',
  'nfc-test',
  'runtime',
  /** Diagnostic-only; Android WebView input probing (`?interactionLab=1`). */
  'interaction-test',
]

const HISTORY_MAX = 24
const RECENT_ASSIGNMENTS_MAX = 10
const RUNTIME_LOOKUP_HISTORY_MAX = 15

/** Gameplay snapshot per entity (mutable); roster/registry definitions stay immutable. */
function defaultRuntimeGameplayRecord(entityId, displayName, woundsMax) {
  const w = Number(woundsMax)
  return {
    entityId,
    unitId: entityId,
    name: displayName,
    woundsMax: w,
    woundsCurrent: w,
    activated: false,
    destroyed: false,
    statusEffects: [],
    lastResolvedTagId: null,
    lastResolvedAt: null,
    lastModifiedAt: null,
  }
}

function buildRuntimeUnitsFromRegistry(registry) {
  const out = {}
  if (!registry?.entities) return out
  for (const e of registry.entities) {
    const w = Number(e.fields?.wounds) || 0
    out[e.entityId] = defaultRuntimeGameplayRecord(
      e.entityId,
      e.display?.name ?? e.entityId,
      w
    )
  }
  return out
}

/** Overlay persisted gameplay state onto freshly built runtime units (resume / reload). */
function mergeRuntimeUnitsRestored(fresh, saved) {
  const out = { ...fresh }
  if (!saved || typeof saved !== 'object') return out
  for (const [id, ru] of Object.entries(saved)) {
    const base = out[id]
    if (!base) continue
    out[id] = {
      ...base,
      ...ru,
      entityId: base.entityId,
      unitId: base.unitId,
      statusEffects: Array.isArray(ru.statusEffects) ? [...ru.statusEffects] : [...(base.statusEffects || [])],
    }
  }
  return out
}

function cloneRuntimeRegistry(reg) {
  if (!reg) return null
  return {
    entities: reg.entities.map((e) => ({
      ...e,
      display: { ...e.display },
      fields: { ...e.fields },
      capabilities: { ...e.capabilities },
      certification: { ...e.certification },
      relationships: Array.isArray(e.relationships) ? [...e.relationships] : [],
    })),
    relationships: [...(reg.relationships || [])],
    metadata: { ...reg.metadata },
  }
}

/**
 * Centralized state (learning note):
 * - All authoritative UI/data lives here so renders stay predictable.
 * - Async roster loading resolves before a single hydrates update; observers see one coherent snapshot.
 */

export function createStore() {
  const state = {
    /** Operator workflow: package → faction → roster import → NFC assignment. */
    currentScreen: 'operator-package',
    operatorGameId: '',
    operatorFactionKey: '',
    operatorImportError: '',
    assignmentCommitLockUntil: 0,
    operatorValidationResult: null,
    operatorUxPulse: null,
    operatorHydrationWarning: '',
    operatorPendingClear: false,
    operatorRosterImportedAt: 0,
    /** Internal NFC stress / resume counters — not shown in operator UI */
    scanSessionMetrics: {
      lastUidNorm: '',
      lastScanAt: 0,
      ignoredLockCount: 0,
      ignoredBounceCount: 0,
      resumeNotifyCount: 0,
      lastValidationUid: '',
      lastValidationAt: 0,
      validationBounceCount: 0,
    },
    /** Parsed backup import preview for overview banner */
    operatorBackupImportPreview: null,
    /** Launcher browse filter — empty string = all packages */
    selectedLauncherGroupKey: '',
    packageFactionFilter: '',
    selectedFaction: '',
    selectedPackage: '',
    runtimeRegistry: null,
    /** Derived presentation shape for legacy screens — rebuilt from registry only */
    activeRoster: null,
    selectedEntity: '',
    selectedEntityId: null,
    selectedEntityName: null,
    selectedEntityIndex: null,
    activeThemeId: 'default-dark',
    adminMode: false,
    appMode: 'operator',
    lastNfcStubRead: '',
    /** LAYER 1 (active runtime linkage): authoritative THIS-SESSION UID→entity map */
    assignedTags: {},
    /** LAYER 2 (historical recognition): tag seen before; never implies active linkage */
    nfcHistoricalTags: {},
    recentAssignments: [],
    nfcStatus: 'idle',
    lastAssignmentResult: null,
    runtimeResolvedTag: null,
    runtimeResolvedUnit: null,
    runtimeLastLookupResult: null,
    runtimeLookupHistory: [],
    runtimeUnits: {},
    /** Entity->tag assignment view for active runtime UI linkage only */
    nfcAssignments: {},
    /** LAYER 3 (live interaction): transient NFC interaction phase */
    nfcScanPhase: 'waiting',
    /**
     * Scoped active NFC conflict model:
     * {
     *   scannedTagId, sourceUnitId, targetUnitId, timestamp, mode,
     *   ...display metadata
     * }
     */
    activeNfcConflict: null,
    runtimeGateWarning: '',
    /** Physical tag identity sheet (duplicate tag on another piece during pairing) */
    nfcIdentityModal: null,
    /** Foundation for future runtime “recognized object” flow — pauses auto pairing chain when true */
    nfcRuntimeLookupMode: false,
    nfcUiHighlightEntityId: null,
    /** Brief visual when a tag moves from one entity to another */
    nfcPulseUnlinkedEntityId: null,
    nfcScanReceiptState: 'idle',
    nfcLastScannedUid: '',
    nfcLastScanReceiptAt: 0,
    nfcLastResolvedEntityId: null,
    nfcLastDispatchLatencyMs: 0,
    nfcLastRuntimeDispatchOk: null,
    nfcTapSelectDetailOpen: false,
    nfcScanDedupe: null,
    nfcLastTransportFailureReason: '',
    packageNfcHighlightEntityId: null,
    packageNfcHighlightTagId: null,
    packageNfcLookupSource: null,
    packageBrowseNfcEntityCount: 0,
    /** Optional package runtime semantic definition (manifest/entities/actions/mappings). */
    packageRuntimeDefinition: null,
    packageRuntimeLoadStatus: 'idle',
    packageRuntimeLoadError: '',
    nfcLastScanRoute: '',
    /** Full-screen cue while a gold/demo package JSON is loading */
    runtimePrepareOverlay: false,
    /** Brief fade-in on the match shell after quick-start load */
    battlefieldRevealPulse: false,
    renderCount: 0,
    lastAction: 'app initialized',
    actionHistory: [],
    runtimeEpoch: 0,
    runtimeActionSequence: 0,
    runtimeTransitionFrozen: false,
    runtimeCriticalAlertCount: 0,
    /** Incremented on visibility hidden — resume diagnostics / stale detection. */
    runtimeSuspendEpoch: 0,
    /** Deterministic tabletop gameplay (entities, zones, objectives, auras) — never mutate from NFC handlers. */
    gameplay: createInitialGameplayState(),
  }

  const listeners = new Set()
  /** When set, `updateState` / `notify` emit dispatch-phase diagnostics for runtime actions. */
  let activeDispatchJournalMeta = null
  /** Count effect scheduler failures per transaction id (diagnostic). */
  const effectScheduleFailureByTx = new Map()
  let batchDepth = 0
  let pendingNotify = false

  function getState() {
    return {
      ...state,
      runtimeRegistry: cloneRuntimeRegistry(state.runtimeRegistry),
      activeRoster: state.activeRoster
        ? { ...state.activeRoster, units: [...state.activeRoster.units] }
        : null,
      selectedUnit: state.selectedEntityId || '',
      selectedUnitId: state.selectedEntityId,
      selectedUnitName: state.selectedEntityName,
      selectedUnitIndex: state.selectedEntityIndex,
      assignedTags: { ...state.assignedTags },
      nfcHistoricalTags: { ...state.nfcHistoricalTags },
      recentAssignments: [...state.recentAssignments],
      lastAssignmentResult: state.lastAssignmentResult
        ? { ...state.lastAssignmentResult }
        : null,
      runtimeResolvedUnit: state.runtimeResolvedUnit
        ? { ...state.runtimeResolvedUnit }
        : null,
      runtimeLastLookupResult: state.runtimeLastLookupResult
        ? { ...state.runtimeLastLookupResult }
        : null,
      runtimeLookupHistory: state.runtimeLookupHistory.map((entry) => ({ ...entry })),
      runtimeUnits: Object.fromEntries(
        Object.entries(state.runtimeUnits).map(([id, ru]) => [
          id,
          {
            ...ru,
            statusEffects: [...(ru.statusEffects || [])],
          },
        ])
      ),
      actionHistory: [...state.actionHistory],
      nfcAssignments: Object.fromEntries(
        Object.entries(state.nfcAssignments).map(([id, a]) => [
          id,
          a ? { ...a } : a,
        ])
      ),
      nfcIdentityModal: state.nfcIdentityModal ? { ...state.nfcIdentityModal } : null,
      activeNfcConflict: state.activeNfcConflict ? { ...state.activeNfcConflict } : null,
      runtimeEpoch: state.runtimeEpoch,
      runtimeActionSequence: state.runtimeActionSequence,
      runtimeTransitionFrozen: state.runtimeTransitionFrozen,
      runtimeCriticalAlertCount: state.runtimeCriticalAlertCount,
      runtimeSuspendEpoch: state.runtimeSuspendEpoch,
      gameplay: cloneGameplayState(state.gameplay),
      runtimeReady: computeRuntimeReady(state),
      nfcCertifiedUnitCount: countCertifiedUnits(state),
    }
  }

  function countCertifiedUnits(s) {
    const bindable = getNfcBindableEntities(s)
    if (!bindable.length) return 0
    return bindable.filter((e) => Boolean(s.nfcAssignments[e.entityId]?.uid)).length
  }

  function computeRuntimeReady(s) {
    const bindable = getNfcBindableEntities(s)
    /** Lists where nothing requires NFC certification — table can open immediately. */
    if (!bindable.length) return true
    return bindable.every((e) => Boolean(s.nfcAssignments[e.entityId]?.uid))
  }

  /** Diagnostics — why runtime gate passes or fails (Android interaction tracing). */
  function explainRuntimeReadyDetail() {
    const s = state
    const bindable = getNfcBindableEntities(s)
    const totalEntities = Array.isArray(s.runtimeRegistry?.entities) ? s.runtimeRegistry.entities.length : 0
    if (!bindable.length) {
      return {
        runtimeReady: true,
        bindableCount: 0,
        bindableEntityIds: [],
        totalEntities,
        reason: 'no_mandatory_nfc_bindables_all_optional_or_empty',
        blockingMissing: [],
      }
    }
    const missing = bindable.filter((e) => !s.nfcAssignments?.[e.entityId]?.uid).map((e) => e.entityId)
    return {
      runtimeReady: missing.length === 0,
      bindableCount: bindable.length,
      bindableEntityIds: bindable.map((e) => e.entityId),
      totalEntities,
      reason:
        missing.length === 0
          ? 'all_bindable_entities_have_tag_assignments'
          : 'missing_uid_for_required_bindable_entities',
      blockingMissing: missing,
    }
  }

  /** Clears runtime lookup snapshots when roster / assignment context resets. */
  function runtimeStorageReset() {
    return {
      runtimeResolvedTag: null,
      runtimeResolvedUnit: null,
      runtimeLastLookupResult: null,
      runtimeLookupHistory: [],
      nfcScanReceiptState: 'idle',
      nfcLastScannedUid: '',
      nfcLastScanReceiptAt: 0,
      nfcLastResolvedEntityId: null,
      nfcLastDispatchLatencyMs: 0,
      nfcLastRuntimeDispatchOk: null,
      nfcTapSelectDetailOpen: false,
      nfcScanDedupe: null,
      nfcLastTransportFailureReason: '',
      packageNfcHighlightEntityId: null,
      packageNfcHighlightTagId: null,
      packageNfcLookupSource: null,
      packageBrowseNfcEntityCount: 0,
      nfcLastScanRoute: '',
    }
  }

  /** Clears tag assignment bookkeeping when roster context resets (new game/faction/package path). */
  function assignmentStorageReset() {
    return {
      assignedTags: {},
      recentAssignments: [],
      nfcStatus: 'idle',
      lastAssignmentResult: null,
      lastNfcStubRead: '',
      runtimeUnits: {},
      runtimeRegistry: null,
      nfcAssignments: {},
      nfcScanPhase: 'waiting',
      runtimeGateWarning: '',
      nfcIdentityModal: null,
      activeNfcConflict: null,
      nfcRuntimeLookupMode: false,
      nfcUiHighlightEntityId: null,
      nfcPulseUnlinkedEntityId: null,
      nfcScanReceiptState: 'idle',
      nfcLastScannedUid: '',
      nfcLastScanReceiptAt: 0,
      nfcLastResolvedEntityId: null,
      nfcLastDispatchLatencyMs: 0,
      nfcLastRuntimeDispatchOk: null,
      nfcTapSelectDetailOpen: false,
      nfcScanDedupe: null,
      nfcLastTransportFailureReason: '',
      packageNfcHighlightEntityId: null,
      packageNfcHighlightTagId: null,
      packageNfcLookupSource: null,
      packageBrowseNfcEntityCount: 0,
      packageRuntimeDefinition: null,
      packageRuntimeLoadStatus: 'idle',
      packageRuntimeLoadError: '',
      nfcLastScanRoute: '',
      gameplay: createInitialGameplayState(),
      ...runtimeStorageReset(),
    }
  }

  function subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function notify() {
    if (activeDispatchJournalMeta) {
      journalRuntimeEvent('dispatch_phase', {
        phase: 'notify',
        actionType: activeDispatchJournalMeta.actionType,
        transactionId: activeDispatchJournalMeta.transactionId,
      })
    }
    const snapshot = getState()
    for (const listener of listeners) {
      try {
        listener(snapshot)
      } catch (error) {
        const message = String(error?.message || error)
        const stack = error instanceof Error ? error.stack : undefined
        console.error('SPEARHEAD_STORE_NOTIFY_ERROR', { phase: 'subscriber', message, stack })
        journalRuntimeEvent('subscriber_error', {
          message,
          stack,
          actionType: activeDispatchJournalMeta?.actionType,
          transactionId: activeDispatchJournalMeta?.transactionId,
        })
      }
    }
  }

  function beginBatch() {
    batchDepth += 1
  }

  function endBatch() {
    batchDepth = Math.max(0, batchDepth - 1)
    if (batchDepth === 0 && pendingNotify) {
      pendingNotify = false
      notify()
    }
  }

  function maybePersistTabletopSnapshot(patch) {
    const watch = ['nfcAssignments', 'assignedTags', 'nfcHistoricalTags', 'runtimeUnits', 'recentAssignments']
    if (!watch.some((k) => Object.prototype.hasOwnProperty.call(patch, k))) return
    if (!state.selectedPackage) return
    try {
      saveSessionSnapshot({
        launcherGroupKey: state.selectedLauncherGroupKey,
        packageKey: state.selectedPackage,
        themeId: state.activeThemeId,
        nfcBundle: {
          nfcAssignments: state.nfcAssignments,
          assignedTags: state.assignedTags,
          nfcHistoricalTags: state.nfcHistoricalTags,
          runtimeUnits: state.runtimeUnits,
          recentAssignments: state.recentAssignments,
        },
        ...(String(state.selectedPackage || '').startsWith('operator:')
          ? {
              operatorGameId: state.operatorGameId,
              operatorFactionKey: state.operatorFactionKey,
              lastOperatorScreen: state.currentScreen,
              embeddedOperatorRegistry: state.runtimeRegistry ? cloneRuntimeRegistry(state.runtimeRegistry) : null,
            }
          : {}),
      })
      console.debug('SPEARHEAD_PERSIST autosave package=', state.selectedPackage)
    } catch (e) {
      console.warn('SPEARHEAD_PERSIST autosave_error', e)
    }
  }

  function updateState(patch, actionLabel) {
    Object.assign(state, patch)
    if (activeDispatchJournalMeta) {
      journalRuntimeEvent('dispatch_phase', {
        phase: 'commit',
        actionType: activeDispatchJournalMeta.actionType,
        transactionId: activeDispatchJournalMeta.transactionId,
        actionLabel: String(actionLabel || ''),
      })
    }
    state.lastAction = actionLabel
    if (batchDepth > 0) pendingNotify = true
    else notify()
    maybePersistTabletopSnapshot(patch)
    updateRuntimeMemoryPressure()
  }

  function recordAction(type, value = '') {
    // Event ordering visibility:
    // We append each important event in the order it happened.
    // This makes "event -> state update -> render -> UI change" easy to inspect.
    const action = {
      type,
      value,
      timestamp: Date.now(),
      renderIndex: state.renderCount,
    }

    state.actionHistory.push(action)

    if (state.actionHistory.length > HISTORY_MAX) {
      state.actionHistory = state.actionHistory.slice(-HISTORY_MAX)
    }

    console.debug('[debug] action history append', action)
  }

  function setCurrentScreen(nextScreen) {
    if (!VALID_SCREENS.includes(nextScreen)) return
    if (state.currentScreen === nextScreen) return

    console.debug('[flow] screen transition', {
      from: state.currentScreen,
      to: nextScreen,
    })
    recordAction('SCREEN_CHANGE', nextScreen)

    const patch = { currentScreen: nextScreen }
    if (state.appMode === 'nfc_assignment' && nextScreen !== 'nfc-assignment') {
      patch.appMode = String(state.selectedPackage || '').startsWith('operator:') ? 'operator' : 'selection-flow'
      patch.activeNfcConflict = null
      patch.lastAssignmentResult = null
      patch.nfcScanPhase = 'waiting'
      patch.nfcStatus = 'idle'
      recordAction('APP_MODE', patch.appMode)
      console.debug('[flow] left nfc assignment phase', patch.appMode)
    }
    if (state.appMode === 'runtime' && nextScreen !== 'runtime') {
      patch.appMode = 'selection-flow'
      patch.activeNfcConflict = null
      recordAction('APP_MODE', 'selection-flow')
    }

    if (state.currentScreen === 'operator-validation' && nextScreen !== 'operator-validation') {
      patch.operatorValidationResult = null
      patch.operatorUxPulse = null
    }
    if (nextScreen !== 'operator-overview') {
      patch.operatorPendingClear = false
      patch.operatorBackupImportPreview = null
    }

    // When returning to roster view without reloading data, still log a VIEW_ROSTER marker
    // so the timeline shows "intent to display roster" separately from LOAD_ROSTER.
    if (nextScreen === 'roster-viewer' && state.activeRoster?.name) {
      recordAction('VIEW_ROSTER', state.activeRoster.name)
    }
    updateState(patch, `screen -> ${nextScreen}`)
  }

  /**
   * Certification entry: roster confirmation → NFC assignment (required before runtime).
   */
  function navigateNfcAssignment() {
    if (!state.activeRoster) {
      recordAction('ENTER_NFC_ASSIGNMENT_BLOCKED', 'no roster')
      console.warn('[flow] cannot enter NFC assignment without active roster')
      return
    }
    if (state.currentScreen === 'nfc-assignment') return
    recordAction('NAV_NFC_ASSIGNMENT', `${state.currentScreen}->nfc-assignment`)
    recordAction('ENTERED_NFC_ASSIGNMENT', state.activeRoster.name)
    console.debug('[flow] entered nfc assignment flow')
    updateState(
      {
        currentScreen: 'nfc-assignment',
        appMode: 'nfc_assignment',
        nfcScanPhase: 'waiting',
        runtimeGateWarning: '',
        lastAssignmentResult: null,
        activeNfcConflict: null,
        selectedEntity: '',
        selectedEntityId: null,
        selectedEntityName: null,
        selectedEntityIndex: null,
      },
      'entered nfc assignment certification'
    )
  }

  /** @deprecated name — use navigateNfcAssignment */
  function enterNfcAssignment() {
    navigateNfcAssignment()
  }

  /**
   * Exit certification UI back to roster confirmation (assignments preserved).
   */
  function exitNfcAssignment() {
    recordAction('EXIT_NFC_ASSIGNMENT', state.activeRoster?.name || '')
    const nextScreen = state.activeRoster
      ? String(state.selectedPackage || '').startsWith('operator:')
        ? 'operator-overview'
        : 'roster-viewer'
      : 'operator-package'
    updateState(
      {
        appMode: String(state.selectedPackage || '').startsWith('operator:') ? 'operator' : 'selection-flow',
        currentScreen: nextScreen,
        nfcScanPhase: 'waiting',
        activeNfcConflict: null,
        lastAssignmentResult: null,
        nfcStatus: 'idle',
        selectedEntity: '',
        selectedEntityId: null,
        selectedEntityName: null,
        selectedEntityIndex: null,
      },
      'exit nfc assignment'
    )
    if (nextScreen === 'roster-viewer' && state.activeRoster?.name) {
      recordAction('VIEW_ROSTER', state.activeRoster.name)
    }
    if (nextScreen === 'roster-import' && state.activeRoster?.name) {
      recordAction('VIEW_ROSTER_IMPORT', state.activeRoster.name)
    }
    if (nextScreen === 'operator-overview' && state.activeRoster?.name) {
      recordAction('VIEW_OPERATOR_OVERVIEW', state.activeRoster.name)
    }
  }

  let operatorPulseTimer = null
  function scheduleOperatorPulseClear() {
    if (operatorPulseTimer) clearTimeout(operatorPulseTimer)
    operatorPulseTimer = globalThis.setTimeout(() => {
      operatorPulseTimer = null
      if (state.currentScreen !== 'operator-validation') return
      if (state.operatorUxPulse) updateState({ operatorUxPulse: null }, 'operator pulse clear')
    }, 680)
  }

  function applyValidationScan(rawUid) {
    if (state.currentScreen !== 'operator-validation') return
    const uid = normalizeUid(rawUid)
    const entities = state.runtimeRegistry?.entities || []
    const now = Date.now()
    const sm = { ...(state.scanSessionMetrics || {}) }
    if (uid && uid === sm.lastValidationUid && now - (Number(sm.lastValidationAt) || 0) < 220) {
      sm.validationBounceCount = (Number(sm.validationBounceCount) || 0) + 1
    }
    sm.lastValidationUid = uid || sm.lastValidationUid
    sm.lastValidationAt = now
    if (!uid) {
      updateState(
        {
          scanSessionMetrics: sm,
          operatorValidationResult: {
            status: 'unknown',
            headline: 'Unassigned tag',
            detail: 'No usable UID on this scan',
          },
          operatorUxPulse: 'warn',
        },
        'validation empty uid'
      )
      scheduleOperatorPulseClear()
      return
    }
    const integrity = validateAssignments({
      nfcAssignments: state.nfcAssignments,
      assignedTags: state.assignedTags,
      entities,
    })
    const dupe = integrity.duplicateUids.some((d) => d.uid === uid)
    if (dupe) {
      updateState(
        {
          scanSessionMetrics: sm,
          operatorValidationResult: {
            status: 'conflict',
            headline: 'Assignment conflict detected',
            detail: 'This tag is linked to more than one roster entry',
          },
          operatorUxPulse: 'warn',
        },
        'validation duplicate uid'
      )
      scheduleOperatorPulseClear()
      return
    }
    const lu = lookupAssignmentByUid(uid, state.assignedTags, entities)
    if (lu.kind !== 'found') {
      updateState(
        {
          scanSessionMetrics: sm,
          operatorValidationResult: { status: 'unknown', headline: 'Unassigned tag', detail: '' },
          operatorUxPulse: 'warn',
        },
        'validation unassigned'
      )
      scheduleOperatorPulseClear()
      return
    }
    const g = getOperatorGame(state.operatorGameId)
    const f = getOperatorFaction(state.operatorGameId, state.operatorFactionKey)
    updateState(
      {
        scanSessionMetrics: sm,
        operatorValidationResult: {
          status: 'ok',
          headline: lu.unitName || lu.entityId,
          subline: f?.label || '',
          league: g?.label || '',
          detail: 'Assigned correctly',
        },
        operatorUxPulse: 'success',
      },
      'validation ok'
    )
    scheduleOperatorPulseClear()
  }

  function navigateOperatorOverview() {
    if (!state.activeRoster?.units?.length) return
    recordAction('NAV_OPERATOR_OVERVIEW', state.activeRoster.name || '')
    updateState(
      {
        currentScreen: 'operator-overview',
        appMode: 'operator',
        operatorPendingClear: false,
        lastAssignmentResult: null,
      },
      'operator overview'
    )
  }

  function navigateOperatorValidation() {
    if (!state.activeRoster?.units?.length) return
    recordAction('NAV_OPERATOR_VALIDATION', state.activeRoster.name || '')
    updateState(
      {
        currentScreen: 'operator-validation',
        appMode: 'operator',
        operatorValidationResult: null,
        operatorUxPulse: null,
        operatorPendingClear: false,
        lastAssignmentResult: null,
      },
      'operator validation'
    )
  }

  function dismissOperatorHydrationWarning() {
    if (!state.operatorHydrationWarning) return
    updateState({ operatorHydrationWarning: '' }, 'dismiss operator hydration warning')
  }

  function requestOperatorClearAssignments() {
    updateState({ operatorPendingClear: true }, 'operator clear assignments arm')
  }

  function cancelOperatorClearAssignments() {
    if (!state.operatorPendingClear) return
    updateState({ operatorPendingClear: false }, 'operator clear assignments cancel')
  }

  function confirmOperatorClearAssignments() {
    if (!state.operatorPendingClear) return
    const entities = state.runtimeRegistry?.entities || []
    updateState(
      {
        nfcAssignments: {},
        assignedTags: buildAssignedTagsMirror({}, entities),
        recentAssignments: [],
        lastAssignmentResult: null,
        operatorPendingClear: false,
        assignmentCommitLockUntil: 0,
        operatorHydrationWarning: '',
      },
      'operator cleared all assignments'
    )
    persistLauncherSession()
  }

  function notifyOperatorSessionResume() {
    const m = { ...(state.scanSessionMetrics || {}) }
    m.resumeNotifyCount = (Number(m.resumeNotifyCount) || 0) + 1
    m.lastScanAt = Date.now()
    updateState({ scanSessionMetrics: m }, 'operator session resume metrics')
  }

  function cancelOperatorInlineReassign() {
    const r = state.lastAssignmentResult
    if (r?.reason !== 'tag_already_assigned') return
    updateState(
      {
        lastAssignmentResult: null,
        nfcStatus: 'idle',
        nfcScanPhase: 'waiting',
      },
      'inline reassign cancelled'
    )
  }

  function confirmOperatorInlineReassign() {
    const r = state.lastAssignmentResult
    if (r?.reason !== 'tag_already_assigned' || !r.tagId || !r.requestedEntityId) return false
    if (isAssignmentCommitLocked()) return false
    const res = applyTagReassignmentToTarget({
      uid: r.tagId,
      targetEntityId: r.requestedEntityId,
      nfcAssignments: state.nfcAssignments,
      entities: state.runtimeRegistry?.entities || [],
      packageKey: state.selectedPackage || '',
      recentAssignments: state.recentAssignments,
      recentMax: RECENT_ASSIGNMENTS_MAX,
    })
    if (!res.ok) return false
    const patch = { ...res.patch, assignmentCommitLockUntil: assignmentCommitLockExpiry() }
    if (res.applyHistorical) {
      const { uid, entityId, entityName } = res.applyHistorical
      patch.nfcHistoricalTags = updateHistoricalTagMap(state.nfcHistoricalTags, uid, entityId, entityName)
    }
    const idx = state.activeRoster?.units?.findIndex((u) => u.id === r.requestedEntityId)
    if (idx != null && idx >= 0 && state.activeRoster?.units?.[idx]) {
      const u = state.activeRoster.units[idx]
      patch.selectedEntity = u.id
      patch.selectedEntityId = u.id
      patch.selectedEntityName = u.name
      patch.selectedEntityIndex = idx
    }
    const m = { ...(state.scanSessionMetrics || {}) }
    m.lastUidNorm = String(r.tagId || '').trim() || m.lastUidNorm
    m.lastScanAt = Date.now()
    patch.scanSessionMetrics = m
    recordAction('TAG_REASSIGN_INLINE', `${r.tagId}->${r.requestedEntityId}`)
    updateState(patch, 'inline reassign confirmed')
    persistLauncherSession()
    return true
  }

  function getOperatorAssignmentBackupJson() {
    const reg = state.runtimeRegistry
    if (!reg?.entities?.length || !String(state.selectedPackage || '').startsWith('operator:')) return ''
    const rosterId =
      String(state.activeRoster?.name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'roster'
    return exportAssignmentBundle({
      packageKey: state.selectedPackage,
      rosterId,
      rosterName: state.activeRoster?.name || reg.metadata?.listName || '',
      nfcAssignments: state.nfcAssignments,
      entities: reg.entities,
    })
  }

  function previewOperatorAssignmentImport(parsed) {
    if (!parsed || typeof parsed !== 'object') {
      updateState(
        { operatorBackupImportPreview: { ok: false, at: Date.now(), errors: ['Could not read backup file.'] } },
        'backup import invalid'
      )
      return false
    }
    if (!String(state.selectedPackage || '').startsWith('operator:') || !state.runtimeRegistry?.entities?.length) {
      updateState(
        { operatorBackupImportPreview: { ok: false, at: Date.now(), errors: ['No operator roster loaded.'] } },
        'backup import blocked'
      )
      return false
    }
    const v = validateAssignmentBundle(parsed)
    if (!v.ok) {
      updateState({ operatorBackupImportPreview: { ok: false, at: Date.now(), errors: v.errors } }, 'backup validate fail')
      return false
    }
    const preview = previewAssignmentBundleImport(parsed, {
      entities: state.runtimeRegistry.entities,
      nfcAssignments: state.nfcAssignments,
      packageKey: state.selectedPackage || '',
    })
    if (!preview.ok) {
      updateState(
        { operatorBackupImportPreview: { ok: false, at: Date.now(), errors: preview.errors || ['Preview failed'] } },
        'backup preview fail'
      )
      return false
    }
    updateState(
      {
        operatorBackupImportPreview: {
          ok: true,
          at: Date.now(),
          safeCount: preview.toApply.length,
          conflictCount: preview.conflicts.length,
          unknownCount: preview.unknownEntityIds.length,
          bundle: parsed,
        },
      },
      'backup import preview ready'
    )
    return true
  }

  function clearOperatorBackupImportPreview() {
    if (!state.operatorBackupImportPreview) return
    updateState({ operatorBackupImportPreview: null }, 'backup import preview cleared')
  }

  function commitOperatorAssignmentImport(mode) {
    const prev = state.operatorBackupImportPreview
    if (!prev?.ok || !prev.bundle) return { ok: false, reason: 'no_preview' }
    let res
    try {
      res = importAssignmentBundle(prev.bundle, {
        entities: state.runtimeRegistry?.entities || [],
        nfcAssignments: state.nfcAssignments,
        packageKey: state.selectedPackage || '',
        mode,
      })
    } catch (e) {
      console.warn('SPEARHEAD_OPERATOR_IMPORT', 'commit_failed', String(e?.message || e))
      return { ok: false, errors: ['Import failed — file may be corrupted.'] }
    }
    if (!res.ok) {
      if (res.code === 'NEEDS_OVERWRITE') {
        updateState(
          {
            operatorBackupImportPreview: {
              ...prev,
              commitHint:
                res.message || 'Some rows conflict with current tags. Use Replace conflicting or cancel.',
            },
          },
          'backup import blocked merge'
        )
      }
      return res
    }
    updateState(
      {
        nfcAssignments: res.nfcAssignments,
        assignedTags: buildAssignedTagsMirror(res.nfcAssignments, state.runtimeRegistry?.entities || []),
        operatorBackupImportPreview: null,
      },
      `backup import committed (${mode})`
    )
    persistLauncherSession()
    return { ok: true, appliedCount: res.appliedCount }
  }

  function prepareNfcScan() {
    updateState({ nfcScanPhase: 'scanning', activeNfcConflict: null }, 'nfc scan preparing')
  }

  function retryNfcScan() {
    recordAction('NFC_SCAN_RETRY', '')
    updateState(
      {
        nfcScanPhase: 'waiting',
        lastAssignmentResult: null,
        nfcIdentityModal: null,
        activeNfcConflict: null,
        nfcUiHighlightEntityId: null,
        nfcPulseUnlinkedEntityId: null,
      },
      'nfc scan retry'
    )
  }

  function clearNfcAssignmentForUnit(unitId) {
    if (!unitId || !state.nfcAssignments[unitId]) return
    const uid = normalizeUid(state.nfcAssignments[unitId].uid)
    recordAction('ASSIGNMENT_CLEARED', `${unitId}:${uid || '(none)'}`)
    const { nfcAssignments: nextNfc, assignedTags: nextTags } = removeAssignmentForEntity(
      unitId,
      state.nfcAssignments,
      state.runtimeRegistry?.entities || []
    )
    updateState(
      {
        nfcAssignments: nextNfc,
        assignedTags: nextTags,
        lastAssignmentResult: null,
        nfcScanPhase: 'waiting',
        nfcIdentityModal: null,
        activeNfcConflict: null,
        nfcUiHighlightEntityId: null,
        nfcPulseUnlinkedEntityId: null,
        assignmentCommitLockUntil: 0,
      },
      `cleared nfc assignment for ${unitId}`
    )
  }

  function rebuildAssignedTagsFromNfcAfterPatch(nextNfc) {
    return buildAssignedTagsMirror(nextNfc, state.runtimeRegistry?.entities || [])
  }

  function updateHistoricalTagMap(prevMap, uid, entityId, entityName) {
    const next = { ...(prevMap || {}) }
    next[uid] = {
      uid,
      entityId,
      entityName: entityName || entityId,
      packageKey: state.selectedPackage || '',
      at: Date.now(),
    }
    return next
  }

  function isAdminLikeMode() {
    return state.adminMode === true || state.appMode === 'maintenance'
  }

  /**
   * Single NFC conflict entrypoint.
   * - Admin/Maintenance: bottom-sheet modal flow.
   * - Guided runtime: inline relink flow (no modal).
   * - Conflict is normalized and scoped to a single targetUnitId.
   */
  function handleNfcConflict(params) {
    const {
      tagId,
      requestedEntityId,
      requestedName,
      existingEntityId,
      existingName,
      existingPackageKey = '',
      recognizedFromHistory = false,
      canViewCurrent = true,
    } = params

    console.warn(
      'SPEARHEAD_ASSIGN_DIAG phase=nfc_conflict_enter tag=',
      tagId,
      'requestedEntityId=',
      requestedEntityId,
      'existingEntityId=',
      existingEntityId,
      'admin_modal=',
      isAdminLikeMode(),
      'recognizedFromHistory=',
      recognizedFromHistory
    )

    recordAction('PHYSICAL_TAG_RECOGNIZED', `${tagId}`)

    if (!isAdminLikeMode()) {
      recordAction('INLINE_RELINK_READY', `${tagId}:${existingEntityId}->${requestedEntityId}`)
      updateState(
        {
          lastNfcStubRead: tagId,
          nfcStatus: 'idle',
          nfcScanPhase: 'waiting',
          nfcIdentityModal: null,
          activeNfcConflict: {
            scannedTagId: tagId,
            sourceUnitId: existingEntityId || null,
            targetUnitId: requestedEntityId || null,
            timestamp: Date.now(),
            mode: 'inline-relink',
            sourceUnitName: existingName || existingEntityId || '',
            targetUnitName: requestedName || requestedEntityId || '',
            existingPackageKey,
            recognizedFromHistory,
            canViewCurrent,
          },
          nfcUiHighlightEntityId: canViewCurrent ? existingEntityId : null,
          lastAssignmentResult: {
            ok: false,
            reason: 'tag_recognized_inline',
            tagId,
            requestedEntityId,
            requestedUnitId: requestedEntityId,
            requestedUnitName: requestedName,
            existingEntityId,
            existingUnitName: existingName || existingEntityId || '',
            historical: recognizedFromHistory,
          },
          runtimeGateWarning: '',
        },
        `physical tag ${tagId} recognized — inline relink`
      )
      return
    }

    recordAction('IDENTITY_MODAL_OPEN', `${tagId}`)
    updateState(
      {
        lastNfcStubRead: tagId,
        nfcStatus: 'idle',
        nfcScanPhase: 'waiting',
        activeNfcConflict: null,
        nfcIdentityModal: {
          tagId,
          requestedEntityId,
          requestedName,
          existingEntityId,
          existingName: existingName || existingEntityId || '',
          existingPackageKey,
          recognizedFromHistory,
          canViewCurrent,
        },
        lastAssignmentResult: {
          ok: false,
          reason: 'tag_recognized_linked',
          tagId,
          requestedEntityId,
          requestedUnitId: requestedEntityId,
          requestedUnitName: requestedName,
          existingEntityId,
          existingUnitName: existingName || existingEntityId || '',
          historical: recognizedFromHistory,
        },
        runtimeGateWarning: '',
      },
      `physical tag ${tagId} recognized — modal relink`
    )
  }

  function skipToNextUnassignedUnit() {
    const n = getNextUnassignedEntity(state)
    if (n) {
      recordAction('SKIP_UNIT', n.entityId)
      selectAssignmentUnit(n.entityId)
      return
    }
    recordAction('SKIP_UNIT', 'none_remaining')
  }

  function attemptEnterRuntime() {
    if (!computeRuntimeReady(state)) {
      const msg = 'Pair NFC tags for every item that needs one before starting the table.'
      recordAction('RUNTIME_BLOCKED_INCOMPLETE', msg)
      const patch = { nfcScanPhase: 'waiting' }
      if (state.currentScreen === 'nfc-assignment' || state.currentScreen === 'roster-viewer') {
        patch.runtimeGateWarning = msg
      }
      updateState(patch, 'runtime blocked: incomplete nfc')
      return false
    }
    recordAction('RUNTIME_UNLOCKED', 'certification complete')
    updateState(
      {
        currentScreen: 'runtime',
        appMode: 'runtime',
        runtimeGateWarning: '',
        nfcScanPhase: 'waiting',
        activeNfcConflict: null,
      },
      'runtime unlocked — entering gameplay shell'
    )
    return true
  }

  function isAssignmentCommitLocked() {
    return Date.now() < (Number(state.assignmentCommitLockUntil) || 0)
  }

  /**
   * Hardware tag read → certification via centralized assignment service.
   */
  function applyStubTagAssignment(tagId) {
    const trimmed = String(tagId ?? '').trim()
    recordAction('SCANNED_TAG', trimmed || '(empty)')

    if (!trimmed) {
      recordAction('TAG_ASSIGN_FAILED', 'empty_uid')
      updateState(
        {
          lastNfcStubRead: '',
          nfcStatus: 'error',
          nfcScanPhase: 'unsupported_tag',
          lastAssignmentResult: {
            ok: false,
            reason: 'empty_uid',
            tagId: '',
          },
        },
        'nfc scan: empty / unsupported tag'
      )
      return
    }

    if (isAssignmentCommitLocked()) {
      const m = { ...(state.scanSessionMetrics || {}) }
      m.ignoredLockCount = (Number(m.ignoredLockCount) || 0) + 1
      m.lastScanAt = Date.now()
      updateState({ scanSessionMetrics: m }, 'assign ignored lock')
      return
    }

    const nuEarly = normalizeUid(trimmed)
    if (nuEarly) {
      const m = { ...(state.scanSessionMetrics || {}) }
      const dt = Date.now() - (Number(m.lastScanAt) || 0)
      if (nuEarly === m.lastUidNorm && dt < 150) {
        m.ignoredBounceCount = (Number(m.ignoredBounceCount) || 0) + 1
        m.lastScanAt = Date.now()
        updateState({ scanSessionMetrics: m }, 'assign ignored bounce')
        return
      }
    }

    const entityId = state.selectedEntityId
    if (!entityId) {
      recordAction('TAG_ASSIGN_FAILED', 'no_unit_selected')
      updateState(
        {
          lastNfcStubRead: trimmed,
          nfcStatus: 'error',
          nfcScanPhase: 'write_failure',
          lastAssignmentResult: {
            ok: false,
            reason: 'no_unit_selected',
            tagId: normalizeUid(trimmed) || trimmed,
          },
        },
        'assign failed: no entity selected'
      )
      return
    }

    const ctx = {
      selectedEntityId: state.selectedEntityId,
      entities: state.runtimeRegistry?.entities || [],
      nfcAssignments: state.nfcAssignments,
      assignedTags: state.assignedTags,
      nfcHistoricalTags: state.nfcHistoricalTags,
      recentAssignments: state.recentAssignments,
      recentMax: RECENT_ASSIGNMENTS_MAX,
      inlineTagConflict: state.appMode === 'nfc_assignment' && state.currentScreen === 'nfc-assignment',
    }

    const result = assignTagToEntity(
      {
        uid: trimmed,
        entityId,
        packageKey: state.selectedPackage || '',
        factionKey: state.operatorFactionKey || '',
        rosterId: state.selectedPackage || '',
      },
      ctx
    )

    if (result.applyLegacyConflict && result.conflictParams) {
      handleNfcConflict({
        ...result.conflictParams,
        tagId: result.conflictParams.tagId || normalizeUid(trimmed),
      })
      return
    }

    const patch = { ...(result.patch || {}) }
    if (result.applyHistorical) {
      const { uid, entityId: eid, entityName } = result.applyHistorical
      patch.nfcHistoricalTags = updateHistoricalTagMap(state.nfcHistoricalTags, uid, eid, entityName)
    }
    if (result.ok && result.lockMs) {
      patch.assignmentCommitLockUntil = assignmentCommitLockExpiry(result.lockMs)
    }

    if (Object.keys(patch).length) {
      const uidNorm = normalizeUid(trimmed)
      const label = result.ok
        ? result.idempotent
          ? `assign idempotent: ${uidNorm} -> ${entityId}`
          : `assigned tag ${uidNorm} -> ${entityId}`
        : 'assign rejected'
      if (result.ok) {
        const m = { ...(state.scanSessionMetrics || {}) }
        m.lastUidNorm = uidNorm || m.lastUidNorm
        m.lastScanAt = Date.now()
        patch.scanSessionMetrics = m
        recordAction(
          result.idempotent ? 'TAG_ASSIGN_IDEMPOTENT' : 'TAG_ASSIGN_SUCCESS',
          `${uidNorm}->${entityId}`
        )
        recordAction('ASSIGNMENT_SUCCESS', `${uidNorm}->${entityId}`)
      } else if (result.reason) {
        recordAction('TAG_ASSIGN_FAILED', result.reason)
      }
      updateState(patch, label)
    }
  }

  function dismissPhysicalTagConflict() {
    if (!state.nfcIdentityModal && !state.activeNfcConflict) return
    updateState(
      {
        nfcIdentityModal: null,
        activeNfcConflict: null,
        lastAssignmentResult: null,
        nfcScanPhase: 'waiting',
        nfcStatus: 'idle',
        nfcUiHighlightEntityId: null,
        nfcPulseUnlinkedEntityId: null,
      },
      'physical tag sheet dismissed'
    )
  }

  /**
   * Move a tag from its current runtime entity onto another (identity override).
   */
  function reassignPhysicalTagToEntity(tagId, targetEntityId) {
    const trimmed = String(tagId ?? '').trim()
    if (!trimmed || !targetEntityId) return false

    const nu = normalizeUid(trimmed)
    if (!nu) {
      dismissPhysicalTagConflict()
      return false
    }
    const entities = state.runtimeRegistry?.entities || []
    const lu = lookupAssignmentByUid(nu, state.assignedTags, entities)
    const fromId = lu.kind === 'found' ? lu.entityId : null
    if (!fromId) {
      dismissPhysicalTagConflict()
      return false
    }

    if (fromId === targetEntityId) {
      dismissPhysicalTagConflict()
      return true
    }

    const res = applyTagReassignmentToTarget({
      uid: nu,
      targetEntityId,
      nfcAssignments: state.nfcAssignments,
      entities,
      packageKey: state.selectedPackage || '',
      recentAssignments: state.recentAssignments,
      recentMax: RECENT_ASSIGNMENTS_MAX,
    })
    if (!res.ok) return false

    const idx = state.activeRoster?.units?.findIndex((u) => u.id === targetEntityId)
    const targetName =
      entities.find((e) => e.entityId === targetEntityId)?.display?.name ?? targetEntityId
    const fromName =
      lu.unitName ?? entities.find((e) => e.entityId === fromId)?.display?.name ?? fromId

    recordAction('PHYSICAL_TAG_REASSIGNED', `${nu}:${fromId}->${targetEntityId}`)
    recordAction('ASSIGNMENT_SUCCESS', `reassign:${nu}->${targetEntityId}`)

    updateState(
      {
        ...res.patch,
        nfcHistoricalTags: updateHistoricalTagMap(
          state.nfcHistoricalTags,
          nu,
          targetEntityId,
          targetName
        ),
        selectedEntity: targetEntityId,
        selectedEntityId: targetEntityId,
        selectedEntityName: targetName,
        selectedEntityIndex: idx ?? -1,
        lastAssignmentResult: {
          ...res.patch.lastAssignmentResult,
          transferFromEntityId: fromId,
          transferFromName: fromName,
        },
      },
      `physical tag reassigned ${nu} → ${targetEntityId}`
    )
    return true
  }

  function jumpToOwnedPhysicalPiece(existingEntityId) {
    const screenOk = state.currentScreen === 'nfc-assignment' || state.currentScreen === 'roster-viewer'
    if (!state.activeRoster?.units || !screenOk) return false
    const idx = state.activeRoster.units.findIndex((u) => u.id === existingEntityId)
    if (idx < 0) return false
    const u = state.activeRoster.units[idx]

    recordAction('JUMP_TO_LINKED_PIECE', existingEntityId)
    updateState(
      {
        nfcIdentityModal: null,
        activeNfcConflict: null,
        lastAssignmentResult: null,
        nfcUiHighlightEntityId: existingEntityId,
        selectedEntity: u.id,
        selectedEntityId: u.id,
        selectedEntityName: u.name,
        selectedEntityIndex: idx,
        nfcStatus: 'idle',
        nfcScanPhase: 'waiting',
        nfcPulseUnlinkedEntityId: null,
        runtimeGateWarning: '',
      },
      `focus linked piece ${u.name}`
    )
    return true
  }

  function relinkRecognizedTagInline() {
    const c = state.activeNfcConflict
    if (!c?.scannedTagId || !c?.targetUnitId) return false
    return reassignPhysicalTagToEntity(c.scannedTagId, c.targetUnitId)
  }

  function clearPhysicalUiPulses() {
    if (!state.nfcUiHighlightEntityId && !state.nfcPulseUnlinkedEntityId) return
    updateState({ nfcUiHighlightEntityId: null, nfcPulseUnlinkedEntityId: null }, 'nfc pulse highlights cleared')
  }

  /** Hard reset for ACTIVE SESSION linkage only (history is preserved). */
  function resetActiveNfcSessionLinks() {
    const nextEpoch = (Number(state.runtimeEpoch) || 0) + 1
    updateState(
      {
        assignedTags: {},
        nfcAssignments: {},
        recentAssignments: [],
        lastAssignmentResult: null,
        nfcStatus: 'idle',
        nfcScanPhase: 'waiting',
        nfcIdentityModal: null,
        activeNfcConflict: null,
        nfcUiHighlightEntityId: null,
        nfcPulseUnlinkedEntityId: null,
        runtimeEpoch: nextEpoch,
        runtimeActionSequence: 0,
      },
      'active nfc session links reset'
    )
    const lifecyclePatches = runRuntimeDomainLifecycle('reset', state, {
      runtimeEpoch: nextEpoch,
    })
    for (const item of lifecyclePatches) {
      if (item?.patch && typeof item.patch === 'object') {
        updateState(item.patch, `runtime domain reset: ${item.domain}`)
      }
    }
  }

  function setNfcRuntimeLookupMode(enabled) {
    const v = Boolean(enabled)
    if (state.nfcRuntimeLookupMode === v) return
    updateState({ nfcRuntimeLookupMode: v }, `nfc runtime lookup mode: ${v}`)
  }

  /**
   * Gameplay/runtime: resolve a scanned tag id against assignedTags → roster unit.
   * Does not mutate assignment data; only updates runtime resolution + history.
   */
  function resolveRuntimeTag(tagId) {
    recordAction('RUNTIME_TAG_LOOKUP', tagId)
    const at = Date.now()

    function pushHistory(entry) {
      const next = [...state.runtimeLookupHistory, entry].slice(-RUNTIME_LOOKUP_HISTORY_MAX)
      return next
    }

    if (!state.activeRoster || !Array.isArray(state.activeRoster.units)) {
      recordAction('RUNTIME_LOOKUP_FAILED', 'no_roster')
      const result = { ok: false, reason: 'no_roster', tagId, at }
      updateState(
        {
          runtimeResolvedTag: null,
          runtimeResolvedUnit: null,
          runtimeLastLookupResult: result,
          runtimeLookupHistory: pushHistory({ ...result }),
        },
        'runtime lookup failed: no roster'
      )
      return
    }

    const nu = normalizeUid(tagId)
    const lu = lookupAssignmentByUid(nu, state.assignedTags, state.runtimeRegistry?.entities || [])
    if (lu.kind !== 'found') {
      recordAction('RUNTIME_LOOKUP_FAILED', lu.kind === 'empty' ? 'empty_tag' : 'unknown_tag')
      const result = { ok: false, reason: lu.kind === 'empty' ? 'empty_tag' : 'unknown_tag', tagId: nu || tagId, at }
      updateState(
        {
          runtimeResolvedTag: null,
          runtimeResolvedUnit: null,
          runtimeLastLookupResult: result,
          runtimeLookupHistory: pushHistory({ ...result }),
        },
        'runtime lookup failed: tag not assigned'
      )
      return
    }

    const binding = {
      unitId: lu.entityId,
      entityId: lu.entityId,
      unitName: lu.unitName,
    }
    const unit = state.activeRoster.units.find((u) => u.id === binding.unitId)
    if (!unit) {
      recordAction('RUNTIME_LOOKUP_FAILED', 'unit_not_in_roster')
      const result = {
        ok: false,
        reason: 'unit_not_in_roster',
        tagId,
        boundUnitId: binding.unitId,
        at,
      }
      updateState(
        {
          runtimeResolvedTag: null,
          runtimeResolvedUnit: null,
          runtimeLastLookupResult: result,
          runtimeLookupHistory: pushHistory({ ...result }),
        },
        'runtime lookup failed: unit missing from roster'
      )
      return
    }

    const unitSnapshot = {
      id: unit.id,
      name: unit.name,
      wounds: Number(unit.wounds),
    }
    const prevRu = state.runtimeUnits[unit.id]
    const mergedRu = prevRu
      ? {
          ...prevRu,
          unitId: unit.id,
          name: unit.name,
          woundsMax: Number(unit.wounds),
          woundsCurrent:
            prevRu.woundsCurrent != null ? prevRu.woundsCurrent : Number(unit.wounds),
          lastResolvedTagId: tagId,
          lastResolvedAt: at,
          lastModifiedAt: at,
        }
      : {
          ...defaultRuntimeGameplayRecord(unit.id, unit.name, unit.wounds),
          lastResolvedTagId: tagId,
          lastResolvedAt: at,
          lastModifiedAt: at,
        }
    recordAction('RUNTIME_LOOKUP_OK', `${tagId}->${unit.id}`)
    const result = {
      ok: true,
      tagId,
      unitId: unit.id,
      unitName: unit.name,
      at,
    }
    updateState(
      {
        runtimeResolvedTag: tagId,
        runtimeResolvedUnit: unitSnapshot,
        runtimeLastLookupResult: result,
        runtimeLookupHistory: pushHistory({
          ok: true,
          tagId,
          unitId: unit.id,
          unitName: unit.name,
          at,
        }),
        runtimeUnits: {
          ...state.runtimeUnits,
          [unit.id]: mergedRu,
        },
      },
      `runtime resolved ${tagId} -> ${unit.id}`
    )
  }

  function bumpRuntimeSuspendEpoch() {
    const next = (Number(state.runtimeSuspendEpoch) || 0) + 1
    updateState({ runtimeSuspendEpoch: next }, 'runtime background epoch')
  }

  function bumpRuntimeEpoch(reason = 'runtime_epoch_bump') {
    const next = (Number(state.runtimeEpoch) || 0) + 1
    updateState({ runtimeEpoch: next, runtimeActionSequence: 0 }, reason)
  }

  function verifyRuntimeResumeContext() {
    const lifecyclePatches = runRuntimeDomainLifecycle('resume', state, {
      runtimeEpoch: state.runtimeEpoch,
    })
    for (const item of lifecyclePatches) {
      if (item?.patch && typeof item.patch === 'object') {
        updateState(item.patch, `runtime domain resume: ${item.domain}`)
      }
    }
    const audit = auditRuntimeInvariants(state)
    console.warn('SPEARHEAD_RUNTIME_RESUME', {
      epoch: state.runtimeSuspendEpoch,
      screen: state.currentScreen,
      appMode: state.appMode,
      packageKey: state.selectedPackage,
      warnings: audit.warnings,
      critical: audit.criticalCount,
    })
    if (audit.issues.length) {
      journalInvariantWarnings(audit.issues.length)
      for (const issue of audit.issues) {
        const w = issue.message
        console.warn('SPEARHEAD_RUNTIME_INVARIANT', w)
      }
      if (audit.criticalCount > 0) {
        updateState(
          {
            runtimeTransitionFrozen: true,
            runtimeCriticalAlertCount: (Number(state.runtimeCriticalAlertCount) || 0) + 1,
          },
          'resume critical invariant freeze'
        )
      }
    }
  }

  function suspendRuntimeDomains() {
    const lifecyclePatches = runRuntimeDomainLifecycle('suspend', state, {
      runtimeEpoch: state.runtimeEpoch,
    })
    for (const item of lifecyclePatches) {
      if (item?.patch && typeof item.patch === 'object') {
        updateState(item.patch, `runtime domain suspend: ${item.domain}`)
      }
    }
  }

  function attemptRuntimeRecoveryHook({ reason, action, runtimeEpoch } = {}) {
    const recovery = attemptRuntimeRecovery({ reason, action, runtimeEpoch })
    if (!recovery?.patch) return false
    updateState(
      {
        ...recovery.patch,
        runtimeTransitionFrozen:
          recovery.freezeTransitions === true ? true : state.runtimeTransitionFrozen,
      },
      recovery.label || 'runtime recovery hook'
    )
    return true
  }

  /**
   * Single entry for gameplay-affecting runtime transitions from normalized scan actions.
   * @returns {{ handled: boolean, outcome: 'resolved'|'rejected'|'failed' }}
   */
  function dispatchRuntimeAction(action, meta = {}) {
    if (state.runtimeTransitionFrozen) {
      journalRuntimeTransition({
        action,
        outcome: 'rejected',
        reason: 'runtime_frozen',
        replayed: Boolean(meta?.replayed),
        replaySessionId: meta?.replaySessionId,
        originatedFromSuspendResume: Boolean(meta?.originatedFromSuspendResume),
      })
      return { handled: true, outcome: 'rejected', reason: 'runtime_frozen' }
    }
    const normalizedAction = {
      ...action,
      runtimeEpoch:
        action?.runtimeEpoch != null ? Number(action.runtimeEpoch) : Number(state.runtimeEpoch || 0),
      actionSequence:
        action?.actionSequence != null
          ? Number(action.actionSequence)
          : Number(state.runtimeActionSequence || 0) + 1,
    }
    devAssertSerializableOrWarn(normalizedAction, 'runtime_action')
    const domain = resolveRuntimeDomain(normalizedAction.type)
    if (!domain) {
      console.warn(
        'SPEARHEAD_RUNTIME_TRANSITION rejected',
        'unsupported_action',
        normalizedAction?.type,
        normalizedAction?.transactionId
      )
      journalRuntimeTransition({
        action: normalizedAction,
        outcome: 'rejected',
        reason: 'unsupported_action',
        replayed: Boolean(meta?.replayed),
        replaySessionId: meta?.replaySessionId,
        originatedFromSuspendResume: Boolean(meta?.originatedFromSuspendResume),
      })
      return { handled: true, outcome: 'rejected', reason: 'unsupported_action' }
    }

    const guard = assertRuntimeTransition(state, normalizedAction)
    if (guard.ok) {
      const domainGuard = domain.guard(state, normalizedAction)
      if (!domainGuard.ok) {
        console.warn(
          'SPEARHEAD_RUNTIME_TRANSITION rejected',
          domainGuard.reason,
          normalizedAction?.type,
          normalizedAction?.transactionId
        )
        journalRuntimeTransition({
          action: normalizedAction,
          outcome: 'rejected',
          reason: domainGuard.reason,
          replayed: Boolean(meta?.replayed),
          replaySessionId: meta?.replaySessionId,
          originatedFromSuspendResume: Boolean(meta?.originatedFromSuspendResume),
        })
        return { handled: true, outcome: 'rejected', reason: domainGuard.reason }
      }
    }
    if (!guard.ok) {
      console.warn(
        'SPEARHEAD_RUNTIME_TRANSITION rejected',
        guard.reason,
        normalizedAction?.type,
        normalizedAction?.transactionId
      )
      journalRuntimeTransition({
        action: normalizedAction,
        outcome: 'rejected',
        reason: guard.reason,
        replayed: Boolean(meta?.replayed),
        replaySessionId: meta?.replaySessionId,
        originatedFromSuspendResume: Boolean(meta?.originatedFromSuspendResume),
      })
      if (guard.reason === 'stale_epoch_rejected') {
        console.warn('SPEARHEAD_RUNTIME_TRANSITION stale_epoch_rejected', {
          actionEpoch: normalizedAction.runtimeEpoch,
          currentEpoch: state.runtimeEpoch,
          tx: normalizedAction.transactionId,
        })
      }
      return { handled: true, outcome: 'rejected', reason: guard.reason }
    }
    try {
      const tStart = performance.now()
      const prevState = getState()
      const transitionResult = domain.transition(prevState, normalizedAction)
      const shapeCode = validateRuntimeTransitionResultShape(transitionResult)
      if (shapeCode) {
        console.error('SPEARHEAD_RUNTIME_TRANSITION shape_invalid', shapeCode, {
          type: normalizedAction?.type,
          tx: normalizedAction?.transactionId,
        })
        journalRuntimeEvent('invalid_transition_shape', {
          code: shapeCode,
          actionType: normalizedAction?.type,
          transactionId: normalizedAction?.transactionId,
        })
        journalRuntimeTransition({
          action: normalizedAction,
          outcome: 'failed',
          reason: `invalid_transition_shape:${shapeCode}`,
          replayed: Boolean(meta?.replayed),
          replaySessionId: meta?.replaySessionId,
          originatedFromSuspendResume: Boolean(meta?.originatedFromSuspendResume),
        })
        return { handled: true, outcome: 'failed', reason: `invalid_transition_shape:${shapeCode}` }
      }
      maybeDevDeepFreezeTransitionArtifacts(transitionResult)
      if (transitionResult.patch) devAssertSerializableOrWarn(transitionResult.patch, 'transition_patch')
      if (transitionResult.effects) devAssertSerializableOrWarn(transitionResult.effects, 'transition_effects')
      runRuntimePurityChecks(domain.name, domain.transition, prevState, normalizedAction, transitionResult)

      if (!transitionResult?.handled) {
        console.warn(
          'SPEARHEAD_RUNTIME_TRANSITION rejected',
          'handler_missing',
          normalizedAction?.type,
          normalizedAction?.transactionId
        )
        journalRuntimeTransition({
          action: normalizedAction,
          outcome: 'rejected',
          reason: 'handler_missing',
          replayed: Boolean(meta?.replayed),
          replaySessionId: meta?.replaySessionId,
          originatedFromSuspendResume: Boolean(meta?.originatedFromSuspendResume),
        })
        return { handled: true, outcome: 'rejected', reason: 'handler_missing' }
      }

      journalRuntimeEvent('dispatch_phase', {
        phase: 'transition',
        actionType: normalizedAction.type,
        transactionId: normalizedAction.transactionId,
      })

      activeDispatchJournalMeta = {
        actionType: normalizedAction.type,
        transactionId: normalizedAction.transactionId,
      }
      try {
        if (Array.isArray(transitionResult.recordActions)) {
          for (const ra of transitionResult.recordActions) {
            recordAction(ra.type, ra.value ?? '')
          }
        }
        if (transitionResult.patch) {
          updateState(transitionResult.patch, transitionResult.actionLabel || `runtime action ${normalizedAction.type}`)
        }
        if (Array.isArray(transitionResult.effects) && transitionResult.effects.length > 0) {
          journalRuntimeEvent('dispatch_phase', {
            phase: 'effects',
            actionType: activeDispatchJournalMeta.actionType,
            transactionId: activeDispatchJournalMeta.transactionId,
            effectCount: transitionResult.effects.length,
          })
          try {
            scheduleRuntimeEffects(transitionResult.effects, {
              replayed: Boolean(meta?.replayed),
              action: normalizedAction,
              silent: Boolean(meta?.silentEffects),
            })
          } catch (effErr) {
            console.error('SPEARHEAD_RUNTIME_EFFECT_SCHEDULE_ERROR', effErr)
            const tx = String(normalizedAction.transactionId || '')
            if (tx) {
              const n = (effectScheduleFailureByTx.get(tx) || 0) + 1
              effectScheduleFailureByTx.set(tx, n)
              if (n >= 3) {
                journalRuntimeEvent('watchdog_effect_retry_loop', {
                  transactionId: tx,
                  failures: n,
                  actionType: normalizedAction.type,
                })
              }
            }
            journalRuntimeEvent('effect_schedule_error', {
              message: String(effErr?.message || effErr),
              stack: effErr instanceof Error ? effErr.stack : undefined,
              actionType: activeDispatchJournalMeta.actionType,
              transactionId: activeDispatchJournalMeta.transactionId,
            })
          }
        }
      } finally {
        activeDispatchJournalMeta = null
      }
      const tInvariant0 = performance.now()
      const domainWarnings = domain.invariants(state) || []
      if (domainWarnings.length) {
        const critical = domainWarnings.filter((w) => typeof w === 'object' && w.severity === 'critical')
        const warningMsgs = domainWarnings.map((w) => (typeof w === 'string' ? w : w.message))
        journalInvariantWarnings(warningMsgs.length)
        for (const w of warningMsgs) {
          console.warn('SPEARHEAD_RUNTIME_INVARIANT', w)
        }
        if (critical.length) {
          const recovery = attemptRuntimeRecovery({
            reason: critical[0].message,
            action: normalizedAction,
            runtimeEpoch: state.runtimeEpoch,
          })
          if (recovery?.patch) {
            updateState(
              {
                ...recovery.patch,
                runtimeTransitionFrozen: Boolean(recovery.freezeTransitions),
                runtimeCriticalAlertCount: (Number(state.runtimeCriticalAlertCount) || 0) + 1,
              },
              recovery.label || 'runtime critical recovery'
            )
          }
        }
      }
      const audit = auditRuntimeInvariants(state)
      if (audit.issues.length) {
        journalInvariantWarnings(audit.issues.length)
        for (const issue of audit.issues) {
          const w = issue.message
          console.warn('SPEARHEAD_RUNTIME_INVARIANT', w)
        }
        if (audit.criticalCount > 0) {
          const recovery = attemptRuntimeRecovery({
            reason: audit.issues.find((i) => i.severity === 'critical')?.message || 'critical_invariant',
            action: normalizedAction,
            runtimeEpoch: state.runtimeEpoch,
          })
          if (recovery?.patch) {
            updateState(
              {
                ...recovery.patch,
                runtimeTransitionFrozen: Boolean(recovery.freezeTransitions),
                runtimeCriticalAlertCount: (Number(state.runtimeCriticalAlertCount) || 0) + 1,
              },
              recovery.label || 'runtime critical recovery'
            )
          }
        }
      }
      const invariantMs = performance.now() - tInvariant0
      const stateHash = hashRuntimeStateShape(state)
      pushRuntimeSnapshot(state, normalizedAction)
      const outcome = transitionResult.outcome || 'resolved'
      journalRuntimeTransition({
        action: normalizedAction,
        outcome,
        reason: transitionResult.reason,
        stateHash,
        replayed: Boolean(meta?.replayed),
        replaySessionId: meta?.replaySessionId,
        originatedFromSuspendResume: Boolean(meta?.originatedFromSuspendResume),
      })
      appendRuntimeReplayActionLog({
        type: normalizedAction.type,
        transactionId: normalizedAction.transactionId,
        actionSequence: normalizedAction.actionSequence,
        runtimeEpoch: normalizedAction.runtimeEpoch,
        uid: normalizedAction.uid,
        outcome,
        reason: transitionResult.reason,
        stateHash,
        replayed: Boolean(meta?.replayed),
      })
      recordTransitionPerf(performance.now() - tStart, normalizedAction)
      if (invariantMs > 12) {
        console.warn('SPEARHEAD_RUNTIME_PERF slow_transition', {
          phase: 'invariants',
          ms: Math.round(invariantMs),
          type: normalizedAction.type,
        })
      }
      if (outcome !== 'resolved') {
        return { handled: true, outcome, reason: transitionResult.reason }
      }
      console.warn(
        'SPEARHEAD_RUNTIME_ACTION committed',
        `type=${normalizedAction.type} tx=${normalizedAction.transactionId} uid=${normalizedAction.uid}`
      )
      return { handled: true, outcome: 'resolved' }
    } catch (err) {
      activeDispatchJournalMeta = null
      console.error('SPEARHEAD_RUNTIME_TRANSITION failed', err)
      journalRuntimeTransition({
        action: normalizedAction,
        outcome: 'failed',
        reason: String(err?.message || err),
        replayed: Boolean(meta?.replayed),
        replaySessionId: meta?.replaySessionId,
        originatedFromSuspendResume: Boolean(meta?.originatedFromSuspendResume),
      })
      const recovery = attemptRuntimeRecovery({
        reason: 'failed_transition',
        action: normalizedAction,
        runtimeEpoch: state.runtimeEpoch,
      })
      if (recovery?.patch) {
        updateState(recovery.patch, recovery.label || 'runtime failed recovery')
      }
      return { handled: true, outcome: 'failed', reason: String(err?.message || err) }
    }
  }

  function dispatchRuntimeActionBatch(actions, meta = {}) {
    const list = Array.isArray(actions) ? actions : []
    const results = []
    beginBatch()
    try {
      for (const action of list) {
        results.push(dispatchRuntimeAction(action, meta))
      }
    } finally {
      endBatch()
    }
    return results
  }

  function packageSemanticIdCandidates(packageKey) {
    const key = String(packageKey || '').trim()
    if (!key) return []
    const out = [key]
    // Bridge current launcher ids to manifest-style package ids.
    const aliasMap = {
      'demo-aos-stormhost': 'aos_stormcast',
    }
    const alias = aliasMap[key]
    if (alias && !out.includes(alias)) out.push(alias)
    return out
  }

  async function loadPackageSemanticDefinitionForKey(packageKey) {
    const candidates = packageSemanticIdCandidates(packageKey)
    if (!candidates.length) {
      updateState(
        {
          packageRuntimeDefinition: null,
          packageRuntimeLoadStatus: 'missing',
          packageRuntimeLoadError: 'no_package_id',
        },
        'package runtime definition missing id'
      )
      return
    }

    updateState(
      {
        packageRuntimeLoadStatus: 'loading',
        packageRuntimeLoadError: '',
      },
      `package runtime definition loading: ${candidates[0]}`
    )

    for (const id of candidates) {
      const res = await loadPackageRuntimeDefinition(id)
      if (res.ok && res.packageDefinition) {
        updateState(
          {
            packageRuntimeDefinition: res.packageDefinition,
            packageRuntimeLoadStatus: 'ready',
            packageRuntimeLoadError: '',
          },
          `package runtime definition loaded: ${id}`
        )
        return
      }
    }

    updateState(
      {
        packageRuntimeDefinition: null,
        packageRuntimeLoadStatus: 'missing',
        packageRuntimeLoadError: `not_found:${candidates.join(',')}`,
      },
      `package runtime definition not found: ${candidates[0]}`
    )
  }

  function resolvePackageSemanticMapping(uid) {
    return resolveSemanticMappingFromPackageDefinition(state.packageRuntimeDefinition, uid)
  }

  function resolveQuickStartThemeId(packageKey) {
    const entry = getPackageEntry(packageKey)
    const sid = entry?.suggestedTheme
    const ids = listThemeIds()
    if (sid && ids.includes(sid)) return sid
    return 'default-dark'
  }

  /** Seeds the on-table battle log via gameplay domain actions (timeline), not UI-only hacks. */
  function seedQuickStartBattleLogFromGameplayActions() {
    const epoch = Number(state.runtimeEpoch) || 0
    const seq = Number(state.runtimeActionSequence) || 0
    const now = Date.now()
    dispatchRuntimeActionBatch([
      {
        ...createGameplayAction(GAMEPLAY_ACTION_TYPES.ROUND_ADVANCED, {
          transactionId: `gp_qs_${epoch}_${seq + 1}`,
          payload: { round: 1 },
        }),
        runtimeEpoch: epoch,
        actionSequence: seq + 1,
        receivedAt: now,
      },
      {
        ...createGameplayAction(GAMEPLAY_ACTION_TYPES.PHASE_CHANGED, {
          transactionId: `gp_qs_${epoch}_${seq + 2}`,
          payload: { phase: 'command' },
        }),
        runtimeEpoch: epoch,
        actionSequence: seq + 2,
        receivedAt: now,
      },
    ])
  }

  function selectLauncherGroup(groupKey) {
    const key = String(groupKey || '').trim()
    console.debug('[flow] selection changed', { type: 'launcherGroup', value: key })
    recordAction('SELECT_LAUNCHER_GROUP', key)
    updateState(
      {
        selectedLauncherGroupKey: key,
        packageFactionFilter: '',
        selectedFaction: '',
        selectedPackage: '',
        activeRoster: null,
        selectedEntity: '',
        selectedEntityId: null,
        selectedEntityName: null,
        selectedEntityIndex: null,
        activeThemeId: 'default-dark',
        ...assignmentStorageReset(),
        currentScreen: 'package-selection',
      },
      `selected launcher group: ${key || '(all)'}`
    )
  }

  function browseAllPackages() {
    recordAction('BROWSE_ALL_PACKAGES', '')
    updateState(
      {
        selectedLauncherGroupKey: '',
        packageFactionFilter: '',
        currentScreen: 'package-selection',
      },
      'browse all packages'
    )
  }

  function setPackageFactionFilter(value) {
    const v = String(value || '').trim()
    updateState({ packageFactionFilter: v }, `package faction filter: ${v || '(none)'}`)
  }

  function selectFaction(factionName) {
    console.debug('[flow] selection changed', { type: 'faction', value: factionName })
    recordAction('SELECT_FACTION', factionName)
    updateState(
      {
        selectedFaction: factionName,
        selectedPackage: '',
        activeRoster: null,
        selectedEntity: '',
        selectedEntityId: null,
        selectedEntityName: null,
        selectedEntityIndex: null,
        ...assignmentStorageReset(),
        currentScreen: 'package-selection',
      },
      `selected faction: ${factionName}`
    )
  }

  function selectOperatorGame(gameId) {
    const g = getOperatorGame(gameId)
    if (!g) return
    recordAction('OPERATOR_GAME', gameId)
    updateState(
      {
        operatorGameId: gameId,
        operatorFactionKey: '',
        operatorImportError: '',
        currentScreen: 'operator-faction',
        appMode: 'operator',
        selectedPackage: '',
        activeRoster: null,
        runtimeRegistry: null,
        selectedEntity: '',
        selectedEntityId: null,
        selectedEntityName: null,
        selectedEntityIndex: null,
        ...assignmentStorageReset(),
      },
      `operator game ${gameId}`
    )
  }

  function selectOperatorFaction(factionKey) {
    const g = getOperatorGame(state.operatorGameId)
    if (!g?.factions?.some((f) => f.key === factionKey)) return
    recordAction('OPERATOR_FACTION', factionKey)
    updateState(
      {
        operatorFactionKey: factionKey,
        operatorImportError: '',
        currentScreen: 'roster-import',
        appMode: 'operator',
      },
      `operator faction ${factionKey}`
    )
  }

  function importOperatorRosterFromText(text, listName = '') {
    let rows
    try {
      rows = normalizeOperatorRosterRows(JSON.parse(String(text || '').trim()))
    } catch (_e) {
      updateState(
        { operatorImportError: 'Invalid JSON. Expected an array of { instanceId, name, models }.' },
        'operator import parse'
      )
      return false
    }
    const g = getOperatorGame(state.operatorGameId)
    const fk = String(state.operatorFactionKey || '').trim()
    if (!g || !fk) {
      updateState({ operatorImportError: 'Choose a game and faction before importing.' }, 'operator import blocked')
      return false
    }
    const packageKey = makeOperatorPackageKey(g.id, fk)
    const ln = String(listName || '').trim() || 'Imported roster'
    const registry = buildOperatorRuntimeRegistry(rows, { listName: ln, systemId: g.systemId })
    const roster = activeRosterShapeFromRegistry(registry)
    const nextEpoch = (Number(state.runtimeEpoch) || 0) + 1
    updateState(
      {
        selectedPackage: packageKey,
        operatorGameId: g.id,
        operatorFactionKey: fk,
        operatorImportError: '',
        selectedLauncherGroupKey:
          g.systemId === 'aos' ? 'aos' : g.systemId === 'warhammer40k' ? 'warhammer40k' : 'skirmish',
        selectedEntity: '',
        selectedEntityId: null,
        selectedEntityName: null,
        selectedEntityIndex: null,
        ...assignmentStorageReset(),
        packageRuntimeDefinition: null,
        packageRuntimeLoadStatus: 'missing',
        packageRuntimeLoadError: 'operator_session',
        runtimeRegistry: registry,
        activeRoster: roster,
        runtimeUnits: buildRuntimeUnitsFromRegistry(registry),
        packageBrowseNfcEntityCount: registry.entities.length,
        runtimeEpoch: nextEpoch,
        runtimeActionSequence: 0,
        gameplay: createInitialGameplayState(),
        currentScreen: 'operator-overview',
        appMode: 'operator',
        operatorRosterImportedAt: Date.now(),
        operatorHydrationWarning: '',
        operatorPendingClear: false,
        operatorValidationResult: null,
        operatorUxPulse: null,
        operatorBackupImportPreview: null,
        scanSessionMetrics: {
          lastUidNorm: '',
          lastScanAt: 0,
          ignoredLockCount: 0,
          ignoredBounceCount: 0,
          resumeNotifyCount: 0,
          lastValidationUid: '',
          lastValidationAt: 0,
          validationBounceCount: 0,
        },
      },
      'operator roster imported'
    )
    const lifecyclePatches = runRuntimeDomainLifecycle('initialize', state, {
      runtimeEpoch: nextEpoch,
      packageKey,
    })
    for (const item of lifecyclePatches) {
      if (item?.patch && typeof item.patch === 'object') {
        updateState(item.patch, `runtime domain init: ${item.domain}`)
      }
    }
    persistLauncherSession()
    return true
  }

  function clearOperatorImportError() {
    if (!state.operatorImportError) return
    updateState({ operatorImportError: '' }, 'clear operator import error')
  }

  function persistLauncherSession() {
    if (!state.selectedPackage) return
    saveSessionSnapshot({
      launcherGroupKey: state.selectedLauncherGroupKey,
      packageKey: state.selectedPackage,
      themeId: state.activeThemeId,
      nfcBundle: {
        nfcAssignments: state.nfcAssignments,
        assignedTags: state.assignedTags,
        nfcHistoricalTags: state.nfcHistoricalTags,
        runtimeUnits: state.runtimeUnits,
        recentAssignments: state.recentAssignments,
      },
      ...(String(state.selectedPackage || '').startsWith('operator:')
        ? {
            operatorGameId: state.operatorGameId,
            operatorFactionKey: state.operatorFactionKey,
            lastOperatorScreen: state.currentScreen,
            embeddedOperatorRegistry: state.runtimeRegistry ? cloneRuntimeRegistry(state.runtimeRegistry) : null,
          }
        : {}),
    })
    console.debug('SPEARHEAD_PERSIST snapshot_save package=', state.selectedPackage)
  }

  /**
   * After pipeline success — shared by built-in fetch + JSON import.
   * Next step is usually theme selection (cosmetic) before roster review.
   * @param {{ quickStartRuntime?: boolean }} [opts] When true with nextScreen `runtime`, applies suggested theme and enters match mode.
   */
  function commitPackageResult(result, packageKey, nextScreen = 'theme-selection', opts = {}) {
    const quickRt = Boolean(opts.quickStartRuntime) && nextScreen === 'runtime'

    const roster = activeRosterShapeFromRegistry(result.runtimeRegistry)
    const nextEpoch = (Number(state.runtimeEpoch) || 0) + 1
    recordAction('LOAD_ROSTER', roster?.name || '')
    console.debug('[flow] runtime registry hydrated', result.runtimeRegistry.metadata)

    const entry = getPackageEntry(packageKey)
    const inferredGroup = mapAdapterSystemIdToLauncherGroup(
      result.runtimeRegistry?.metadata?.systemId
    )
    const nextGroup =
      entry?.launcherGroupKey ||
      inferredGroup ||
      state.selectedLauncherGroupKey ||
      'rpg'

    updateState(
      {
        selectedLauncherGroupKey: nextGroup,
        selectedPackage: packageKey,
        selectedEntity: '',
        selectedEntityId: null,
        selectedEntityName: null,
        selectedEntityIndex: null,
        ...assignmentStorageReset(),
        packageRuntimeDefinition: state.packageRuntimeDefinition,
        packageRuntimeLoadStatus: state.packageRuntimeLoadStatus,
        packageRuntimeLoadError: state.packageRuntimeLoadError,
        runtimeRegistry: result.runtimeRegistry,
        activeRoster: roster,
        runtimeUnits: buildRuntimeUnitsFromRegistry(result.runtimeRegistry),
        packageBrowseNfcEntityCount: Array.isArray(result.runtimeRegistry?.entities)
          ? result.runtimeRegistry.entities.length
          : 0,
        runtimeEpoch: nextEpoch,
        runtimeActionSequence: 0,
        activeThemeId:
          nextScreen === 'theme-selection'
            ? 'default-dark'
            : quickRt
              ? resolveQuickStartThemeId(packageKey)
              : state.activeThemeId,
        currentScreen: nextScreen,
        appMode: nextScreen === 'runtime' ? 'runtime' : state.appMode,
        runtimeGateWarning: nextScreen === 'runtime' ? '' : state.runtimeGateWarning,
        ...(quickRt ? { runtimePrepareOverlay: false, battlefieldRevealPulse: true } : {}),
      },
      `loaded list: ${roster?.name}`
    )
    const lifecyclePatches = runRuntimeDomainLifecycle('initialize', state, {
      runtimeEpoch: nextEpoch,
      packageKey,
    })
    for (const item of lifecyclePatches) {
      if (item?.patch && typeof item.patch === 'object') {
        updateState(item.patch, `runtime domain init: ${item.domain}`)
      }
    }
    rememberPackageLoad(packageKey, roster?.name || packageKey)
  }

  /**
   * Built-in list key → fetch JSON → system adapter → runtime registry → derived roster UI shape.
   */
  async function selectPackage(packageName) {
    const entry = getPackageEntry(packageName)
    const quickStart = isQuickStartPackageEntry(entry)

    const abortQuickPrepare = () => {
      if (quickStart) updateState({ runtimePrepareOverlay: false }, 'quick-start prepare aborted')
    }

    if (quickStart) {
      updateState({ runtimePrepareOverlay: true }, 'quick-start preparing')
    }

    console.debug('[flow] selection changed', { type: 'package', value: packageName })
    recordAction('SELECT_PACKAGE', packageName)

    let raw
    try {
      raw = await fetchBuiltInPackageJson(packageName)
    } catch (err) {
      abortQuickPrepare()
      throw err
    }

    if (!raw) {
      abortQuickPrepare()
      console.error('[flow] package fetch failed', packageName)
      recordAction('LOAD_ROSTER_FAILED', packageName)
      updateState({}, `package fetch failed: ${packageName}`)
      return
    }

    const result = processRawPackageJson(raw, { sourceLabel: packageName })
    if (!result.ok || !result.runtimeRegistry) {
      abortQuickPrepare()
      recordAction('LOAD_ROSTER_FAILED', packageName)
      updateState({}, `package pipeline failed: ${packageName}`)
      return
    }

    await loadPackageSemanticDefinitionForKey(packageName)

    const nextScreen = quickStart ? 'runtime' : 'theme-selection'
    commitPackageResult(result, packageName, nextScreen, { quickStartRuntime: quickStart })

    if (quickStart) {
      persistLauncherSession()
      seedQuickStartBattleLogFromGameplayActions()
      globalThis.setTimeout(() => {
        updateState({ battlefieldRevealPulse: false }, 'battlefield reveal pulse end')
      }, 520)
    }
  }

  /** User-imported JSON — same pipeline as built-ins */
  function importPackageFromJson(raw, sourceLabel = 'Imported list') {
    const result = processRawPackageJson(raw, { sourceLabel })
    if (!result.ok || !result.runtimeRegistry) {
      recordAction('IMPORT_LIST_FAILED', sourceLabel)
      updateState({}, `import failed: ${result.error || 'unknown'}`)
      return false
    }
    recordAction('IMPORT_LIST_OK', sourceLabel)
    registerImportedPackageFromRuntime(sourceLabel, result.runtimeRegistry)
    updateState(
      {
        packageRuntimeDefinition: null,
        packageRuntimeLoadStatus: 'missing',
        packageRuntimeLoadError: 'imported_package_no_manifest',
      },
      'import package runtime definition reset'
    )
    commitPackageResult(result, sourceLabel, 'theme-selection')
    return true
  }

  function setLauncherTheme(themeId) {
    const id = String(themeId || '').trim()
    if (!listThemeIds().includes(id)) return
    updateState({ activeThemeId: id }, 'launcher theme')
  }

  function continueToRosterFromTheme() {
    if (!state.activeRoster) return
    recordAction('VIEW_ROSTER', state.activeRoster.name || '')
    updateState({ currentScreen: 'roster-viewer' }, 'theme chosen → roster')
    persistLauncherSession()
  }

  function skipThemeDefault() {
    if (!state.activeRoster) return
    recordAction('VIEW_ROSTER', state.activeRoster.name || '')
    updateState(
      { activeThemeId: 'default-dark', currentScreen: 'roster-viewer' },
      'skip theme → roster'
    )
    persistLauncherSession()
  }

  function bootstrapDemoMatch() {
    const reg = buildDemoRuntimeRegistry()
    const roster = activeRosterShapeFromRegistry(reg)
    const freshUnits = buildRuntimeUnitsFromRegistry(reg)
    const nextEpoch = (Number(state.runtimeEpoch) || 0) + 1
    recordAction('BOOTSTRAP_DEMO_MATCH', DEMO_SCENARIO_PRESETS.demo_quick_skirmish)
    updateState(
      {
        runtimeEpoch: nextEpoch,
        runtimeActionSequence: 0,
        selectedPackage: 'demo-quick-skirmish',
        runtimeRegistry: reg,
        activeRoster: roster,
        runtimeUnits: freshUnits,
        currentScreen: 'runtime',
        appMode: 'runtime',
        gameplay: createInitialGameplayState(),
        runtimeGateWarning: '',
        nfcScanPhase: 'waiting',
        activeNfcConflict: null,
        packageBrowseNfcEntityCount: reg.entities.length,
      },
      'bootstrap demo match — roster'
    )
    dispatchRuntimeAction({
      ...createGameplayAction(GAMEPLAY_ACTION_TYPES.SCENARIO_APPLIED, {
        transactionId: `gp_scen_${state.runtimeActionSequence}`,
        payload: { preset: DEMO_SCENARIO_PRESETS.demo_quick_skirmish },
      }),
      runtimeEpoch: state.runtimeEpoch,
      actionSequence: state.runtimeActionSequence + 1,
      receivedAt: Date.now(),
    })
  }

  async function resumeLastSession(options = {}) {
    const enterTable = Boolean(options.enterTable)
    const snap = loadSessionSnapshot()
    if (!snap?.packageKey) return false

    const operatorSession = String(snap.packageKey || '').startsWith('operator:')
    let result
    if (operatorSession && snap.embeddedOperatorRegistry?.entities?.length) {
      result = { ok: true, runtimeRegistry: cloneRuntimeRegistry(snap.embeddedOperatorRegistry) }
    } else {
      const raw = await fetchBuiltInPackageJson(snap.packageKey)
      if (!raw) {
        recordAction('RESUME_SESSION_FAILED', snap.packageKey)
        return false
      }
      result = processRawPackageJson(raw, { sourceLabel: snap.packageKey })
      if (!result.ok || !result.runtimeRegistry) {
        recordAction('RESUME_SESSION_FAILED', snap.packageKey)
        return false
      }
    }

    const themeId = listThemeIds().includes(snap.themeId) ? snap.themeId : 'default-dark'
    const roster = activeRosterShapeFromRegistry(result.runtimeRegistry)
    const freshUnits = buildRuntimeUnitsFromRegistry(result.runtimeRegistry)
    const restoredUnits =
      snap.nfcBundle?.runtimeUnits && typeof snap.nfcBundle.runtimeUnits === 'object'
        ? mergeRuntimeUnitsRestored(freshUnits, snap.nfcBundle.runtimeUnits)
        : freshUnits
    recordAction('LOAD_ROSTER', roster?.name || '')
    recordAction('RESUME_SESSION', snap.packageKey)

    const normalizedLast = normalizeOperatorResumeScreen(snap.lastOperatorScreen)
    const operatorResumeScreen = operatorSession && !enterTable ? normalizedLast : null
    const operatorResumeMode =
      operatorResumeScreen === 'nfc-assignment'
        ? 'nfc_assignment'
        : operatorSession && operatorResumeScreen
          ? 'operator'
          : null

    if (snap.nfcBundle) {
      const nextEpoch = (Number(state.runtimeEpoch) || 0) + 1
      const entitiesForSan = result.runtimeRegistry?.entities || []
      const cleaned =
        entitiesForSan.length > 0
          ? sanitizePersistedNfcBundle(
              {
                nfcAssignments: snap.nfcBundle.nfcAssignments,
                assignedTags: snap.nfcBundle.assignedTags,
              },
              entitiesForSan
            )
          : null
      console.warn('SPEARHEAD_PERSIST resume_restore bundle package=', snap.packageKey)
      updateState(
        {
          selectedLauncherGroupKey: snap.launcherGroupKey ?? '',
          selectedFaction: '',
          selectedPackage: snap.packageKey,
          selectedEntity: '',
          selectedEntityId: null,
          selectedEntityName: null,
          selectedEntityIndex: null,
          runtimeRegistry: result.runtimeRegistry,
          activeRoster: roster,
          runtimeUnits: restoredUnits,
          assignedTags: cleaned ? { ...cleaned.assignedTags } : { ...(snap.nfcBundle.assignedTags || {}) },
          nfcAssignments: cleaned ? { ...cleaned.nfcAssignments } : { ...(snap.nfcBundle.nfcAssignments || {}) },
          nfcHistoricalTags: { ...(snap.nfcBundle.nfcHistoricalTags || {}) },
          recentAssignments: [...(snap.nfcBundle.recentAssignments || [])].slice(-RECENT_ASSIGNMENTS_MAX),
          nfcStatus: 'idle',
          lastAssignmentResult: null,
          lastNfcStubRead: '',
          nfcScanPhase: 'waiting',
          runtimeGateWarning: '',
          nfcIdentityModal: null,
          activeNfcConflict: null,
          nfcRuntimeLookupMode: false,
          nfcUiHighlightEntityId: null,
          nfcPulseUnlinkedEntityId: null,
          runtimeEpoch: nextEpoch,
          runtimeActionSequence: 0,
          ...runtimeStorageReset(),
          packageBrowseNfcEntityCount: Array.isArray(result.runtimeRegistry?.entities)
            ? result.runtimeRegistry.entities.length
            : 0,
          activeThemeId: themeId,
          currentScreen: operatorResumeScreen || (enterTable ? 'runtime' : 'roster-viewer'),
          ...(operatorSession && operatorResumeMode
            ? {
                appMode: operatorResumeMode,
                operatorGameId: snap.operatorGameId || parseOperatorPackageKey(snap.packageKey)?.gameId || '',
                operatorFactionKey:
                  snap.operatorFactionKey || parseOperatorPackageKey(snap.packageKey)?.factionKey || '',
              }
            : {}),
          ...(!operatorSession && enterTable ? { appMode: 'runtime', runtimeGateWarning: '', nfcScanPhase: 'waiting' } : {}),
          ...(operatorSession && cleaned?.hydrationWarning ? { operatorHydrationWarning: cleaned.hydrationWarning } : {}),
          ...(operatorSession && Number(snap.at) > 0 ? { operatorRosterImportedAt: Number(snap.at) } : {}),
        },
        'resume last session'
      )
    } else {
      const nextEpoch = (Number(state.runtimeEpoch) || 0) + 1
      updateState(
        {
          selectedLauncherGroupKey: snap.launcherGroupKey ?? '',
          selectedFaction: '',
          selectedPackage: snap.packageKey,
          selectedEntity: '',
          selectedEntityId: null,
          selectedEntityName: null,
          selectedEntityIndex: null,
          ...assignmentStorageReset(),
          runtimeRegistry: result.runtimeRegistry,
          activeRoster: roster,
          runtimeUnits: freshUnits,
          runtimeEpoch: nextEpoch,
          runtimeActionSequence: 0,
          activeThemeId: themeId,
          currentScreen: operatorResumeScreen || (enterTable ? 'runtime' : 'roster-viewer'),
          ...(operatorSession && operatorResumeMode
            ? {
                appMode: operatorResumeMode,
                operatorGameId: snap.operatorGameId || parseOperatorPackageKey(snap.packageKey)?.gameId || '',
                operatorFactionKey:
                  snap.operatorFactionKey || parseOperatorPackageKey(snap.packageKey)?.factionKey || '',
              }
            : {}),
          ...(!operatorSession && enterTable ? { appMode: 'runtime', runtimeGateWarning: '', nfcScanPhase: 'waiting' } : {}),
          ...(operatorSession && Number(snap.at) > 0 ? { operatorRosterImportedAt: Number(snap.at) } : {}),
        },
        'resume last session'
      )
    }
    recordAction(enterTable ? 'RESUME_SESSION_TABLE' : operatorSession ? 'RESUME_OPERATOR' : 'VIEW_ROSTER', roster?.name || '')
    return true
  }

  /** Roster-viewer unit tap: keeps legacy selectedUnit plus assignment triple in sync. */
  function setSelectedUnit(unitId) {
    if (!state.activeRoster) return
    console.debug('UNIT_SELECTED', unitId || '(clear)')
    recordAction('SELECT_UNIT', unitId || '(clear)')
    const patch = resolveUnitSelectionPatch(unitId)
    updateState(patch, `selected unit: ${unitId || 'none'}`)
    console.debug('ACTIVE_ASSIGNMENT_TARGET', patch.selectedEntityId ?? null)
  }

  /** Focus unit for NFC pairing — roster command center or focused NFC screen (same validators). */
  function selectAssignmentUnit(unitId) {
    const screenOk = state.currentScreen === 'nfc-assignment' || state.currentScreen === 'roster-viewer'
    if (!state.activeRoster?.units || !screenOk) return
    if (!unitId) return
    const idx = state.activeRoster.units.findIndex((u) => u.id === unitId)
    if (idx < 0) return
    const u = state.activeRoster.units[idx]
    console.debug('UNIT_SELECTED', unitId)
    recordAction('SELECTED_UNIT_FOR_ASSIGNMENT', unitId)
    recordAction('SELECT_ASSIGNMENT_UNIT', unitId)
    recordAction('SELECTED_ENTITY_FOR_ASSIGNMENT', unitId)
    updateState(
      {
        selectedEntity: u.id,
        selectedEntityId: u.id,
        selectedEntityName: u.name,
        selectedEntityIndex: idx,
        nfcStatus: 'idle',
        lastAssignmentResult: null,
        nfcScanPhase: 'waiting',
        activeNfcConflict: null,
        runtimeGateWarning: '',
      },
      `assignment entity: ${u.name}`
    )
    console.debug('ACTIVE_ASSIGNMENT_TARGET', u.id)
  }

  function patchRuntimeUnit(unitId, updater, actionType, actionValue, label) {
    const ru = state.runtimeUnits[unitId]
    if (!ru) return
    const ts = Date.now()
    const base = {
      ...ru,
      statusEffects: [...(ru.statusEffects || [])],
    }
    const next = updater(base)
    next.lastModifiedAt = ts
    if (!Array.isArray(next.statusEffects)) next.statusEffects = []
    recordAction(actionType, actionValue)
    updateState(
      {
        runtimeUnits: {
          ...state.runtimeUnits,
          [unitId]: next,
        },
      },
      label
    )
  }

  /** Gameplay: adjust wounds; destroyed tracks woundsCurrent <= 0. */
  function applyRuntimeWoundDelta(unitId, delta) {
    const ru = state.runtimeUnits[unitId]
    if (!ru) return
    const d = Number(delta)
    if (!Number.isFinite(d)) return
    patchRuntimeUnit(
      unitId,
      (r) => {
        let wc = r.woundsCurrent + d
        wc = Math.max(0, Math.min(r.woundsMax, wc))
        const destroyed = wc <= 0
        return { ...r, woundsCurrent: wc, destroyed }
      },
      'RUNTIME_WOUND_DELTA',
      `${unitId}:${d}`,
      `runtime wound delta ${unitId} (${d >= 0 ? '+' : ''}${d})`
    )
  }

  function toggleRuntimeUnitActivated(unitId) {
    const ru = state.runtimeUnits[unitId]
    if (!ru || ru.destroyed) return
    patchRuntimeUnit(
      unitId,
      (r) => ({ ...r, activated: !r.activated }),
      'RUNTIME_TOGGLE_ACTIVATED',
      unitId,
      `runtime activated toggle ${unitId}`
    )
  }

  function toggleRuntimeUnitDestroyed(unitId) {
    const ru = state.runtimeUnits[unitId]
    if (!ru) return
    patchRuntimeUnit(
      unitId,
      (r) => ({ ...r, destroyed: !r.destroyed }),
      'RUNTIME_TOGGLE_DESTROYED',
      unitId,
      `runtime destroyed toggle ${unitId}`
    )
  }

  /** Append a simple status label (gameplay systems can replace with structured effects later). */
  function addRuntimeStatusEffect(unitId, effectLabel) {
    const ru = state.runtimeUnits[unitId]
    if (!ru || ru.destroyed) return
    const label = String(effectLabel || '').trim() || 'effect'
    patchRuntimeUnit(
      unitId,
      (r) => ({
        ...r,
        statusEffects: [...r.statusEffects, label],
      }),
      'RUNTIME_STATUS_ADD',
      `${unitId}:${label}`,
      `runtime status effect + ${unitId}`
    )
  }

  function resolveUnitSelectionPatch(unitId) {
    const clearNfc = { nfcStatus: 'idle', lastAssignmentResult: null }
    if (!unitId) {
      return {
        selectedEntity: '',
        selectedEntityId: null,
        selectedEntityName: null,
        selectedEntityIndex: null,
        ...clearNfc,
      }
    }
    if (!Array.isArray(state.activeRoster.units)) {
      return {
        selectedEntity: '',
        selectedEntityId: null,
        selectedEntityName: null,
        selectedEntityIndex: null,
        ...clearNfc,
      }
    }
    const idx = state.activeRoster.units.findIndex((u) => u.id === unitId)
    if (idx < 0) {
      return {
        selectedEntity: '',
        selectedEntityId: null,
        selectedEntityName: null,
        selectedEntityIndex: null,
        ...clearNfc,
      }
    }
    const u = state.activeRoster.units[idx]
    return {
      selectedEntity: u.id,
      selectedEntityId: u.id,
      selectedEntityName: u.name,
      selectedEntityIndex: idx,
      ...clearNfc,
    }
  }

  function recordNfcTransportFailure(reason) {
    const r = String(reason || '')
    updateState(
      {
        nfcScanReceiptState: 'dispatch_failed',
        nfcLastRuntimeDispatchOk: false,
        nfcLastTransportFailureReason: r,
      },
      `nfc transport failure: ${r}`
    )
  }

  function clearNfcTapSelectDetail() {
    updateState({ nfcTapSelectDetailOpen: false }, 'nfc tap detail closed')
  }

  function clearPackageNfcHighlight() {
    updateState(
      {
        packageNfcHighlightEntityId: null,
        packageNfcHighlightTagId: null,
        packageNfcLookupSource: null,
      },
      'package nfc highlight cleared'
    )
  }

  function recordRender() {
    // Render lifecycle bookkeeping:
    // renderCount is updated in state so debug UI can show exact rerender activity.
    state.renderCount += 1
    recordAction('RENDER', `render #${state.renderCount}`)
    // Runtime bridge:
    // Later systems (runtime, plugins, async flows) can emit similar actions,
    // so this history becomes a tiny foundation for timeline-style debugging.
    console.debug('[render] render call', state.renderCount)
  }

  ;(() => {
    const snap = loadSessionSnapshot()
    if (!snap?.packageKey?.startsWith('operator:')) return
    if (!snap.embeddedOperatorRegistry?.entities?.length) return
    const reg = cloneRuntimeRegistry(snap.embeddedOperatorRegistry)
    const roster = activeRosterShapeFromRegistry(reg)
    if (!roster) return
    const parsed = parseOperatorPackageKey(snap.packageKey)
    const nextEpoch = (Number(state.runtimeEpoch) || 0) + 1
    const themeId = listThemeIds().includes(snap.themeId) ? snap.themeId : 'default-dark'
    const freshUnits = buildRuntimeUnitsFromRegistry(reg)
    const restoredUnits =
      snap.nfcBundle?.runtimeUnits && typeof snap.nfcBundle.runtimeUnits === 'object'
        ? mergeRuntimeUnitsRestored(freshUnits, snap.nfcBundle.runtimeUnits)
        : freshUnits
    const last = normalizeOperatorResumeScreen(snap.lastOperatorScreen)
    const mode = operatorAppModeForScreen(last)
    const bundleIn = snap.nfcBundle || {}
    const cleaned = sanitizePersistedNfcBundle(
      { nfcAssignments: bundleIn.nfcAssignments, assignedTags: bundleIn.assignedTags },
      reg.entities || []
    )
    Object.assign(state, {
      operatorGameId: snap.operatorGameId || parsed?.gameId || '',
      operatorFactionKey: snap.operatorFactionKey || parsed?.factionKey || '',
      selectedPackage: snap.packageKey,
      selectedLauncherGroupKey: snap.launcherGroupKey ?? '',
      runtimeRegistry: reg,
      activeRoster: roster,
      runtimeUnits: restoredUnits,
      assignedTags: { ...cleaned.assignedTags },
      nfcAssignments: { ...cleaned.nfcAssignments },
      nfcHistoricalTags: { ...(snap.nfcBundle?.nfcHistoricalTags || {}) },
      recentAssignments: [...(snap.nfcBundle?.recentAssignments || [])].slice(-RECENT_ASSIGNMENTS_MAX),
      nfcStatus: 'idle',
      lastAssignmentResult: null,
      lastNfcStubRead: '',
      nfcScanPhase: 'waiting',
      runtimeGateWarning: '',
      nfcIdentityModal: null,
      activeNfcConflict: null,
      nfcRuntimeLookupMode: false,
      nfcUiHighlightEntityId: null,
      nfcPulseUnlinkedEntityId: null,
      runtimeEpoch: nextEpoch,
      runtimeActionSequence: 0,
      activeThemeId: themeId,
      currentScreen: last,
      appMode: mode,
      selectedEntity: '',
      selectedEntityId: null,
      selectedEntityName: null,
      selectedEntityIndex: null,
      operatorRosterImportedAt: Number(snap.at) > 0 ? Number(snap.at) : 0,
      operatorHydrationWarning: cleaned.hydrationWarning || '',
      ...runtimeStorageReset(),
      packageBrowseNfcEntityCount: reg.entities.length,
    })
  })()

  return {
    getState,
    subscribe,
    setCurrentScreen,
    selectLauncherGroup,
    browseAllPackages,
    setPackageFactionFilter,
    selectFaction,
    selectOperatorGame,
    selectOperatorFaction,
    importOperatorRosterFromText,
    clearOperatorImportError,
    selectPackage,
    importPackageFromJson,
    setLauncherTheme,
    continueToRosterFromTheme,
    skipThemeDefault,
    resumeLastSession,
    bootstrapDemoMatch,
    explainRuntimeReadyDetail,
    setSelectedUnit,
    selectAssignmentUnit,
    enterNfcAssignment,
    navigateNfcAssignment,
    exitNfcAssignment,
    navigateOperatorOverview,
    navigateOperatorValidation,
    applyValidationScan,
    dismissOperatorHydrationWarning,
    requestOperatorClearAssignments,
    cancelOperatorClearAssignments,
    confirmOperatorClearAssignments,
    notifyOperatorSessionResume,
    cancelOperatorInlineReassign,
    confirmOperatorInlineReassign,
    getOperatorAssignmentBackupJson,
    previewOperatorAssignmentImport,
    clearOperatorBackupImportPreview,
    commitOperatorAssignmentImport,
    isAssignmentCommitLocked,
    prepareNfcScan,
    retryNfcScan,
    clearNfcAssignmentForUnit,
    skipToNextUnassignedUnit,
    attemptEnterRuntime,
    applyStubTagAssignment,
    dismissPhysicalTagConflict,
    reassignPhysicalTagToEntity,
    relinkRecognizedTagInline,
    jumpToOwnedPhysicalPiece,
    clearPhysicalUiPulses,
    setNfcRuntimeLookupMode,
    resetActiveNfcSessionLinks,
    resolveRuntimeTag,
    resolvePackageSemanticMapping,
    dispatchRuntimeAction,
    dispatchRuntimeActionBatch,
    recordNfcTransportFailure,
    clearNfcTapSelectDetail,
    clearPackageNfcHighlight,
    attemptRuntimeRecoveryHook,
    bumpRuntimeSuspendEpoch,
    suspendRuntimeDomains,
    verifyRuntimeResumeContext,
    applyRuntimeWoundDelta,
    toggleRuntimeUnitActivated,
    toggleRuntimeUnitDestroyed,
    addRuntimeStatusEffect,
    recordRender,
    getRuntimeReplayActionLog: getReplayLogSlice,
    clearRuntimeReplayActionLog,
  }
}
