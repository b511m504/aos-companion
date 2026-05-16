/**
 * In-app NFC bridge heartbeat overlay + pipeline snapshot (no store authority).
 */

function shortenErr(e, maxLen = 96) {
  if (e == null) return 'none'
  const s = typeof e === 'string' ? e : e?.message ? String(e.message) : String(e)
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t
}

export const nfcBridgeHeartbeat = {
  lastDomEventTs: 0,
  lastDomEventUid: '',
  lastBridgeReceiptTs: 0,
  lastBridgeReceiptUid: '',
  listenerAttachCount: 0,
  bridgeStarted: false,
  /** Active JS bridge instances (nfcController singleton: 0 or 1). */
  activeBridgeInstances: 0,
  scanQueueDepth: 0,
  lastProcessedUid: '',
  lastProcessedAt: 0,
  duplicateEnqueueSuppressCount: 0,
  oldestQueuedAgeMs: 0,
  processingScanAgeMs: 0,
  queueWatchdogStatus: 'ok',
  runtimeJournalSize: 0,
  runtimeJournalTotal: 0,
  runtimeJournalResolved: 0,
  runtimeJournalRejections: 0,
  runtimeJournalFailed: 0,
  runtimeInvariantWarningTotal: 0,
  runtimeSnapshotCount: 0,
  avgTransitionMs: 0,
  worstTransitionMs: 0,
  replayActionsPerSec: 0,
  selectorRecomputeCount: 0,
  avgQueueDrainLatencyMs: 0,
  runtimeMemoryPressureStatus: 'ok',
  runtimeJournalUtilization: 0,
  runtimeSnapshotUtilization: 0,
  runtimeReplayCacheSize: 0,
  selectorMemoCacheSize: 0,
  runtimeEffectPending: 0,
  runtimeEffectExecuted: 0,
  runtimeEffectSimulated: 0,
  runtimeEffectSuppressed: 0,
  capacitorReadyConfirmedTs: 0,
  runtimeReadyEmitTs: 0,
  runtimeReadySuccessTs: 0,
  runtimeReadyError: '',
  hasSpearheadBridge: false,
  notifyRuntimeMissing: false,
}

/** @param {Partial<typeof nfcBridgeHeartbeat>} patch */
export function patchNfcPipelineMetrics(patch) {
  Object.assign(nfcBridgeHeartbeat, patch)
}

export function recordCapacitorReadyConfirmed() {
  nfcBridgeHeartbeat.capacitorReadyConfirmedTs = Date.now()
}

export function recordRuntimeReadyEmit() {
  nfcBridgeHeartbeat.runtimeReadyEmitTs = Date.now()
}

export function recordRuntimeReadySuccess() {
  nfcBridgeHeartbeat.runtimeReadySuccessTs = Date.now()
  nfcBridgeHeartbeat.runtimeReadyError = ''
}

/** @param {unknown} err */
export function recordRuntimeReadyError(err) {
  nfcBridgeHeartbeat.runtimeReadyError = shortenErr(err)
}

export function setHasSpearheadBridge(v) {
  nfcBridgeHeartbeat.hasSpearheadBridge = Boolean(v)
}

export function setNotifyRuntimeMissing(v) {
  nfcBridgeHeartbeat.notifyRuntimeMissing = Boolean(v)
}

export function resetListenerAttachCountForBridgeSession() {
  nfcBridgeHeartbeat.listenerAttachCount = 0
}

export function recordListenerAttach() {
  nfcBridgeHeartbeat.listenerAttachCount += 1
}

/** Called from dom_event_received_window / dom_event_received_document paths. */
export function recordDomEvent(uid) {
  nfcBridgeHeartbeat.lastDomEventTs = Date.now()
  nfcBridgeHeartbeat.lastDomEventUid = uid != null && uid !== '' ? String(uid) : ''
}

/** Called when bridge_js_receipt runs (window + Capacitor). */
export function recordBridgeReceipt(uid) {
  nfcBridgeHeartbeat.lastBridgeReceiptTs = Date.now()
  nfcBridgeHeartbeat.lastBridgeReceiptUid = uid != null && uid !== '' ? String(uid) : ''
}

export function setBridgeStarted(v) {
  nfcBridgeHeartbeat.bridgeStarted = Boolean(v)
}

/**
 * Fixed corner overlay; safe to call once after bridge start.
 * @returns {() => void} teardown (optional)
 */
