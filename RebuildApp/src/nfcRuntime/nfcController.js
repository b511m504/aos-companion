import { createInitialNfcRuntimeState, cloneNfcRuntimeState } from './nfcState.js'
import { createNfcAndroidBridge } from './nfcAndroidBridge.js'
import { NFC_TRACE, logNfcTrace } from './nfcEvents.js'
import { patchNfcPipelineMetrics, nfcBridgeHeartbeat } from './nfcBridgeHeartbeat.js'
import { nfcDiag, nfcPipeline } from './nfcLog.js'
import {
  logDuplicateTransactionSuppressed,
  logQueueWatchdogWarning,
  logScanLifecycle,
} from './nfcScanLifecycle.js'
import { createScanRuntimePersistence } from './scanRuntimePersistence.js'
import { recordQueueDrainLatency } from '../runtime/runtimePerf.js'
import { journalRuntimeEvent } from '../runtime/runtimeEventJournal.js'
import { createScanStormGate, WATCHDOG_EVENT } from '../runtime/runtimeWatchdog.js'

/** Preserve order; drop oldest on overflow (spam / stalled drain during suspend). */
const SCAN_QUEUE_MAX = 32

/** Same-order-of-magnitude as native tag dedupe; suppresses double-fire into the JS queue only. */
const ENQUEUE_FAST_DUP_MS = 380

/** Idempotent transaction guard (replay / double-dispatch). */
const PROCESSED_TX_RING_MAX = 64

const WATCHDOG_INTERVAL_MS = 500
const STUCK_QUEUE_MS = 12000
const STUCK_PROCESSING_MS = 6000
const QUEUE_GROWTH_DEPTH_MIN = 4
const QUEUE_GROWTH_STREAK = 4

/** Queue oldest item stuck while suspended — diagnostic only (no auto-clear). */
const SUSPEND_STUCK_MS = 15000

let txSeqMonotonic = 0
let queueSeqMonotonic = 0

function suspendReasons(suspend) {
  return {
    conflictBlocking: suspend.conflictBlocking,
    restoreInProgress: suspend.restoreInProgress,
    runtimeBackgroundHold: suspend.runtimeBackgroundHold,
    runtimeCriticalHold: suspend.runtimeCriticalHold,
  }
}

function parseInterceptResult(result) {
  if (result === true) return { handled: true, outcome: 'resolved' }
  if (result && typeof result === 'object') {
    if (result.handled === true || result.intercepted === true) {
      const outcome = result.outcome === 'rejected' ? 'rejected' : result.outcome === 'failed' ? 'failed' : 'resolved'
      return { handled: true, outcome }
    }
  }
  if (result === 'rejected') return { handled: true, outcome: 'rejected' }
  return { handled: false, outcome: null }
}

