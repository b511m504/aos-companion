import { NFC_TRACE, logNfcTrace } from './nfcEvents.js'
import {
  recordBridgeReceipt,
  recordDomEvent,
  recordListenerAttach,
  resetListenerAttachCountForBridgeSession,
  setBridgeStarted,
} from './nfcBridgeHeartbeat.js'
import { nfcDiag, nfcPipeline } from './nfcLog.js'

const BRIDGE_SOURCE_FILE = 'nfcAndroidBridge.js'

/** Non–NFC-scan DOM events (alive ping). NFC scans use {@link globalThis.SPEARHEAD_NFC_NATIVE_RECEIVE}. */
const WINDOW_DOM_BRIDGE_EVENTS = ['main-activity-alive', 'main-activity-test']

const EVENT_NAMES = ['nfcTagScanned', 'tagScanned', 'onTagScanned', 'scanResult']
const INTENT_EVENT_NAMES = ['nfcIntent', 'intentReceived', 'newIntent']

function extractTagId(payload) {
  if (!payload || typeof payload !== 'object') return ''
  const direct = payload.tagId || payload.id || payload.uid || payload.serialNumber
  if (direct) return String(direct)
  if (payload.tag && typeof payload.tag === 'object') {
    return String(payload.tag.id || payload.tag.uid || payload.tag.serialNumber || '')
  }
  return ''
}

function pluginCandidates() {
  const cap = globalThis.Capacitor
  const plugins = cap?.Plugins || {}
  return [
    ['Capacitor.Plugins.NfcPlugin', plugins.NfcPlugin],
    ['Capacitor.Plugins.NFC', plugins.NFC],
    ['Capacitor.Plugins.Nfc', plugins.Nfc],
    ['window.CapacitorNfc', globalThis.CapacitorNfc],
    ['window.NfcPlugin', globalThis.NfcPlugin],
  ]
}

function timestampNow() {
  return new Date().toISOString()
}

function logAssignDiagBridgeReceipt(uid, source, payload) {
  recordBridgeReceipt(uid)
  console.warn(
    'SPEARHEAD_ASSIGN_DIAG phase=bridge_js_receipt uid=',
    uid,
    'source=',
    source,
    'intent_action=',
    payload?.action ?? '',
    'nfcError=',
    payload?.nfcError ?? '',
    'ts=',
    timestampNow()
  )
}

