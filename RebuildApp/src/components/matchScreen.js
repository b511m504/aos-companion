/**
 * Tabletop companion match view — HUD, forces, objectives, battle log, NFC registration.
 */

import { deriveScanUxPresentation } from '../presentation/scanUx.js'
import { celebrationLineForTimelineEvent } from '../presentation/playerMessages.js'
import { loadSessionSnapshot } from '../services/sessionSnapshot.js'

const OBJECTIVE_LABELS = {
  obj_alpha: 'Primary objective',
  obj_beta: 'Secondary objective',
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Last few characters — enough to tell tags apart without dumping the full UID. */
function chipFingerprint(uid) {
  const u = String(uid || '').replace(/\s/g, '')
  if (!u) return '—'
  if (u.length <= 10) return u
  return `…${u.slice(-6)}`
}

function unitDisplayName(state, entityId) {
  const id = String(entityId || '').trim()
  if (!id) return '—'
  const units = state.activeRoster?.units
  if (Array.isArray(units)) {
    const u = units.find((x) => x.id === id)
    if (u?.name) return String(u.name)
  }
  const ru = state.runtimeUnits?.[id]
  if (ru?.name) return String(ru.name)
  return id
}

function feedbackHuman(kind) {
  const k = String(kind || '')
  if (k === 'duplicate_scan') return 'Same piece — already counted'
  if (k === 'unknown_registry') return 'New tag — link it below'
  if (k === 'scan_resolved') return 'Piece recognized'
  if (k === 'registered') return 'Tag linked'
  return k.replace(/_/g, ' ') || 'Notice'
}

function formatBattleLogEntry(e, state) {
  const ty = String(e.type || '')
  const p = e.payload && typeof e.payload === 'object' ? e.payload : {}
  if (ty === 'GAMEPLAY_ENTITY_SCAN_DETECTED') {
    const ent = p.resolvedEntityId ? String(p.resolvedEntityId) : null
    if (ent) {
      const name = unitDisplayName(state, ent)
      return `Scan · ${name}`
    }
    return `Scan · link this chip to a piece`
  }
  if (ty === 'GAMEPLAY_OBJECTIVE_CAPTURE_STARTED') {
    const oid = String(p.objectiveId || '')
    const label = OBJECTIVE_LABELS[oid] || 'Objective'
    return `${label} · contest started`
  }
  if (ty === 'GAMEPLAY_OBJECTIVE_CAPTURE_COMPLETED') {
    const oid = String(p.objectiveId || '')
    const label = OBJECTIVE_LABELS[oid] || 'Objective'
    return `${label} · secured`
  }
  if (ty === 'GAMEPLAY_ENTITY_ENTERED_ZONE') {
    const who = unitDisplayName(state, p.entityId)
    return `${who} · entered objective zone`
  }
  if (ty === 'GAMEPLAY_PHASE_CHANGED') {
    return `Phase · ${p.phase || '—'}`
  }
  if (ty === 'GAMEPLAY_TURN_ADVANCED') {
    return `Turn · ${p.turn ?? '—'}`
  }
  if (ty === 'GAMEPLAY_ROUND_ADVANCED') {
    return `Round · ${p.round ?? '—'}`
  }
  if (ty === 'GAMEPLAY_SCENARIO_APPLIED') {
    return `Demo table ready — two objectives seeded`
  }
  if (ty === 'GAMEPLAY_ENTITY_REGISTERED') {
    return `Piece linked and ready to scan`
  }
  if (ty === 'GAMEPLAY_UI_SET') return null
  if (ty === 'gameplay_validation_failed') return `Action blocked`
  return ty.replace(/^GAMEPLAY_/, '').replace(/_/g, ' ') || 'Event'
}

function renderObjectiveCards(objectives, state) {
  const o = objectives && typeof objectives === 'object' ? objectives : {}
  const keys = Object.keys(o)
  if (!keys.length) {
    return `<p class="match-objectives__empty">No objectives in this scenario.</p>`
  }
  return keys
    .map((k) => {
      const row = o[k] && typeof o[k] === 'object' ? o[k] : {}
      const label = OBJECTIVE_LABELS[k] || `Objective`
      const status = String(row.status || row.capturePhase || 'neutral')
      const owner = String(row.ownerEntityId || row.owner || '').trim()
      const progress = Math.min(100, Math.max(0, Number(row.progress) || 0))
      const ownerLabel = owner ? unitDisplayName(state, owner) : ''
      const ownerLine = ownerLabel ? `Controlled by <strong>${escapeHtml(ownerLabel)}</strong>` : 'Contested — no controller'
      const badge =
        status === 'captured'
          ? 'match-badge match-badge--secure'
          : status === 'started' || row.capturePhase === 'started'
            ? 'match-badge match-badge--active'
            : 'match-badge match-badge--neutral'
      const badgeText =
        status === 'captured' ? 'Secured' : row.capturePhase === 'started' ? 'Contested' : 'Open'
      return `
        <article class="match-objective-card" data-objective-id="${escapeHtml(k)}">
          <header class="match-objective-card__head">
            <h4 class="match-objective-card__title">${escapeHtml(label)}</h4>
            <span class="${badge}">${escapeHtml(badgeText)}</span>
          </header>
          <p class="match-objective-card__owner">${ownerLine}</p>
          <div class="match-progress" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">
            <div class="match-progress__fill" style="width:${progress}%"></div>
          </div>
          <p class="match-objective-card__meta">${escapeHtml(progress)}% control</p>
        </article>`
    })
    .join('')
}

function renderEntityPanels(state, opts = {}) {
  const units = state.activeRoster?.units
  const resumeAvailable = opts.resumeAvailable === true
  if (!Array.isArray(units) || !units.length) {
    return `<div class="match-forces__empty match-forces__empty--onboarding">
      <p class="match-forces__lead">Nothing on the table yet</p>
      <p class="match-forces__hint">Scan an NFC tag to register a unit — it shows up here immediately. Or start with a demo or load a list.</p>
      <div class="match-forces__cta">
        <button type="button" class="match-btn match-btn--primary" data-action="match-bootstrap-demo">Start quick demo match</button>
        <button type="button" class="match-btn match-btn--soft" data-action="go-package-selection">Load roster</button>
        ${
          resumeAvailable
            ? `<button type="button" class="match-btn match-btn--ghost" data-action="match-resume-table">Resume last session</button>`
            : ''
        }
      </div>
      <p class="match-forces__micro">Unknown chips open quick assign — no roster required.</p>
    </div>`
  }
  const selected = String(state.selectedEntityId || '')
  const ru = state.runtimeUnits || {}
  return `<div class="match-forces__grid">
    ${units
      .map((u) => {
        const id = String(u.id)
        const r = ru[id] || {}
        const isSel = selected === id
        const wCur = r.woundsCurrent != null ? r.woundsCurrent : u.wounds
        const wMax = r.woundsMax != null ? r.woundsMax : u.wounds
        const fx = (r.statusEffects || []).length
        return `
        <article class="match-entity-card${isSel ? ' match-entity-card--active' : ''}" data-entity-id="${escapeHtml(id)}" data-entity-card="${escapeHtml(id)}">
          <div class="match-entity-card__main">
            <h4 class="match-entity-card__name">${escapeHtml(u.name || id)}</h4>
            <p class="match-entity-card__ref" aria-label="Unit reference">Ref · ${escapeHtml(chipFingerprint(id))}</p>
            <div class="match-entity-card__stats">
              <span class="match-stat">Wounds <strong>${escapeHtml(String(wCur))}</strong> / ${escapeHtml(String(wMax))}</span>
              <span class="match-stat">${r.activated ? 'Activated' : 'Ready'}</span>
              <span class="match-stat">${r.destroyed ? 'Out of action' : 'In play'}</span>
            </div>
            ${
              fx
                ? `<p class="match-entity-card__fx">${escapeHtml((r.statusEffects || []).join(' · '))}</p>`
                : ''
            }
          </div>
          <div class="match-entity-card__actions" aria-label="Quick adjustments">
            <button type="button" class="match-icon-btn" data-action="runtime-wound-down" data-value="${escapeHtml(id)}" title="Wound down">−</button>
            <button type="button" class="match-icon-btn" data-action="runtime-wound-up" data-value="${escapeHtml(id)}" title="Wound up">+</button>
            <button type="button" class="match-chip-btn" data-action="runtime-toggle-activated" data-value="${escapeHtml(id)}">Act</button>
            <button type="button" class="match-chip-btn" data-action="runtime-toggle-destroyed" data-value="${escapeHtml(id)}">Casualty</button>
          </div>
        </article>`
      })
      .join('')}
  </div>`
}

function renderBattleLog(timeline, state) {
  const t = Array.isArray(timeline) ? timeline : []
  const lines = []
  for (let i = t.length - 1; i >= 0 && lines.length < 24; i -= 1) {
    const text = formatBattleLogEntry(t[i], state)
    if (text) lines.push({ text })
  }
  if (!lines.length) {
    return `<p class="match-log__empty">Scans, objectives, and phase changes show up here.</p>`
  }
  return `<ul class="match-log__list">
    ${lines.map((L) => `<li class="match-log__item">${escapeHtml(L.text)}</li>`).join('')}
  </ul>`
}

function renderScanHud(state) {
  const ux = deriveScanUxPresentation(state)
  const g = state.gameplay || {}
  const last = g.lastScan
  const receipt = String(state.nfcScanReceiptState || '')
  const resolved = state.runtimeResolvedUnit
  const tag = state.runtimeResolvedTag

  if (ux.phase === 'processing') {
    return `
    <div class="match-scan-hud match-scan-hud--processing match-scan-hud--pulse-ring" role="status">
      <div class="match-scan-hud__icon" aria-hidden="true"></div>
      <div class="match-scan-hud__text">
        <p class="match-scan-hud__headline">${escapeHtml(ux.headline)}</p>
        <p class="match-scan-hud__sub">${escapeHtml(ux.sub)}</p>
      </div>
    </div>`
  }
  if (ux.phase === 'disconnected') {
    return `
    <div class="match-scan-hud match-scan-hud--warn" role="alert">
      <div class="match-scan-hud__icon" aria-hidden="true"></div>
      <div class="match-scan-hud__text">
        <p class="match-scan-hud__headline">${escapeHtml(ux.headline)}</p>
        <p class="match-scan-hud__sub">${escapeHtml(ux.sub)}</p>
      </div>
    </div>`
  }

  let headline = ux.headline
  let sub = ux.sub
  let tone = 'match-scan-hud--idle'

  if (last?.uid && last.entityId) {
    tone = 'match-scan-hud--ok match-scan-hud--pulse-ring'
    headline = unitDisplayName(state, last.entityId)
    sub = 'This model is live — objectives & log update below.'
  } else if (last?.uid && !last.entityId) {
    tone = 'match-scan-hud--warn'
    headline = 'New chip'
    sub = 'Finish linking in the dialog.'
  } else if (resolved && tag && !last?.uid) {
    tone = 'match-scan-hud--ok'
    headline = String(resolved.name || resolved.id)
    sub = 'Aligned with your last tap.'
  } else if (receipt === 'duplicate_ignored' || receipt === 'package_scan_ignored') {
    tone = 'match-scan-hud--muted'
    headline = 'Already counted'
    sub = ux.sub
  } else if (ux.phase === 'success') {
    tone = 'match-scan-hud--ok match-scan-hud--pulse-ring'
    headline = ux.headline
    sub = ux.sub
  } else if (ux.phase === 'duplicate') {
    tone = 'match-scan-hud--muted'
    headline = ux.headline
    sub = ux.sub
  } else if (ux.phase === 'unknown_tag') {
    tone = 'match-scan-hud--warn'
    headline = ux.headline
    sub = ux.sub
  } else if (ux.phase === 'rejected') {
    tone = 'match-scan-hud--warn'
    headline = ux.headline
    sub = ux.sub
  }

  return `
    <div class="match-scan-hud ${tone}" role="status" aria-live="polite">
      <div class="match-scan-hud__icon" aria-hidden="true"></div>
      <div class="match-scan-hud__text">
        <p class="match-scan-hud__headline">${escapeHtml(headline)}</p>
        <p class="match-scan-hud__sub">${escapeHtml(sub)}</p>
      </div>
    </div>`
}

function renderVpScoreboard(objectives) {
  const o = objectives && typeof objectives === 'object' ? objectives : {}
  const keys = Object.keys(o)
  const secured = keys.filter((k) => {
    const row = o[k]
    return row && (String(row.status) === 'captured' || String(row.capturePhase) === 'completed')
  }).length
  const total = keys.length
  const score = total ? `${secured} / ${total}` : '—'
  return `<div class="match-scoreboard" role="group" aria-label="Objectives held">
    <span class="match-scoreboard__kicker">Battlefield</span>
    <span class="match-scoreboard__value">${escapeHtml(score)} objectives secured</span>
  </div>`
}

function renderArmyIdentity(state) {
  const meta = state.runtimeRegistry?.metadata && typeof state.runtimeRegistry.metadata === 'object' ? state.runtimeRegistry.metadata : {}
  const faction = String(meta.factionName || meta.faction || meta.listFaction || '').trim()
  const list = String(state.activeRoster?.name || meta.listName || '').trim()
  const parts = [faction, list].filter(Boolean)
  if (!parts.length) return ''
  return `<p class="match-army-id">${escapeHtml(parts.join(' · '))}</p>`
}

function renderCelebration(state) {
  const tl = state.gameplay?.timeline
  if (!Array.isArray(tl) || tl.length === 0) return ''
  const last = tl[tl.length - 1]
  const worthy = new Set([
    'GAMEPLAY_OBJECTIVE_CAPTURE_COMPLETED',
    'GAMEPLAY_OBJECTIVE_CAPTURE_STARTED',
    'GAMEPLAY_ROUND_ADVANCED',
    'GAMEPLAY_PHASE_CHANGED',
  ])
  if (!worthy.has(last.type)) return ''
  const line = celebrationLineForTimelineEvent(last, {
    unitName: (id) => unitDisplayName(state, id),
  })
  if (!line) return ''
  return `<div class="match-celebration" role="status" aria-live="polite">${escapeHtml(line)}</div>`
}

function renderScanSpotlight(state) {
  const last = state.gameplay?.lastScan
  if (!last?.entityId) return ''
  const name = unitDisplayName(state, last.entityId)
  return `
    <div class="match-spotlight" aria-live="polite">
      <span class="match-spotlight__label">Focus</span>
      <span class="match-spotlight__name">${escapeHtml(name)}</span>
    </div>`
}

/**
 * @param {object} state
 * @param {{ showDevScan?: boolean }} opts
 */
export function renderMatchScreen(state, opts = {}) {
  const resumeAvailable = Boolean(loadSessionSnapshot()?.packageKey)
  const g = state.gameplay && typeof state.gameplay === 'object' ? state.gameplay : {}
  const ui = g.ui || {}
  const fb = ui.feedback
  const regOpen = Boolean(ui.registerOpen && ui.registerUid)
  const uidForReg = String(ui.registerUid || '')
  const rosterName = state.activeRoster?.name || 'Your list'
  const phase = String(g.phase || '—')
  const turn = g.turn ?? '—'
  const round = g.round ?? '—'
  const player = String(g.activePlayerId || '—')

  const toast =
    fb && typeof fb === 'object'
      ? `<div class="match-toast match-toast--${escapeHtml(String(fb.kind || 'info'))} match-toast--enter" role="status">
          <span class="match-toast__msg">${escapeHtml(feedbackHuman(fb.kind))}</span>
          <button type="button" class="match-toast__dismiss" data-action="gameplay-feedback-dismiss" aria-label="Dismiss">×</button>
        </div>`
      : ''

  const registerModal = regOpen
    ? `<div class="match-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="match-reg-title">
        <div class="match-modal">
          <h3 id="match-reg-title" class="match-modal__title">Link this tag</h3>
          <p class="match-modal__lead">We don’t know this chip yet. Choose what it represents on the table and who owns it.</p>
          <p class="match-modal__fingerprint" title="Short chip reference">Chip ${escapeHtml(chipFingerprint(uidForReg))}</p>
          <form id="gameplay-register-form" class="match-modal__form">
            <input type="hidden" name="registerUid" value="${escapeHtml(uidForReg)}" />
            <label class="match-field">What is it?
              <select name="entityType" required>
                <option value="miniature">Model / unit</option>
                <option value="terrain">Terrain</option>
                <option value="objective">Objective marker</option>
                <option value="token">Token</option>
              </select>
            </label>
            <label class="match-field">Owner
              <input name="ownerId" type="text" autocomplete="off" placeholder="Player name or id" value="${escapeHtml(String(g.activePlayerId || 'p1'))}" />
            </label>
            <label class="match-field">Label (optional)
              <input name="displayName" type="text" autocomplete="off" placeholder="Name on the table" />
            </label>
            <div class="match-modal__actions">
              <button type="button" class="match-btn match-btn--ghost" data-action="gameplay-register-dismiss">Not now</button>
              <button type="button" class="match-btn match-btn--primary" data-action="gameplay-register-submit">Save link</button>
            </div>
          </form>
        </div>
      </div>`
    : ''

  const devScan =
    opts.showDevScan === true
      ? `<button type="button" class="match-btn match-btn--ghost match-toolbar__dev" data-action="simulate-runtime-scan">Simulate scan</button>`
      : ''

  const uxPhase = deriveScanUxPresentation(state).phase

  return `
    <div class="match-screen match-screen--table" data-scan-ux="${escapeHtml(uxPhase)}">
      <header class="match-screen__header">
        <div class="match-screen__title-block">
          <p class="match-screen__eyebrow">Live match</p>
          <h2 class="match-screen__title">${escapeHtml(rosterName)}</h2>
          ${renderArmyIdentity(state)}
          ${renderVpScoreboard(g.objectives)}
        </div>
        <div class="match-hud" role="group" aria-label="Turn summary">
          <div class="match-hud__chip match-hud__chip--phase">
            <span class="match-hud__label">Phase</span>
            <span class="match-hud__value">${escapeHtml(phase)}</span>
          </div>
          <div class="match-hud__chip">
            <span class="match-hud__label">Round</span>
            <span class="match-hud__value">${escapeHtml(String(round))}</span>
          </div>
          <div class="match-hud__chip">
            <span class="match-hud__label">Turn</span>
            <span class="match-hud__value">${escapeHtml(String(turn))}</span>
          </div>
          <div class="match-hud__chip match-hud__chip--player">
            <span class="match-hud__label">Active</span>
            <span class="match-hud__value">${escapeHtml(player)}</span>
          </div>
        </div>
        <div class="match-hud-actions">
          <button type="button" class="match-btn match-btn--soft" data-action="gameplay-next-phase">Next phase</button>
          <button type="button" class="match-btn match-btn--soft" data-action="gameplay-advance-turn">Next turn</button>
          <button type="button" class="match-btn match-btn--soft" data-action="gameplay-advance-round">Next round</button>
        </div>
      </header>

      ${toast}
      ${renderCelebration(state)}
      ${renderScanSpotlight(state)}
      ${renderScanHud(state)}

      <div class="match-screen__body">
        <section class="match-column match-column--forces" aria-labelledby="match-forces-heading">
          <h3 id="match-forces-heading" class="match-column__title">Forces</h3>
          ${renderEntityPanels(state, { resumeAvailable })}
        </section>
        <section class="match-column match-column--objectives" aria-labelledby="match-obj-heading">
          <h3 id="match-obj-heading" class="match-column__title">Objectives</h3>
          <div class="match-objectives">${renderObjectiveCards(g.objectives, state)}</div>
        </section>
        <section class="match-column match-column--log" aria-labelledby="match-log-heading">
          <h3 id="match-log-heading" class="match-column__title">Battle log</h3>
          <div class="match-log">${renderBattleLog(g.timeline, state)}</div>
        </section>
      </div>

      <footer class="match-screen__footer">
        <button type="button" class="match-btn match-btn--ghost" data-action="go-home">Setup &amp; lists</button>
        ${devScan}
      </footer>
      ${registerModal}
    </div>
  `
}
