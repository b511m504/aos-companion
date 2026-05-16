/**
 * Dev-only runtime causality overlay (opt-in via `globalThis.__SPEARHEAD_RUNTIME_TIMELINE__ = true`).
 */

import { buildRuntimeDebugExport } from '../runtime/runtimeDebugExport.js'
import { getRuntimeReplayActionLog } from '../runtime/runtimeReplayLog.js'

function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/**
 * @param {{ store: { getState: Function, subscribe: Function }, getReplayLog?: () => object[] }} opts
 */
export function mountRuntimeTimelineOverlay(opts) {
  const store = opts?.store
  if (!store || typeof store.getState !== 'function' || typeof store.subscribe !== 'function') return () => {}

  const existing = document.getElementById('spearhead-runtime-timeline')
  if (existing) existing.remove()

  const root = document.createElement('div')
  root.id = 'spearhead-runtime-timeline'
  root.setAttribute('role', 'region')
  root.setAttribute('aria-label', 'Runtime timeline (dev)')
  root.style.cssText = [
    'position:fixed',
    'right:8px',
    'bottom:8px',
    'width:min(440px,calc(100vw - 16px))',
    'max-height:42vh',
    'overflow:auto',
    'z-index:2147483000',
    'font:11px/1.35 ui-monospace,monospace',
    'color:#e8f0ff',
    'background:rgba(12,16,28,.94)',
    'border:1px solid rgba(120,170,255,.35)',
    'border-radius:8px',
    'padding:8px',
    'box-shadow:0 8px 28px rgba(0,0,0,.45)',
  ].join(';')

  const pre = document.createElement('pre')
  pre.style.margin = '0'
  pre.style.whiteSpace = 'pre-wrap'
  pre.style.wordBreak = 'break-word'
  root.appendChild(pre)
  document.body.appendChild(root)

  function tick() {
    const state = store.getState()
    const pack = buildRuntimeDebugExport(state)
    const replay = typeof opts.getReplayLog === 'function' ? opts.getReplayLog() : getRuntimeReplayActionLog()
    const tail = Array.isArray(replay) ? replay.slice(-24) : []
    const lines = [
      '=== Spearhead runtime timeline (dev) ===',
      `screen=${esc(pack.runtimeContext?.packageId || '')} epoch=${pack.runtimeEpoch} seq=${pack.runtimeContext?.actionSequence}`,
      `hash(shape)=${esc(pack.hashes?.current || '')}`,
      `effects pending=${pack.effects?.pending ?? ''} exec=${pack.effects?.executed ?? ''} sim=${pack.effects?.simulated ?? ''} sup=${pack.effects?.suppressed ?? ''}`,
      `journal total=${pack.actions?.length ?? 0} snapshots=${pack.snapshots?.length ?? 0}`,
      `gameplay phase=${esc(pack.gameplay?.phase || '')} turn=${pack.gameplay?.turn ?? ''} entities=${pack.gameplay?.entityCount ?? ''}`,
      `gameplay timeline tail: ${(pack.gameplayTimeline || []).map((e) => `${e.seq}:${e.type}`).join(', ')}`,
      '--- last journal (8) ---',
      ...((pack.actions || []).slice(-8).map((e) =>
        JSON.stringify({
          t: e.t,
          outcome: e.outcome,
          kind: e.kind,
          type: e.type,
          reason: e.reason,
          tx: e.transactionId,
        })
      )),
      '--- replay log tail ---',
      ...tail.map((e) => JSON.stringify(e)),
    ]
    pre.textContent = lines.join('\n')
  }

  const unsub = store.subscribe(tick)
  tick()
  return () => {
    try {
      unsub()
    } catch {
      /* ignore */
    }
    root.remove()
  }
}