export function createNfcController({
  onStateChange,
  interceptScan,
  commitAssignment,
  getPostCommitScanState,
  clearAssignmentInStore,
  resetAssignmentsInStore,
  getScanFailureContext,
} = {}) {
  const state = createInitialNfcRuntimeState()
  const persistence = createScanRuntimePersistence()
  let bridge = null

  let lastEnqueueDupUid = ''
  let lastEnqueueDupAt = 0
  let duplicateEnqueueSuppressCount = 0

  /** @type {Array<{ transactionId: string }>} */
  const scanQueue = []

  const processedTxRing = []
  const processedTxSet = new Set()

  /** Block drain during conflict UI or session restore so store hydrates before commits. */
  const suspend = {
    conflictBlocking: false,
    restoreInProgress: false,
    /** Pause scan drain while app is backgrounded (visibility hidden). */
    runtimeBackgroundHold: false,
    /** Pause scan drain when runtime transitions are critically frozen. */
    runtimeCriticalHold: false,
  }

  let watchdogTimer = null
  let lastWatchdogQueueDepth = 0
  let queueGrowthStreak = 0
  let processingStartedAt = 0

  const scanStormGate = createScanStormGate({ windowMs: 420, maxSameUid: 7 })
  let lastSuspendStuckLogAt = 0

  function isSuspended() {
    return (
      suspend.conflictBlocking ||
      suspend.restoreInProgress ||
      suspend.runtimeBackgroundHold ||
      suspend.runtimeCriticalHold
    )
  }

  function rememberProcessedTx(transactionId) {
    if (!transactionId || processedTxSet.has(transactionId)) return
    processedTxSet.add(transactionId)
    processedTxRing.push(transactionId)
    while (processedTxRing.length > PROCESSED_TX_RING_MAX) {
      const old = processedTxRing.shift()
      processedTxSet.delete(old)
    }
    persistence.saveRecentTransactions([...processedTxRing])
  }

  function mirrorPendingPersistence() {
    persistence.savePendingQueue(
      scanQueue.map((it) => ({
        uid: it.uid,
        transactionId: it.transactionId,
        receivedAt: it.receivedAt,
        queueSequence: it.queueSequence,
        sourcePath: it.sourcePath,
      }))
    )
  }

  function logFailureSnapshot(note, envelope) {
    const ctx =
      typeof getScanFailureContext === 'function'
        ? getScanFailureContext()
        : {}
    console.warn('SPEARHEAD_NFC_PIPELINE scan_failure_context', {
      note,
      transactionId: envelope?.transactionId,
      uid: envelope?.uid,
      queueDepth: scanQueue.length,
      listenerCount: nfcBridgeHeartbeat.listenerAttachCount ?? 0,
      ...ctx,
    })
  }

  function buildEnvelope(tagId, rawPayload, sourcePath) {
    const receivedAt = Date.now()
    const transactionId = `stx_${++txSeqMonotonic}_${receivedAt}`
    const queueSequence = ++queueSeqMonotonic
    const uid = String(tagId || '').trim()
    const base = {
      uid,
      tagId: uid,
      transactionId,
      receivedAt,
      queueSequence,
      sourcePath: sourcePath || 'unknown',
    }
    const p = rawPayload && typeof rawPayload === 'object' ? rawPayload : {}
    return { ...p, ...base }
  }

  function updateSuspendState(patch) {
    const prevConflictBlocking = suspend.conflictBlocking
    const prevSuspended = isSuspended()
    if (patch.conflictBlocking !== undefined) suspend.conflictBlocking = Boolean(patch.conflictBlocking)
    if (patch.restoreInProgress !== undefined) suspend.restoreInProgress = Boolean(patch.restoreInProgress)
    if (patch.runtimeBackgroundHold !== undefined) {
      suspend.runtimeBackgroundHold = Boolean(patch.runtimeBackgroundHold)
    }
    if (patch.runtimeCriticalHold !== undefined) {
      suspend.runtimeCriticalHold = Boolean(patch.runtimeCriticalHold)
    }
    const nextConflictBlocking = suspend.conflictBlocking
    const nextSuspended = isSuspended()
    nfcDiag(
      'SPEARHEAD_ASSIGN_DIAG phase=suspend_update suspended=',
      nextSuspended,
      'was_suspended=',
      prevSuspended,
      'reasons=',
      suspendReasons(suspend),
      'patch=',
      patch
    )
    if (!prevConflictBlocking && nextConflictBlocking) {
      nfcDiag('SPEARHEAD_ASSIGN_DIAG phase=conflict_modal_blocks_drain')
    }
    if (prevSuspended && !nextSuspended) {
      nfcDiag('SPEARHEAD_ASSIGN_DIAG phase=queue_resume_after_unblock', 'reasons=', suspendReasons(suspend))
      scheduleDrain()
    }
  }

  function stopWatchdog() {
    if (watchdogTimer != null) {
      clearInterval(watchdogTimer)
      watchdogTimer = null
    }
    processingStartedAt = 0
    patchNfcPipelineMetrics({
      oldestQueuedAgeMs: 0,
      processingScanAgeMs: 0,
      queueWatchdogStatus: 'ok',
    })
  }

  function startWatchdog() {
    stopWatchdog()
    lastWatchdogQueueDepth = scanQueue.length
    queueGrowthStreak = 0
    watchdogTimer = setInterval(() => {
      const now = Date.now()
      const depth = scanQueue.length
      const oldestAt = scanQueue[0]?.receivedAt
      const oldestQueuedAgeMs = oldestAt ? now - oldestAt : 0
      const processingScanAgeMs = processingStartedAt ? now - processingStartedAt : 0

      if (depth > lastWatchdogQueueDepth) queueGrowthStreak += 1
      else queueGrowthStreak = 0
      lastWatchdogQueueDepth = depth

      let status = 'ok'
      const reasons = []
      if (depth > 0 && oldestQueuedAgeMs > STUCK_QUEUE_MS) {
        reasons.push('stuck_queue')
        status = 'warning'
      }
      if (processingStartedAt > 0 && processingScanAgeMs > STUCK_PROCESSING_MS) {
        reasons.push('slow_processing')
        status = 'warning'
      }
      if (depth >= QUEUE_GROWTH_DEPTH_MIN && queueGrowthStreak >= QUEUE_GROWTH_STREAK) {
        reasons.push('queue_growth')
        status = 'warning'
      }

      if (isSuspended() && depth > 0 && oldestQueuedAgeMs > SUSPEND_STUCK_MS) {
        if (now - lastSuspendStuckLogAt > 8000) {
          lastSuspendStuckLogAt = now
          journalRuntimeEvent(WATCHDOG_EVENT.SUSPEND_STUCK, {
            depth,
            oldestQueuedAgeMs,
            reasons: suspendReasons(suspend),
          })
        }
      }

      patchNfcPipelineMetrics({
        oldestQueuedAgeMs,
        processingScanAgeMs,
        queueWatchdogStatus: status,
      })

      if (reasons.length) {
        logQueueWatchdogWarning(reasons.join(','), {
          depth,
          oldestQueuedAgeMs,
          processingScanAgeMs,
          growthStreak: queueGrowthStreak,
        })
      }
    }, WATCHDOG_INTERVAL_MS)
  }

  function scheduleDrain() {
    queueMicrotask(() => {
      const blocked = isSuspended()
      patchNfcPipelineMetrics({ scanQueueDepth: scanQueue.length })
      nfcDiag(
        'SPEARHEAD_ASSIGN_DIAG phase=drain_start queue_len=',
        scanQueue.length,
        'suspended=',
        blocked,
        'reasons=',
        suspendReasons(suspend)
      )
      if (blocked) {
        nfcDiag('SPEARHEAD_ASSIGN_DIAG phase=drain_skipped_while_suspended')
        return
      }
      while (scanQueue.length > 0 && !isSuspended()) {
        const envelope = scanQueue.shift()
        patchNfcPipelineMetrics({ scanQueueDepth: scanQueue.length })
        mirrorPendingPersistence()
        nfcDiag(
          'SPEARHEAD_ASSIGN_DIAG phase=drain_item_begin tag=',
          envelope.tagId,
          'remaining_queue_len=',
          scanQueue.length
        )
        nfcPipeline('drain_begin', { tagId: envelope.tagId, queueAfterShift: scanQueue.length })
        processQueuedItem(envelope)
        nfcDiag('SPEARHEAD_ASSIGN_DIAG phase=drain_item_end tag=', envelope.tagId)
      }
      processingStartedAt = 0
      patchNfcPipelineMetrics({ scanQueueDepth: scanQueue.length, processingScanAgeMs: 0 })
      mirrorPendingPersistence()
      nfcDiag(
        'SPEARHEAD_ASSIGN_DIAG phase=drain_cycle_done queue_len=',
        scanQueue.length,
        'suspended=',
        isSuspended()
      )
    })
  }

  function enqueueScan(tagId, rawPayload, sourcePath) {
    const now = Date.now()
    if (tagId && tagId === lastEnqueueDupUid && now - lastEnqueueDupAt < ENQUEUE_FAST_DUP_MS) {
      duplicateEnqueueSuppressCount += 1
      patchNfcPipelineMetrics({ duplicateEnqueueSuppressCount })
      logScanLifecycle('duplicate_suppressed', {
        uid: tagId,
        transactionId: '',
        queueDepth: scanQueue.length,
        elapsedMs: now - lastEnqueueDupAt,
        sourcePath,
        note: 'uid_fast_dup',
      })
      nfcPipeline('duplicate_enqueue_suppressed', { tagId, windowMs: ENQUEUE_FAST_DUP_MS, count: duplicateEnqueueSuppressCount })
      nfcDiag('SPEARHEAD_ASSIGN_DIAG phase=enqueue_duplicate_suppressed tag=', tagId)
      return
    }

    const uidForStorm = String(tagId || '').trim()
    if (uidForStorm) {
      const st = scanStormGate(uidForStorm, now)
      if (!st.ok) {
        journalRuntimeEvent(WATCHDOG_EVENT.SCAN_STORM, {
          uid: uidForStorm,
          count: st.count,
          windowMs: 420,
        })
        logScanLifecycle('rejected', {
          uid: tagId,
          transactionId: '',
          queueDepth: scanQueue.length,
          elapsedMs: 0,
          sourcePath,
          note: 'scan_storm',
        })
        nfcDiag('SPEARHEAD_ASSIGN_DIAG phase=enqueue_storm_suppressed tag=', tagId)
        return
      }
    }

    lastEnqueueDupUid = tagId
    lastEnqueueDupAt = now

    if (scanQueue.length >= SCAN_QUEUE_MAX) {
      journalRuntimeEvent(WATCHDOG_EVENT.QUEUE_OVERFLOW, { depth: scanQueue.length, max: SCAN_QUEUE_MAX })
      scanQueue.shift()
      console.warn('SPEARHEAD_NFC_QUEUE overflow_drop_oldest len=', scanQueue.length)
    }

    const envelope = buildEnvelope(tagId, rawPayload, sourcePath)
    logScanLifecycle('received', {
      uid: envelope.uid,
      transactionId: envelope.transactionId,
      queueDepth: scanQueue.length,
      sourcePath: envelope.sourcePath,
    })

    scanQueue.push(envelope)
    mirrorPendingPersistence()
    persistence.saveActiveContext({
      lastSourcePath: envelope.sourcePath,
      lastTransactionId: envelope.transactionId,
    })

    logScanLifecycle('enqueued', {
      uid: envelope.uid,
      transactionId: envelope.transactionId,
      queueDepth: scanQueue.length,
      elapsedMs: Date.now() - envelope.receivedAt,
      sourcePath: envelope.sourcePath,
    })

    patchNfcPipelineMetrics({ scanQueueDepth: scanQueue.length })
    nfcPipeline('enqueue', { tagId: envelope.uid, queueLen: scanQueue.length, tx: envelope.transactionId })
    nfcDiag(
      'SPEARHEAD_ASSIGN_DIAG phase=enqueue_scan tag=',
      envelope.tagId,
      'queue_len=',
      scanQueue.length,
      'suspended=',
      isSuspended(),
      'reasons=',
      suspendReasons(suspend)
    )
    if (!isSuspended()) scheduleDrain()
    else nfcDiag('SPEARHEAD_ASSIGN_DIAG phase=enqueue_stalled_pending_unsuspend')
  }

  function clearScanQueue() {
    scanQueue.length = 0
    mirrorPendingPersistence()
    patchNfcPipelineMetrics({ scanQueueDepth: 0 })
  }

  function processQueuedItem(envelope) {
    const t0 = envelope.receivedAt
    const { tagId, transactionId, sourcePath } = envelope

    if (processedTxSet.has(transactionId)) {
      logDuplicateTransactionSuppressed(tagId, transactionId, scanQueue.length)
      return
    }

    processingStartedAt = Date.now()
    logScanLifecycle('dispatched', {
      uid: tagId,
      transactionId,
      queueDepth: scanQueue.length,
      elapsedMs: Date.now() - t0,
      sourcePath,
    })
    recordQueueDrainLatency(Date.now() - t0)

    logNfcTrace(NFC_TRACE.TAG_RECEIVED, tagId)
    nfcDiag(
      'SPEARHEAD_ASSIGN_DIAG phase=queue_item_before_dispatch tag=',
      tagId,
      'selectedUnitId=',
      state.activeAssignment.selectedUnitId,
      'waitingForScan=',
      state.activeAssignment.waitingForScan,
      'mapped_assignments_count=',
      Object.keys(state.activeAssignment.assignments || {}).length
    )
    state.activeAssignment.lastScannedTagId = tagId
    state.diagnostics.lastRawTag = tagId
    notify()

    try {
      const rawResult = interceptScan?.(tagId, envelope)
      const parsed = parseInterceptResult(rawResult)
      nfcDiag('SPEARHEAD_ASSIGN_DIAG phase=interceptScan_result', parsed, 'tag=', tagId)

      if (parsed.handled) {
        if (parsed.outcome === 'resolved') {
          logScanLifecycle('resolved', {
            uid: tagId,
            transactionId,
            queueDepth: scanQueue.length,
            elapsedMs: Date.now() - t0,
            sourcePath,
          })
        } else if (parsed.outcome === 'rejected') {
          logScanLifecycle('rejected', {
            uid: tagId,
            transactionId,
            queueDepth: scanQueue.length,
            elapsedMs: Date.now() - t0,
            sourcePath,
            note: 'intercept',
          })
          logFailureSnapshot('intercept_rejected', envelope)
        } else if (parsed.outcome === 'failed') {
          logScanLifecycle('failed', {
            uid: tagId,
            transactionId,
            queueDepth: scanQueue.length,
            elapsedMs: Date.now() - t0,
            sourcePath,
            note: 'intercept',
          })
          logFailureSnapshot('intercept_failed', envelope)
        }
      }

      if (!parsed.handled) {
        const committed = createAssignment(tagId, envelope, t0)
        if (committed) {
          logScanLifecycle('committed', {
            uid: tagId,
            transactionId,
            queueDepth: scanQueue.length,
            elapsedMs: Date.now() - t0,
            sourcePath,
          })
        } else {
          logScanLifecycle('rejected', {
            uid: tagId,
            transactionId,
            queueDepth: scanQueue.length,
            elapsedMs: Date.now() - t0,
            sourcePath,
            note: 'no_assignment_target',
          })
          logFailureSnapshot('assignment_skipped', envelope)
        }
      }
    } catch (err) {
      logScanLifecycle('failed', {
        uid: tagId,
        transactionId,
        queueDepth: scanQueue.length,
        elapsedMs: Date.now() - t0,
        sourcePath,
        note: String(err?.message || err),
      })
      logFailureSnapshot('scan_pipeline_error', envelope)
      console.error('SPEARHEAD_NFC_PIPELINE scan_failed_error', err)
    } finally {
      rememberProcessedTx(transactionId)
      processingStartedAt = 0
      patchNfcPipelineMetrics({
        lastProcessedUid: tagId,
        lastProcessedAt: Date.now(),
        scanQueueDepth: scanQueue.length,
        processingScanAgeMs: 0,
      })
    }
  }

  function notify() {
    onStateChange?.()
  }

  function getState() {
    return cloneNfcRuntimeState(state)
  }

  /**
   * @returns {boolean} true if commit path ran
   */
  function createAssignment(tagId, envelope, scanT0) {
    const selectedUnitId = state.activeAssignment.selectedUnitId
    if (!selectedUnitId || !commitAssignment) {
      nfcDiag(
        'SPEARHEAD_ASSIGN_DIAG phase=createAssignment_skip reason=',
        !selectedUnitId ? 'no_selected_unit' : 'no_commit_fn',
        'tag=',
        tagId
      )
      nfcPipeline('assignment_skip', { tagId, reason: !selectedUnitId ? 'no_selected_unit' : 'no_commit_fn' })
      return false
    }

    nfcDiag(
      'SPEARHEAD_ASSIGN_DIAG phase=createAssignment_commit selectedUnitId=',
      selectedUnitId,
      'tag=',
      tagId
    )
    nfcPipeline('assignment_commit', { unitId: selectedUnitId, tagId, tx: envelope.transactionId })
    try {
      const committed = commitAssignment(selectedUnitId, tagId)
      if (committed === false) {
        nfcPipeline('assignment_skip', { tagId, reason: 'commit_lock' })
        return false
      }
    } catch (err) {
      logScanLifecycle('failed', {
        uid: tagId,
        transactionId: envelope.transactionId,
        queueDepth: scanQueue.length,
        elapsedMs: Date.now() - scanT0,
        sourcePath: envelope.sourcePath,
        note: 'commit',
      })
      logFailureSnapshot('commit_assignment_error', envelope)
      throw err
    }
    const st = getPostCommitScanState?.()
    if (st?.conflict) state.activeAssignment.waitingForScan = true
    else if (st?.success) state.activeAssignment.waitingForScan = false
    else state.activeAssignment.waitingForScan = true
    logNfcTrace(NFC_TRACE.ASSIGNMENT_CREATED, {
      unitId: selectedUnitId,
      tagId,
      via: 'store',
    })
    notify()
    return true
  }

  function setUnits(units) {
    state.units = Array.isArray(units) ? [...units] : []
  }

  function syncAssignmentsFromStore(nfcAssignments) {
    const map = {}
    const raw = nfcAssignments || {}
    for (const [entityId, rec] of Object.entries(raw)) {
      if (rec?.uid) map[entityId] = String(rec.uid)
    }
    state.activeAssignment.assignments = map
  }

  function applyDiagnostics(patch) {
    state.diagnostics = { ...state.diagnostics, ...patch }
    notify()
  }

  function selectUnit(unitId) {
    const id = String(unitId || '').trim()
    if (!id) return
    logNfcTrace(NFC_TRACE.UNIT_SELECTED, id)
    state.activeAssignment.selectedUnitId = id
    state.activeAssignment.waitingForScan = true
    notify()
  }

  function clearAssignment(unitId) {
    const id = String(unitId || '').trim()
    if (!id) return
    if (clearAssignmentInStore) {
      clearAssignmentInStore(id)
      state.activeAssignment.waitingForScan = false
      if (state.activeAssignment.selectedUnitId === id) {
        state.activeAssignment.selectedUnitId = null
      }
      logNfcTrace(NFC_TRACE.ASSIGNMENT_CLEARED, id)
      notify()
      return
    }
    const nextAssignments = { ...state.activeAssignment.assignments }
    delete nextAssignments[id]
    state.activeAssignment.assignments = nextAssignments
    state.activeAssignment.waitingForScan = false
    if (state.activeAssignment.selectedUnitId === id) {
      state.activeAssignment.selectedUnitId = null
    }
    logNfcTrace(NFC_TRACE.ASSIGNMENT_CLEARED, id, nextAssignments)
    notify()
  }

  function onTag(tagId, payload, meta = {}) {
    const sourcePath = meta.sourcePath || payload?.sourcePath || 'unknown'

    if (payload?.nfcDisabled || payload?.nfcError === 'nfc_disabled') {
      nfcDiag('SPEARHEAD_ASSIGN_DIAG phase=onTag_diagnostic_only classify=nfc_disabled_no_queue')
      logScanLifecycle('rejected', {
        uid: String(tagId || ''),
        transactionId: '',
        queueDepth: scanQueue.length,
        sourcePath,
        note: 'nfc_disabled',
      })
      applyDiagnostics({
        lastError: 'nfc_disabled',
        lastPayloadJson: JSON.stringify(payload || {}),
      })
      notify()
      return
    }

    const normalized = String(tagId || '').trim()
    if (!normalized) {
      nfcDiag(
        'SPEARHEAD_ASSIGN_DIAG phase=onTag_diagnostic_only classify=empty_uid_no_queue err=',
        payload?.nfcError || ''
      )
      logScanLifecycle('rejected', {
        uid: '',
        transactionId: '',
        queueDepth: scanQueue.length,
        sourcePath,
        note: 'empty_uid',
      })
      logNfcTrace(NFC_TRACE.TAG_RECEIVED, '(empty)')
      state.activeAssignment.lastScannedTagId = ''
      state.diagnostics.lastRawTag = ''
      applyDiagnostics({
        lastError: payload?.nfcError || 'empty_tag_uid',
        lastPayloadJson: JSON.stringify(payload || {}),
      })
      notify()
      return
    }

    nfcDiag('SPEARHEAD_ASSIGN_DIAG phase=onTag_enqueue_assignable classify=assignable_uid tag=', normalized)
    nfcPipeline('onTag', { tagId: normalized, src: sourcePath })
    enqueueScan(normalized, payload, sourcePath)
  }

  function resetSelection() {
    state.activeAssignment.selectedUnitId = null
    state.activeAssignment.waitingForScan = false
    notify()
  }

  function resetSession() {
    duplicateEnqueueSuppressCount = 0
    patchNfcPipelineMetrics({ duplicateEnqueueSuppressCount: 0 })
    clearScanQueue()
    if (resetAssignmentsInStore) {
      resetAssignmentsInStore()
      state.activeAssignment.selectedUnitId = null
      state.activeAssignment.waitingForScan = false
      state.activeAssignment.lastScannedTagId = ''
      state.activeAssignment.assignments = {}
      notify()
      return
    }
    state.activeAssignment.selectedUnitId = null
    state.activeAssignment.waitingForScan = false
    state.activeAssignment.lastScannedTagId = ''
    state.activeAssignment.assignments = {}
    notify()
  }

  function injectTestScan(uid, options = {}) {
    const sourcePath = options.sourcePath || 'test_harness'
    const burst = Math.max(1, Math.min(32, Number(options.burst) || 1))
    const gapMs = Math.max(0, Number(options.gapMs) || 0)
    const delayMs = Math.max(0, Number(options.delayMs) || 0)
    const basePayload =
      options.payload && typeof options.payload === 'object' ? { ...options.payload } : {}
    const runOne = (i) => {
      const p = { ...basePayload, sourcePath, testHarness: true, testBurstIndex: i }
      onTag(String(uid || '').trim(), p, { sourcePath })
    }
    for (let i = 0; i < burst; i += 1) {
      const offset = delayMs + i * gapMs
      if (offset === 0) runOne(i)
      else setTimeout(() => runOne(i), offset)
    }
  }

  async function startBridge() {
    nfcDiag(
      'SPEARHEAD_ASSIGN_DIAG phase=bridge_controller_startBridge_enter',
      'bridge_singleton_exists=',
      Boolean(bridge),
      'ts=',
      new Date().toISOString()
    )
    if (bridge) {
      nfcDiag(
        'SPEARHEAD_ASSIGN_DIAG phase=bridge_controller_startBridge_skipped',
        'reason=',
        'bridge_already_created_no_second_bridge.start_call',
        'hint=',
        'listeners_attached_only_on_first_create_stopBridge_clears_singleton'
      )
      return
    }
    bridge = createNfcAndroidBridge({
      onTag: (id, payload) => {
        logNfcTrace(NFC_TRACE.ANDROID_EVENT, payload)
        const sp = payload?.sourcePath || 'android_native_dom'
        onTag(id, payload, { sourcePath: sp })
      },
      onDiagnostics: applyDiagnostics,
    })
    await bridge.start()
    patchNfcPipelineMetrics({ activeBridgeInstances: 1 })
    startWatchdog()
    nfcDiag(
      'SPEARHEAD_ASSIGN_DIAG phase=bridge_controller_startBridge_complete',
      'bridge_started=',
      Boolean(bridge),
      'ts=',
      new Date().toISOString()
    )
    nfcPipeline('bridge_started', { ok: true })
  }

  function stopBridge() {
    nfcDiag(
      'SPEARHEAD_ASSIGN_DIAG phase=bridge_controller_stopBridge_enter',
      'had_bridge=',
      Boolean(bridge),
      'ts=',
      new Date().toISOString()
    )
    stopWatchdog()
    bridge?.stop()
    bridge = null
    clearScanQueue()
    patchNfcPipelineMetrics({ activeBridgeInstances: 0 })
    nfcDiag(
      'SPEARHEAD_ASSIGN_DIAG phase=bridge_controller_stopBridge_done',
      'singleton_bridge_present=',
      Boolean(bridge),
      'ts=',
      new Date().toISOString()
    )
    nfcPipeline('bridge_stopped', { ok: true })
  }

  async function restartBridge() {
    nfcDiag('SPEARHEAD_ASSIGN_DIAG phase=bridge_controller_restartBridge_enter', 'ts=', new Date().toISOString())
    stopBridge()
    await startBridge()
    nfcDiag('SPEARHEAD_ASSIGN_DIAG phase=bridge_controller_restartBridge_done', 'ts=', new Date().toISOString())
  }

  function peekQueueMetrics() {
    const now = Date.now()
    const oldest = scanQueue[0]?.receivedAt
    return {
      depth: scanQueue.length,
      oldestQueuedAgeMs: oldest ? now - oldest : 0,
      processingScanAgeMs: processingStartedAt ? now - processingStartedAt : 0,
    }
  }

  return {
    getState,
    setUnits,
    syncAssignmentsFromStore,
    selectUnit,
    clearAssignment,
    resetSelection,
    resetSession,
    startBridge,
    stopBridge,
    restartBridge,
    updateSuspendState,
    injectTestScan,
    peekQueueMetrics,
  }
}
