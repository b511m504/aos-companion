/**
 * Strict full-stack package-card interaction trace (Android WebView / Capacitor).
 * Remove or gate once the failure stage is identified.
 */

const PREFIX = 'CARD_TRACE'

function ts() {
  return { t: Date.now(), iso: new Date().toISOString() }
}

/** Walk up for approximate stacking / compositing hint */
export function nearestStackingContextHint(el, maxDepth = 14) {
  if (!el || typeof el !== 'object') return null
  let cur = el
  let depth = 0
  while (cur && depth < maxDepth) {
    try {
      const cs = window.getComputedStyle(cur)
      const tr = cs.transform && cs.transform !== 'none'
      const filt = cs.filter && cs.filter !== 'none'
      const op = parseFloat(cs.opacity)
      const iso =
        cs.isolation === 'isolate' ||
        tr ||
        filt ||
        (Number.isFinite(op) && op < 1) ||
        cs.position === 'fixed' ||
        cs.position === 'sticky' ||
        Number.parseInt(cs.zIndex, 10) !== 0
      if (iso) {
        return {
          depth,
          tag: cur.tagName,
          id: cur.id || '',
          className: String(cur.className || '').slice(0, 120),
          zIndex: cs.zIndex,
          transform: tr,
          opacity: cs.opacity,
          position: cs.position,
        }
      }
    } catch {
      break
    }
    cur = cur.parentElement
    depth += 1
  }
  return null
}

/**
 * Rich DOM/event payload for propagation diagnostics.
 * @param {Element | null} el
 * @param {Event | null} ev
 */
export function domInteractionPayload(el, ev) {
  let cx = 0
  let cy = 0
  try {
    if (ev?.changedTouches?.[0]) {
      cx = ev.changedTouches[0].clientX
      cy = ev.changedTouches[0].clientY
    } else if (ev?.clientX != null) {
      cx = ev.clientX
      cy = ev.clientY
    }
  } catch {
    /* ignore */
  }

  let pe = ''
  let zi = ''
  let op = ''
  let vis = ''
  let rect = null
  let outerSnippet = ''
  try {
    if (el) {
      const cs = window.getComputedStyle(el)
      pe = cs.pointerEvents
      zi = cs.zIndex
      op = cs.opacity
      vis = cs.visibility
      const r = el.getBoundingClientRect?.()
      rect = r
        ? { x: r.x, y: r.y, w: r.width, h: r.height, top: r.top, left: r.left }
        : null
      outerSnippet = (el.outerHTML || '').slice(0, 420)
    }
  } catch {
    /* ignore */
  }

  return {
    ...ts(),
    targetTag: el?.tagName ?? '(null)',
    className: el ? String(el.className || '').slice(0, 200) : '',
    dataset: el && el.dataset ? { ...el.dataset } : {},
    pointerEvents: pe,
    coordinates: { clientX: cx, clientY: cy },
    zIndex: zi,
    opacity: op,
    visibility: vis,
    boundingRect: rect,
    outerHTMLSnippet: outerSnippet,
    stackingHint: el ? nearestStackingContextHint(el) : null,
  }
}

function basePayload(storeGetter, packageId, extra = {}) {
  const s = typeof storeGetter === 'function' ? storeGetter() : null
  const st = s || {}
  return {
    ...ts(),
    packageId: String(packageId || ''),
    action: extra.action != null ? String(extra.action) : '',
    currentScreen: st.currentScreen ?? '',
    nextScreen: extra.nextScreen != null ? String(extra.nextScreen) : '',
    appMode: st.appMode ?? '',
    runtimeReady: extra.runtimeReady,
    eventType: extra.eventType != null ? String(extra.eventType) : '',
    ...extra,
  }
}

let lastCompletedStage = '(boot)'
let lastFailureStage = '(none)'
let lastCurrentAction = ''

/** @param {string} stage */
export function cardTrace(stage, storeGetter, payload = {}) {
  const line = { stage, ...basePayload(storeGetter, payload.packageId, payload) }
  console.warn(PREFIX, stage, line)
  lastCompletedStage = stage
  updateHudLive(storeGetter)
}

export function cardTraceFailure(stage, storeGetter, payload = {}) {
  lastFailureStage = stage
  cardTrace(stage, storeGetter, { ...payload, traceKind: 'failure' })
}

/** Mark current user intent action for HUD */
export function setTraceCurrentAction(action, value = '') {
  lastCurrentAction = `${action}${value ? `:${String(value).slice(0, 40)}` : ''}`
  updateHudLive(() => storeSnap())
}

export function cardTraceRuntime(stage, storeGetter, detail) {
  cardTrace(stage, storeGetter, {
    packageId: '',
    runtimeReady: detail?.runtimeReady,
    bindableCount: detail?.bindableCount,
    bindableEntityIds: detail?.bindableEntityIds,
    totalEntities: detail?.totalEntities,
    reason: detail?.reason,
    blockingMissing: detail?.blockingMissing,
  })
}

let tapCounter = 0

export function bumpTapCounter() {
  tapCounter += 1
  updateHudLive(() => storeSnap())
  return tapCounter
}