export function mountNfcBridgeHeartbeatOverlay() {
  if (typeof document === 'undefined') return () => {}
  if (document.getElementById('spearhead-nfc-heartbeat')) return () => {}

  globalThis.__SPEARHEAD_NFC_HEARTBEAT__ = nfcBridgeHeartbeat

  const wrap = document.createElement('div')
  wrap.id = 'spearhead-nfc-heartbeat'
  wrap.setAttribute('aria-hidden', 'true')
  wrap.className = 'dev-diagnostics-drawer'
  wrap.style.cssText = [
    'position:fixed',
    'bottom:0',
    'left:0',
    'right:0',
    'z-index:2147483640',
    'max-height:min(46vh,420px)',
    'overflow:auto',
    'padding:10px 12px 14px',
    'font:11px/1.35 system-ui,sans-serif',
    'color:#e8f4ff',
    'background:rgba(10,14,22,0.97)',
    'border-top:1px solid rgba(100,160,255,0.35)',
    'border-radius:14px 14px 0 0',
    'box-shadow:0 -8px 32px rgba(0,0,0,0.5)',
    'pointer-events:auto',
  ].join(';')

  wrap.innerHTML = `
    <div style="font-weight:700;margin-bottom:8px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;opacity:0.9">Developer diagnostics</div>
    <details open style="margin-bottom:6px"><summary style="cursor:pointer;font-weight:600">Pipeline metrics (advanced)</summary>
    <div style="opacity:0.9;margin-bottom:4px;font-size:10px">Capacitor / origin (detached runtime)</div>
    <div>platform: <span id="hb-platform">—</span></div>
    <div>origin: <span id="hb-origin">—</span></div>
    <div>protocol: <span id="hb-protocol">—</span></div>
    <div style="opacity:0.9;margin-bottom:4px;font-size:10px">Runtime ready truth</div>
    <div>capacitor ready: <span id="hb-cap-ready">—</span></div>
    <div>bridge plugin: <span id="hb-has-plugin">—</span></div>
    <div>runtime emit: <span id="hb-rt-emit">—</span></div>
    <div>runtime success: <span id="hb-rt-ok">—</span></div>
    <div>notify missing: <span id="hb-notify-miss">—</span></div>
    <div>runtime error: <span id="hb-rt-err">—</span></div>
    <div>since runtime success: <span id="hb-since-rt-ok">—</span></div>
    <div style="margin-top:6px;opacity:0.85">Bridge / scan</div>
    <div>bridge started: <span id="hb-bridge-started">—</span></div>
    <div>listeners: <span id="hb-listener-count">0</span></div>
    <div>active bridges: <span id="hb-bridge-instances">0</span></div>
    <div>scan queue: <span id="hb-queue-depth">0</span></div>
    <div>last proc uid: <span id="hb-last-proc-uid">—</span></div>
    <div>dup suppress: <span id="hb-dup-suppress">0</span></div>
    <div>watchdog: <span id="hb-watchdog">ok</span></div>
    <div>oldest queue: <span id="hb-oldest-q">—</span></div>
    <div>processing: <span id="hb-proc-age">—</span></div>
    <div style="margin-top:6px;opacity:0.85">Runtime journal</div>
    <div>actions (Σ): <span id="hb-rt-act">0</span></div>
    <div>rejections (Σ): <span id="hb-rt-rej">0</span></div>
    <div>warnings (Σ): <span id="hb-rt-warn">0</span></div>
    <div>journal size: <span id="hb-rt-jsize">0</span></div>
    <div>snapshots: <span id="hb-rt-snap">0</span></div>
    <div style="margin-top:6px;opacity:0.85">Runtime perf</div>
    <div>avg transition: <span id="hb-perf-avg">0</span> ms</div>
    <div>worst transition: <span id="hb-perf-worst">0</span> ms</div>
    <div>replay throughput: <span id="hb-perf-rps">0</span> /s</div>
    <div>selector recompute: <span id="hb-perf-sel">0</span></div>
    <div>avg queue drain: <span id="hb-perf-qd">0</span> ms</div>
    <div style="margin-top:6px;opacity:0.85">Memory / effects</div>
    <div>memory pressure: <span id="hb-mem-status">ok</span></div>
    <div>journal util: <span id="hb-mem-journal">0</span></div>
    <div>snapshot util: <span id="hb-mem-snap">0</span></div>
    <div>replay cache: <span id="hb-mem-replay">0</span></div>
    <div>selector cache: <span id="hb-mem-selector">0</span></div>
    <div>effects pending/executed: <span id="hb-eff">0/0</span></div>
    <div>last DOM uid: <span id="hb-last-dom-uid">—</span></div>
    <div>since DOM: <span id="hb-since-dom">—</span></div>
    <div>last receipt uid: <span id="hb-last-receipt-uid">—</span></div>
    </details>
    <details open style="margin-top:8px"><summary style="cursor:pointer;font-weight:600">Test hook</summary>
    <button type="button" id="hb-test-nfc" style="margin-top:8px;width:100%;padding:6px 8px;font:inherit;cursor:pointer;border-radius:6px;border:1px solid rgba(100,160,255,0.55);background:rgba(40,80,140,0.65);color:inherit">TEST NFC EVENT</button>
    </details>
  `
  document.body.appendChild(wrap)

  const elPlatform = wrap.querySelector('#hb-platform')
  const elOrigin = wrap.querySelector('#hb-origin')
  const elProtocol = wrap.querySelector('#hb-protocol')
  const elCapReady = wrap.querySelector('#hb-cap-ready')
  const elHasPlug = wrap.querySelector('#hb-has-plugin')
  const elRtEmit = wrap.querySelector('#hb-rt-emit')
  const elRtOk = wrap.querySelector('#hb-rt-ok')
  const elNotifyMiss = wrap.querySelector('#hb-notify-miss')
  const elRtErr = wrap.querySelector('#hb-rt-err')
  const elSinceRtOk = wrap.querySelector('#hb-since-rt-ok')
  const elBridge = wrap.querySelector('#hb-bridge-started')
  const elLc = wrap.querySelector('#hb-listener-count')
  const elBrInst = wrap.querySelector('#hb-bridge-instances')
  const elQ = wrap.querySelector('#hb-queue-depth')
  const elProc = wrap.querySelector('#hb-last-proc-uid')
  const elDup = wrap.querySelector('#hb-dup-suppress')
  const elWd = wrap.querySelector('#hb-watchdog')
  const elOldestQ = wrap.querySelector('#hb-oldest-q')
  const elProcAge = wrap.querySelector('#hb-proc-age')
  const elRtAct = wrap.querySelector('#hb-rt-act')
  const elRtRej = wrap.querySelector('#hb-rt-rej')
  const elRtWarn = wrap.querySelector('#hb-rt-warn')
  const elRtJsize = wrap.querySelector('#hb-rt-jsize')
  const elRtSnap = wrap.querySelector('#hb-rt-snap')
  const elPerfAvg = wrap.querySelector('#hb-perf-avg')
  const elPerfWorst = wrap.querySelector('#hb-perf-worst')
  const elPerfRps = wrap.querySelector('#hb-perf-rps')
  const elPerfSel = wrap.querySelector('#hb-perf-sel')
  const elPerfQd = wrap.querySelector('#hb-perf-qd')
  const elMemStatus = wrap.querySelector('#hb-mem-status')
  const elMemJournal = wrap.querySelector('#hb-mem-journal')
  const elMemSnap = wrap.querySelector('#hb-mem-snap')
  const elMemReplay = wrap.querySelector('#hb-mem-replay')
  const elMemSelector = wrap.querySelector('#hb-mem-selector')
  const elEff = wrap.querySelector('#hb-eff')
  const elDomUid = wrap.querySelector('#hb-last-dom-uid')
  const elSince = wrap.querySelector('#hb-since-dom')
  const elRec = wrap.querySelector('#hb-last-receipt-uid')

  const tick = () => {
    const s = nfcBridgeHeartbeat
    const cap = globalThis.Capacitor
    elPlatform.textContent =
      typeof cap?.getPlatform === 'function' ? String(cap.getPlatform()) : '—'
    elOrigin.textContent = typeof location !== 'undefined' ? location.origin : '—'
    elProtocol.textContent = typeof location !== 'undefined' ? location.protocol : '—'

    elCapReady.textContent = s.capacitorReadyConfirmedTs ? 'yes' : 'no'
    elHasPlug.textContent = s.hasSpearheadBridge ? 'yes' : 'no'
    elRtEmit.textContent = s.runtimeReadyEmitTs ? 'yes' : 'no'
    elRtOk.textContent = s.runtimeReadySuccessTs ? 'yes' : 'no'
    elNotifyMiss.textContent = s.notifyRuntimeMissing ? 'yes' : 'no'
    elRtErr.textContent = s.runtimeReadyError || 'none'
    elSinceRtOk.textContent =
      s.runtimeReadySuccessTs !== 0
        ? `${((Date.now() - s.runtimeReadySuccessTs) / 1000).toFixed(1)}s`
        : '—'

    elBridge.textContent = s.bridgeStarted ? 'yes' : 'no'
    elLc.textContent = String(s.listenerAttachCount)
    elBrInst.textContent = String(s.activeBridgeInstances ?? 0)
    elQ.textContent = String(s.scanQueueDepth ?? 0)
    elProc.textContent = s.lastProcessedUid || '—'
    elDup.textContent = String(s.duplicateEnqueueSuppressCount ?? 0)
    elWd.textContent = String(s.queueWatchdogStatus || 'ok')
    elOldestQ.textContent =
      s.oldestQueuedAgeMs > 0 ? `${(s.oldestQueuedAgeMs / 1000).toFixed(1)}s` : '—'
    elProcAge.textContent =
      s.processingScanAgeMs > 0 ? `${(s.processingScanAgeMs / 1000).toFixed(1)}s` : '—'
    elRtAct.textContent = String(s.runtimeJournalTotal ?? 0)
    elRtRej.textContent = String(s.runtimeJournalRejections ?? 0)
    elRtWarn.textContent = String(s.runtimeInvariantWarningTotal ?? 0)
    elRtJsize.textContent = String(s.runtimeJournalSize ?? 0)
    elRtSnap.textContent = String(s.runtimeSnapshotCount ?? 0)
    elPerfAvg.textContent = String((s.avgTransitionMs ?? 0).toFixed(1))
    elPerfWorst.textContent = String((s.worstTransitionMs ?? 0).toFixed(1))
    elPerfRps.textContent = String((s.replayActionsPerSec ?? 0).toFixed(1))
    elPerfSel.textContent = String(s.selectorRecomputeCount ?? 0)
    elPerfQd.textContent = String((s.avgQueueDrainLatencyMs ?? 0).toFixed(1))
    elMemStatus.textContent = String(s.runtimeMemoryPressureStatus || 'ok')
    elMemJournal.textContent = `${Math.round((s.runtimeJournalUtilization ?? 0) * 100)}%`
    elMemSnap.textContent = `${Math.round((s.runtimeSnapshotUtilization ?? 0) * 100)}%`
    elMemReplay.textContent = String(s.runtimeReplayCacheSize ?? 0)
    elMemSelector.textContent = String(s.selectorMemoCacheSize ?? 0)
    elEff.textContent = `${s.runtimeEffectPending ?? 0}/${s.runtimeEffectExecuted ?? 0}`
    elDomUid.textContent = s.lastDomEventUid || '—'
    elRec.textContent = s.lastBridgeReceiptUid || '—'
    elSince.textContent = s.lastDomEventTs ? `${((Date.now() - s.lastDomEventTs) / 1000).toFixed(1)}s` : '—'
  }

  const iv = setInterval(tick, 400)
  tick()

  wrap.querySelector('#hb-test-nfc')?.addEventListener('click', () => {
    try {
      globalThis.SPEARHEAD_TEST_NFC_EVENT?.()
    } catch (e) {
      console.warn('SPEARHEAD_NFC_HEARTBEAT', 'TEST_NFC_EVENT_failed', e)
    }
  })

  return () => {
    clearInterval(iv)
    wrap.remove()
    try {
      if (globalThis.__SPEARHEAD_NFC_HEARTBEAT__ === nfcBridgeHeartbeat) {
        delete globalThis.__SPEARHEAD_NFC_HEARTBEAT__
      }
    } catch {
      /* ignore */
    }
  }
}