export function createNfcAndroidBridge({ onTag, onDiagnostics }) {
  const removers = []
  let started = false

  function emitDiagnostics(patch) {
    onDiagnostics?.(patch)
  }

  function pushRemover(fn, meta) {
    removers.push(fn)
    nfcDiag(
      'SPEARHEAD_ASSIGN_DIAG phase=bridge_listener_attach',
      'source=',
      BRIDGE_SOURCE_FILE,
      'exact_event_name=',
      meta?.event ?? '(lifecycle)',
      'attached_to=',
      meta?.attached_to ?? meta?.target ?? 'unknown',
      'target_ref=',
      meta?.target ?? 'globalThis|document',
      'listener_registry_count=',
      removers.length,
      'runtime_id=',
      globalThis.__SPEARHEAD_RUNTIME_ID__ ?? '(unset)',
      'href=',
      typeof location !== 'undefined' ? location.href : '(no-location)',
      'readyState=',
      typeof document !== 'undefined' ? document.readyState : '(no-document)',
      'ts=',
      timestampNow()
    )
    recordListenerAttach()
  }

  async function start() {
    nfcDiag(
      'SPEARHEAD_ASSIGN_DIAG phase=bridge_start_enter',
      'started_flag=',
      started,
      'ts=',
      timestampNow()
    )
    if (started) {
      nfcDiag(
        'SPEARHEAD_ASSIGN_DIAG phase=bridge_start_skipped_duplicate_guard',
        'reason=',
        'createNfcAndroidBridge.start_already_true_listeners_not_re_registered',
        'ts=',
        timestampNow()
      )
      return
    }
    started = true
    nfcDiag('SPEARHEAD_ASSIGN_DIAG phase=bridge_start_proceed', 'ts=', timestampNow())
    resetListenerAttachCountForBridgeSession()

    const NATIVE_RECEIVE_KEY = 'SPEARHEAD_NFC_NATIVE_RECEIVE'

    function deliverFromNative(payload) {
      let p = payload
      if (typeof p === 'string') {
        try {
          p = JSON.parse(p)
        } catch {
          p = { raw: p, parseError: true }
        }
      }
      if (!p || typeof p !== 'object') p = {}
      if (!p.sourcePath) p.sourcePath = 'android_native_dom'

      nfcDiag('SPEARHEAD_ASSIGN_DIAG', 'phase=direct_native_callback_received', p)
      nfcPipeline('native_receive', { tagId: extractTagId(p) || '', action: p?.action })

      const uidForHeartbeat = extractTagId(p) || '(none)'
      recordDomEvent(uidForHeartbeat)

      logNfcTrace(NFC_TRACE.ANDROID_EVENT, p)
      emitDiagnostics({
        lastPayloadJson: JSON.stringify(p || {}),
        lastIntentAction: String(p?.action || p?.intentAction || ''),
        lastEventAt: timestampNow(),
      })

      const tagId = extractTagId(p)
      const hasErr = Boolean(p?.nfcError || p?.nfcDisabled)
      if (!tagId && !hasErr) return

      if (tagId) console.warn('SPEARHEAD_BRIDGE tag_scanned id=', tagId)
      else console.warn('SPEARHEAD_BRIDGE tag_scanned id=(none) err=', p?.nfcError || p?.nfcDisabled)

      logAssignDiagBridgeReceipt(tagId || '(none)', 'native_direct', p)
      onTag?.(tagId || '', p)
    }

    globalThis[NATIVE_RECEIVE_KEY] = deliverFromNative
    if (typeof window !== 'undefined') window[NATIVE_RECEIVE_KEY] = deliverFromNative
    pushRemover(() => {
      try {
        delete globalThis[NATIVE_RECEIVE_KEY]
      } catch {
        globalThis[NATIVE_RECEIVE_KEY] = undefined
      }
      if (typeof window !== 'undefined') {
        try {
          delete window[NATIVE_RECEIVE_KEY]
        } catch {
          window[NATIVE_RECEIVE_KEY] = undefined
        }
      }
    }, {
      event: NATIVE_RECEIVE_KEY,
      attached_to: 'globalThis+window',
      target: 'native_callback',
    })

    const isAndroidNative =
      typeof globalThis.Capacitor?.getPlatform === 'function' &&
      globalThis.Capacitor.getPlatform() === 'android'

    const candidates = pluginCandidates()
    const hit = candidates.find(([, plugin]) => Boolean(plugin))
    const bridgeName = hit?.[0] || 'none'
    const plugin = hit?.[1] || null
    const pluginKeys = Object.keys(globalThis.Capacitor?.Plugins || {})
    console.debug('SPEARHEAD_BRIDGE plugin_runtime', {
      capacitorPresent: Boolean(globalThis.Capacitor),
      pluginKeys,
      bridgeName,
      pluginLoaded: Boolean(plugin),
    })

    let available = Boolean(plugin)
    let enabled = false
    let listenerActive = false
    /** Set when a Capacitor `addListener` for tag events succeeds (first matching name in EVENT_NAMES). */
    let pluginTagListenerEventName = null

    if (plugin?.isAvailable) {
      try {
        const value = await plugin.isAvailable()
        available = Boolean(value?.available ?? value)
      } catch {
        // ignore plugin diagnostics failures
      }
    }

    if (plugin?.isEnabled) {
      try {
        const value = await plugin.isEnabled()
        enabled = Boolean(value?.enabled ?? value)
      } catch {
        // ignore plugin diagnostics failures
      }
    }

    if (plugin?.addListener && !isAndroidNative) {
      for (const eventName of EVENT_NAMES) {
        try {
          console.debug('SPEARHEAD_BRIDGE listener_registered', bridgeName, eventName)
          const handle = await plugin.addListener(eventName, (payload) => {
            console.debug('SPEARHEAD_BRIDGE plugin_event', payload)
            logNfcTrace(NFC_TRACE.ANDROID_EVENT, payload)
            const tagId = extractTagId(payload)
            emitDiagnostics({
              lastPayloadJson: JSON.stringify(payload || {}),
              lastIntentAction: String(payload?.action || payload?.intentAction || ''),
              lastEventAt: timestampNow(),
            })
            if (!tagId) return
            logAssignDiagBridgeReceipt(tagId, 'capacitor_plugin', payload)
            onTag?.(tagId, payload)
          })
          if (handle?.remove) {
            pluginTagListenerEventName = eventName
            pushRemover(() => handle.remove(), {
              event: `capacitor:${eventName}`,
              attached_to: 'CapacitorPlugin',
              target: bridgeName,
            })
          }
          listenerActive = true
          break
        } catch {
          // try next event name
        }
      }
    } else if (plugin?.addListener && isAndroidNative) {
      nfcDiag(
        'SPEARHEAD_ASSIGN_DIAG phase=bridge_android_native_scan_only',
        'skipped_capacitor_tag_listeners=',
        EVENT_NAMES.join(','),
        'reason=native_SPEARHEAD_NFC_NATIVE_RECEIVE_is_canonical'
      )
    }

    if (plugin?.addListener) {
      for (const eventName of INTENT_EVENT_NAMES) {
        try {
          console.debug('SPEARHEAD_BRIDGE listener_registered', bridgeName, eventName)
          const handle = await plugin.addListener(eventName, (payload) => {
            console.debug('SPEARHEAD_BRIDGE plugin_intent_event', payload)
            emitDiagnostics({
              lastPayloadJson: JSON.stringify(payload || {}),
              lastIntentAction: String(payload?.action || payload?.intentAction || ''),
              lastEventAt: timestampNow(),
            })
          })
          if (handle?.remove)
            pushRemover(() => handle.remove(), {
              event: `capacitor_intent:${eventName}`,
              attached_to: 'CapacitorPlugin',
              target: bridgeName,
            })
        } catch {
          // ignore unsupported intent listener names
        }
      }
    }

    listenerActive = true

    const aliveListener = (event) => {
      let payload = event?.detail || event?.data || {}
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload)
        } catch {
          payload = { raw: payload }
        }
      }
      console.debug('SPEARHEAD_BRIDGE alive_event', payload)
      emitDiagnostics({
        mainActivityAlive: payload?.alive === true,
        adapterState: String(payload?.adapterState || 'unknown'),
        bridgePresent: Boolean(payload?.bridgePresent),
        webViewPresent: Boolean(payload?.webViewPresent),
        lastEventAt: timestampNow(),
      })
    }
    console.debug('SPEARHEAD_BRIDGE listener_registered window main-activity-alive')
    globalThis.addEventListener('main-activity-alive', aliveListener)
    pushRemover(() => globalThis.removeEventListener('main-activity-alive', aliveListener), {
      event: 'main-activity-alive',
      target: 'globalThis',
    })

    const fallbackAliveListener = (event) => {
      let payload = event?.detail || event?.data || {}
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload)
        } catch {
          payload = { raw: payload }
        }
      }
      console.debug('SPEARHEAD_BRIDGE alive_test_event', payload)
      emitDiagnostics({
        mainActivityAlive: payload?.alive === true,
        bridgePresent: true,
        webViewPresent: true,
        lastEventAt: timestampNow(),
      })
    }
    console.debug('SPEARHEAD_BRIDGE listener_registered window main-activity-test')
    globalThis.addEventListener('main-activity-test', fallbackAliveListener)
    pushRemover(() => globalThis.removeEventListener('main-activity-test', fallbackAliveListener), {
      event: 'main-activity-test',
      target: 'globalThis',
    })

    const onResume = () => {
      console.debug('SPEARHEAD_BRIDGE lifecycle resume', timestampNow())
      emitDiagnostics({ appResumed: true, lastLifecycleAt: timestampNow() })
    }
    const onFocus = () => {
      console.debug('SPEARHEAD_BRIDGE lifecycle focus', timestampNow())
      emitDiagnostics({ lastLifecycleAt: timestampNow() })
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onResume()
    }
    globalThis.addEventListener('resume', onResume)
    globalThis.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    pushRemover(() => globalThis.removeEventListener('resume', onResume), {
      event: 'resume',
      target: 'globalThis',
    })
    pushRemover(() => globalThis.removeEventListener('focus', onFocus), {
      event: 'focus',
      target: 'globalThis',
    })
    pushRemover(() => document.removeEventListener('visibilitychange', onVisibility), {
      event: 'visibilitychange',
      target: 'document',
    })

    nfcDiag(
      'SPEARHEAD_ASSIGN_DIAG phase=bridge_event_name_contract',
      'nfc_scan_delivery=',
      'SPEARHEAD_NFC_NATIVE_RECEIVE(json)',
      'window_dom_aux_events=',
      WINDOW_DOM_BRIDGE_EVENTS,
      'capacitor_plugin_tag_events_tried=',
      EVENT_NAMES,
      'capacitor_plugin_tag_listener_registered=',
      pluginTagListenerEventName,
      'bridgeName=',
      bridgeName,
      'ts=',
      timestampNow()
    )

    emitDiagnostics({
      available,
      enabled,
      listenerActive,
      bridgeName,
      pluginLoaded: Boolean(plugin),
      pluginKeys,
      mainActivityAlive: false,
      adapterState: 'unknown',
      bridgePresent: false,
      webViewPresent: false,
      lastLifecycleAt: timestampNow(),
    })

    const MANUAL_TEST_KEY = 'SPEARHEAD_TEST_NFC_EVENT'
    globalThis[MANUAL_TEST_KEY] = () => {
      const payload = {
        tagId: 'TEST_TAG_123',
        uid: 'TEST_TAG_123',
        source: 'manual_debug',
        ts: Date.now(),
      }
      globalThis[NATIVE_RECEIVE_KEY]?.(payload)
      nfcDiag('SPEARHEAD_ASSIGN_DIAG', 'phase=manual_test_dispatch', payload)
    }
    pushRemover(() => {
      try {
        delete globalThis[MANUAL_TEST_KEY]
      } catch {
        globalThis[MANUAL_TEST_KEY] = undefined
      }
    }, {
      event: 'SPEARHEAD_TEST_NFC_EVENT',
      attached_to: 'globalThis',
      target: 'globalThis',
    })
    nfcDiag(
      'SPEARHEAD_ASSIGN_DIAG',
      'phase=manual_test_helper_registered',
      'global=',
      MANUAL_TEST_KEY,
      'invoke=',
      'globalThis.SPEARHEAD_TEST_NFC_EVENT()',
      'ts=',
      timestampNow()
    )

    setBridgeStarted(true)
  }

  function stop() {
    nfcDiag(
      'SPEARHEAD_ASSIGN_DIAG phase=bridge_stop_enter',
      'removers_to_run=',
      removers.length,
      'started_before=',
      started,
      'ts=',
      timestampNow()
    )
    let removed = 0
    while (removers.length) {
      const remove = removers.pop()
      try {
        remove?.()
        removed += 1
      } catch {
        // ignore teardown errors
      }
    }
    started = false
    nfcDiag(
      'SPEARHEAD_ASSIGN_DIAG phase=bridge_stop_done',
      'removers_executed=',
      removed,
      'started_flag_now=',
      started,
      'ts=',
      timestampNow()
    )
    emitDiagnostics({ listenerActive: false })
    setBridgeStarted(false)
  }

  return { start, stop }
}