function ensureHud() {
  if (typeof document === 'undefined') return null
  let el = document.getElementById('spearhead-card-tap-hud')
  if (el) return el
  el = document.createElement('div')
  el.id = 'spearhead-card-tap-hud'
  el.setAttribute('role', 'status')
  el.innerHTML = `
    <div class="spearhead-card-tap-hud__inner">
      <div class="spearhead-card-tap-hud__row"><span class="spearhead-card-tap-hud__label">Taps</span><strong class="spearhead-card-tap-hud__count">0</strong></div>
      <div class="spearhead-card-tap-hud__row"><span class="spearhead-card-tap-hud__k">Screen</span><span class="spearhead-card-tap-hud__screen">—</span></div>
      <div class="spearhead-card-tap-hud__row"><span class="spearhead-card-tap-hud__k">Action</span><span class="spearhead-card-tap-hud__action">—</span></div>
      <div class="spearhead-card-tap-hud__row"><span class="spearhead-card-tap-hud__k">Last OK</span><span class="spearhead-card-tap-hud__ok">—</span></div>
      <div class="spearhead-card-tap-hud__row"><span class="spearhead-card-tap-hud__k">Last fail</span><span class="spearhead-card-tap-hud__fail">—</span></div>
      <div class="spearhead-card-tap-hud__row spearhead-card-tap-hud__row--muted"><span class="spearhead-card-tap-hud__last"></span></div>
    </div>`
  document.body.appendChild(el)
  return el
}

function storeSnap() {
  try {
    return typeof globalThis.__SPEARHEAD_STORE_GET__ === 'function'
      ? globalThis.__SPEARHEAD_STORE_GET__()
      : {}
  } catch {
    return {}
  }
}

function updateHudLive(storeGetter) {
  const el = ensureHud()
  if (!el) return
  const c = el.querySelector('.spearhead-card-tap-hud__count')
  if (c) c.textContent = String(tapCounter)
  const scr = el.querySelector('.spearhead-card-tap-hud__screen')
  const act = el.querySelector('.spearhead-card-tap-hud__action')
  const ok = el.querySelector('.spearhead-card-tap-hud__ok')
  const fail = el.querySelector('.spearhead-card-tap-hud__fail')
  let screen = '—'
  try {
    const g =
      typeof storeGetter === 'function' ? storeGetter() : storeSnap()
    screen = g?.currentScreen ?? screen
  } catch {
    /* ignore */
  }
  if (scr) scr.textContent = String(screen).slice(0, 36)
  if (act) act.textContent = lastCurrentAction.slice(0, 48)
  if (ok) ok.textContent = lastCompletedStage.slice(0, 56)
  if (fail) fail.textContent = lastFailureStage.slice(0, 56)
}

export function setHudLastLine(text) {
  const el = ensureHud()
  if (!el) return
  const last = el.querySelector('.spearhead-card-tap-hud__last')
  if (last) last.textContent = String(text || '').slice(0, 200)
}

export function flashTapTarget(el) {
  if (!el || typeof el !== 'object') return
  try {
    el.classList.add('spearhead-card-tap-flash')
    window.setTimeout(() => {
      try {
        el.classList.remove('spearhead-card-tap-flash')
      } catch {
        /* ignore */
      }
    }, 420)
  } catch {
    /* ignore */
  }
}

let toastTimer = null

export function showTapToast(message) {
  if (typeof document === 'undefined') return
  let t = document.getElementById('spearhead-card-tap-toast')
  if (!t) {
    t = document.createElement('div')
    t.id = 'spearhead-card-tap-toast'
    t.className = 'spearhead-card-tap-toast'
    t.setAttribute('role', 'status')
    document.body.appendChild(t)
  }
  t.textContent = String(message || '')
  t.classList.add('spearhead-card-tap-toast--visible')
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    try {
      t.classList.remove('spearhead-card-tap-toast--visible')
    } catch {
      /* ignore */
    }
  }, 2200)
}

/** Demo / package tiles that load a roster via `select-package`. */
export const PACKAGE_CARD_HIT_SELECTOR =
  '[data-action="select-package"],button.pkg-browser-card,button.launcher-demo-card,button.launcher-recent-row'

/**
 * Log full DOM provenance for each candidate card control.
 */
export function inspectRenderedPackageCards(root, storeGetter) {
  if (typeof document === 'undefined' || !root?.querySelectorAll) return
  const nodes = root.querySelectorAll(PACKAGE_CARD_HIT_SELECTOR)
  let i = 0
  for (const el of nodes) {
    i += 1
    const dip = domInteractionPayload(el, null)
    console.warn(PREFIX, 'CARD_DOM_INSPECT', {
      ...dip,
      index: i,
      dataAction: el.getAttribute('data-action'),
      dataValue: el.getAttribute('data-value'),
      disabled: Boolean(el.disabled),
      ariaDisabled: el.getAttribute('aria-disabled'),
      currentScreen: storeGetter()?.currentScreen,
    })
  }
}

let renderSeq = 0

export function logRenderBegin(storeGetter, opts = {}) {
  renderSeq += 1
  const s = storeGetter?.()
  cardTrace('CARD_RENDER_BEGIN', storeGetter, {
    packageId: '',
    renderSeq,
    targetScreen: opts.targetScreen ?? s?.currentScreen,
    appMode: s?.appMode,
    activeDomRoot: opts.activeDomRoot ?? '#app',
  })
}

export function logRenderComplete(storeGetter, opts = {}) {
  const s = storeGetter?.()
  cardTrace('CARD_RENDER_COMPLETE', storeGetter, {
    packageId: '',
    renderSeq,
    renderTargetScreen: opts.renderTargetScreen ?? s?.currentScreen,
    renderInnerRan: opts.renderInnerRan !== false,
    currentScreen: s?.currentScreen,
    appMode: s?.appMode,
    runtimeTableMounted: Boolean(opts.runtimeTableMounted),
    matchScreenSelectorHit: Boolean(opts.matchScreenSelectorHit),
  })
}