let playerStatusInterval = null

/**
 * Minimal player-facing NFC indicator (no queue depths or journal counts).
 * Safe to mount once at app boot; updates from `nfcBridgeHeartbeat`.
 * @returns {() => void}
 */
export function mountPlayerNfcStatusIndicator() {
  if (typeof document === 'undefined') return () => {}
  if (document.getElementById('spearhead-nfc-player-status')) return () => {}

  const el = document.createElement('div')
  el.id = 'spearhead-nfc-player-status'
  el.className = 'nfc-player-status'
  el.setAttribute('role', 'status')
  el.innerHTML = `
    <span class="nfc-player-status__dot" aria-hidden="true"></span>
    <span class="nfc-player-status__text"><strong class="nfc-player-status__label">NFC</strong>
    <span class="nfc-player-status__detail">Starting…</span></span>
  `
  document.body.appendChild(el)

  const detailEl = el.querySelector('.nfc-player-status__detail')

  const tick = () => {
    const s = nfcBridgeHeartbeat
    const processing =
      Number(s.scanQueueDepth) > 0 ||
      Number(s.processingScanAgeMs) > 35 ||
      Number(s.oldestQueuedAgeMs) > 400
    const nativeOk =
      typeof globalThis.Capacitor !== 'undefined'
        ? Boolean(s.hasSpearheadBridge && s.bridgeStarted && s.capacitorReadyConfirmedTs)
        : Boolean(s.bridgeStarted)

    el.classList.toggle('nfc-player-status--processing', processing)
    el.classList.toggle('nfc-player-status--live', nativeOk && !processing)
    el.classList.toggle('nfc-player-status--warn', !nativeOk && typeof globalThis.Capacitor !== 'undefined')

    if (processing) detailEl.textContent = 'Reading tag…'
    else if (nativeOk) detailEl.textContent = 'Ready to tap'
    else if (typeof globalThis.Capacitor !== 'undefined') detailEl.textContent = 'Waiting for bridge…'
    else detailEl.textContent = 'Browser preview'
  }

  playerStatusInterval = window.setInterval(tick, 380)
  tick()

  return () => {
    if (playerStatusInterval != null) {
      clearInterval(playerStatusInterval)
      playerStatusInterval = null
    }
    el.remove()
  }
}
