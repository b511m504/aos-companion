/**
 * Android WebView interaction diagnostics — minimal DOM probes + propagation logging.
 * Does not affect gameplay; enable via `?interactionLab=1` or the interaction-test screen.
 */

let interactionLabTapCounter = 0
let wireMountGeneration = 0

export function getInteractionLabTapCounter() {
  return interactionLabTapCounter
}

export function bumpInteractionLabCounter(reason = '') {
  interactionLabTapCounter += 1
  console.warn('SPEARHEAD_INTERACTION_LAB_BUMP', reason, interactionLabTapCounter)
}

export function interactionLabActive(getState) {
  try {
    const u = typeof location !== 'undefined' ? new URL(location.href) : null
    if (u?.searchParams.get('interactionLab') === '1') return true
    if (u?.searchParams.get('interactionTest') === '1') return true
    if (globalThis.__SPEARHEAD_INTERACTION_LAB_URL__ === true) return true
  } catch {
    /* ignore */
  }
  const s = typeof getState === 'function' ? getState() : null
  return s?.currentScreen === 'interaction-test'
}

export function shouldDisableActionDedupe(getState) {
  try {
    const u = typeof location !== 'undefined' ? new URL(location.href) : null
    if (u?.searchParams.get('noDedupe') === '1') return true
  } catch {
    /* ignore */
  }
  if (globalThis.__SPEARHEAD_DISABLE_ACTION_DEDUPE__ === true) return true
  return interactionLabActive(getState)
}

export function shouldLogVerboseHandleAction(getState) {
  try {
    const u = typeof location !== 'undefined' ? new URL(location.href) : null
    if (u?.searchParams.get('verboseActions') === '1') return true
  } catch {
    /* ignore */
  }
  return interactionLabActive(getState)
}

/** Short CSS audit for hit-testing / overlay debugging */
export function describeHitTargetCss(el) {
  if (!(el instanceof Element)) return '(not-element)'
  try {
    const cs = window.getComputedStyle(el)
    const r = el.getBoundingClientRect?.()
    return {
      tag: el.tagName,
      id: el.id || '',
      className: typeof el.className === 'string' ? el.className.slice(0, 120) : '',
      pointerEvents: cs.pointerEvents,
      zIndex: cs.zIndex,
      position: cs.position,
      opacity: cs.opacity,
      transform: cs.transform,
      filter: cs.filter,
      backdropFilter: cs.backdropFilter,
      overflow: cs.overflow,
      contain: cs.contain,
      rect: r
        ? { x: r.x, y: r.y, w: r.width, h: r.height }
        : null,
    }
  } catch (e) {
    return { error: String(e?.message ?? e) }
  }
}

function propagationChain(el, max = 10) {
  const out = []
  let n = el
  let i = 0
  while (n && i < max) {
    const id = n.id ? `#${n.id}` : ''
    const cls =
      typeof n.className === 'string' && n.className
        ? `.${n.className.trim().split(/\s+/).slice(0, 3).join('.')}`
        : ''
    out.push(`${n.nodeName}${id}${cls}`)
    n = n.parentElement
    i += 1
  }
  return out.join(' ← ')
}

let globalCaptureMounted = false

/**
 * Logs touch/pointer/click on document + body (capture) when lab URL or interaction-test screen is active.
 */
export function mountInteractionLabGlobalCapture(getState) {
  if (globalCaptureMounted) return
  globalCaptureMounted = true

  const types = ['touchstart', 'touchend', 'pointerdown', 'pointerup', 'click']

  const logStage = (origin, ev) => {
    if (!interactionLabActive(getState)) return
    const t = ev.target
    const chain = t instanceof Element ? propagationChain(t) : String(t)
    const touch = ev.changedTouches?.[0]
    const px = touch?.clientX ?? ev.clientX
    const py = touch?.clientY ?? ev.clientY
    let topEl = null
    let topDesc = ''
    if (typeof px === 'number' && typeof py === 'number' && Number.isFinite(px) && Number.isFinite(py)) {
      try {
        topEl = document.elementFromPoint(px, py)
        topDesc = topEl instanceof Element ? propagationChain(topEl) : String(topEl)
      } catch (e) {
        topDesc = `elementFromPoint_error:${e?.message ?? e}`
      }
    }
    console.warn('SPEARHEAD_INTERACTION_LAB_CHAIN', {
      origin,
      type: ev.type,
      defaultPrevented: ev.defaultPrevented,
      propagationStopped: ev.cancelBubble,
      chain,
      elementFromPoint: topDesc,
      hitCss: topEl instanceof Element ? describeHitTargetCss(topEl) : null,
    })
  }

  for (const type of types) {
    document.addEventListener(type, (ev) => logStage(`document_capture:${type}`, ev), true)
    document.addEventListener(type, (ev) => logStage(`document_bubble:${type}`, ev), false)
  }

  const body = document.body
  if (body) {
    for (const type of types) {
      body.addEventListener(type, (ev) => logStage(`body_capture:${type}`, ev), true)
    }
  }

  console.warn('SPEARHEAD_INTERACTION_LAB', 'mountInteractionLabGlobalCapture', 'listeners_installed')
}

export function logWireDelegatedDataActionsMount(root, shell, getState) {
  wireMountGeneration += 1
  const prev = globalThis.__SPEARHEAD_LAST_WIRED_SHELL__
  const shellId = shell?.getAttribute?.('data-spearhead-wire-id')
  const staleHint =
    prev &&
    prev.generation !== wireMountGeneration - 1 &&
    prev.node &&
    prev.node !== shell
      ? 'new_shell_replaced_previous'
      : 'first_or_same_generation'

  globalThis.__SPEARHEAD_LAST_WIRED_SHELL__ = {
    generation: wireMountGeneration,
    at: new Date().toISOString(),
    rootIsSameAsDocumentApp: root === document.getElementById('app'),
    rootChildCount: root?.childElementCount,
    shellFound: Boolean(shell),
    shellNode: shell,
    shellIdentity: shell ? `${shell.tagName}.${shell.className}`.slice(0, 160) : '',
    shellWireId: shellId,
    staleHint,
    screen: getState?.()?.currentScreen,
  }

  console.warn('SPEARHEAD_INTERACTION_LAB_WIRE', globalThis.__SPEARHEAD_LAST_WIRED_SHELL__)
}

/** Assign once so delegated shell can be found after each render */
export function stampShellForWireDiagnostics(shell) {
  if (!shell) return
  if (!shell.getAttribute('data-spearhead-wire-id')) {
    shell.setAttribute('data-spearhead-wire-id', `wire_${wireMountGeneration}_${Date.now().toString(36)}`)
  }
}

/**
 * Wire native handlers on #test-button after innerHTML replace (must run each render).
 */
export function wireInteractionLabNativeProbes(root, requestRender) {
  const btn = root.querySelector('#test-button')
  if (!btn || btn.dataset.spearheadLabNativeWired === '1') return
  btn.dataset.spearheadLabNativeWired = '1'

  const bump = (label) => {
    bumpInteractionLabCounter(label)
    if (typeof requestRender === 'function') requestRender()
  }

  btn.onclick = (ev) => {
    console.warn('SPEARHEAD_INTERACTION_LAB', 'native_onclick', ev.type)
    bump('native_onclick')
  }
  btn.addEventListener(
    'click',
    (ev) => {
      console.warn('SPEARHEAD_INTERACTION_LAB', 'native_addEventListener_click', ev.type)
      bump('native_listener_click')
    },
    false
  )
  btn.addEventListener(
    'touchend',
    (ev) => {
      console.warn('SPEARHEAD_INTERACTION_LAB', 'native_addEventListener_touchend', ev.type)
      bump('native_listener_touchend')
    },
    { passive: true }
  )
}
