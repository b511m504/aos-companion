/**
 * Certification command center — roster review + live NFC pairing state + runtime gate.
 */

import {
  isUnitCertified,
  getUnitAssignedUid,
  isScanSuccessForUnit,
  compactUidPreview,
  isPhysicalUnlinkPulse,
  isPhysicalLookupHighlight,
  getConflictTargetState,
  hasHistoricalMemoryForEntity,
} from '../state/certificationSelectors.js'
import { deriveNfcCardState } from '../state/nfcUiModel.js'
import {
  renderCertificationProgressHeader,
  renderAssignmentScanDock,
  renderCertificationRuntimeCta,
  renderNfcCompactDebugSummary,
  esc,
} from './certificationUi.js'

const CHECK_SVG = `<svg class="cert-icon-svg cert-icon-svg--check" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>`
const WARN_SVG = `<svg class="cert-icon-svg cert-icon-svg--warn" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`
const NFC_SVG = `<svg class="cert-nfc-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm0-14c-3.3 0-6 2.7-6 6s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6zm0 10c-2.2 0-4-1.8-4-4s1.8-4 4-4 4 1.8 4 4-1.8 4-4 4z"/></svg>`
const DEBUG_UI = false

function rosterCardModifier(state, unit) {
  return deriveNfcCardState(state, unit.id)
}

function durabilityLine(unit) {
  const t = String(unit.entityType || 'UNIT').toUpperCase()
  const w = Number(unit.wounds)
  if (t === 'OBJECTIVE' && !w) return 'Objective · fixed position'
  if (t === 'CARD') return w ? `Track ${w}` : 'Card'
  if (t === 'TOKEN') return w ? `Track ${w}` : 'Token'
  return `Durability ${w}`
}

function tactileExtras(state, unitId) {
  const bits = []
  if (isScanSuccessForUnit(state, unitId)) bits.push('cert-unit-card--linked-sweep')
  if (isPhysicalLookupHighlight(state, unitId)) bits.push('cert-unit-card--lookup-pulse')
  return bits.filter(Boolean).join(' ')
}

function renderNfcTapEntityDetail(state) {
  if (!state.nfcTapSelectDetailOpen || !state.selectedEntityId) return ''
  const u = state.activeRoster?.units?.find((x) => x.id === state.selectedEntityId)
  if (!u) return ''
  const uid = getUnitAssignedUid(state, u.id)
  const preview = uid ? compactUidPreview(uid) : '—'
  return `
    <aside class="nfc-tap-detail-pane" role="region" aria-label="Entity from NFC scan">
      <div class="nfc-tap-detail-pane__header">
        <h3 class="nfc-tap-detail-pane__title">NFC selection</h3>
        <button type="button" class="link-button" data-action="close-nfc-tap-detail">Close</button>
      </div>
      <p class="nfc-tap-detail-pane__line"><strong>${esc(u.name)}</strong></p>
      <p class="nfc-tap-detail-pane__meta"><code>${esc(u.id)}</code> · ${esc(String(u.entityType || 'UNIT').toUpperCase())}</p>
      <p class="nfc-tap-detail-pane__tag"><span class="nfc-tap-detail-pane__label">Tag</span> ${esc(preview)}</p>
    </aside>
  `
}

function renderUnitCard(state, unit) {
  const mod = rosterCardModifier(state, unit)
  const uid = getUnitAssignedUid(state, unit.id)
  const preview = uid ? compactUidPreview(uid) : ''
  const focused = state.selectedEntityId === unit.id || state.selectedUnitId === unit.id
  const detailOpen = Boolean(state.nfcTapSelectDetailOpen && state.selectedEntityId === unit.id)
  const activeIndicator = focused
    ? '<span class="cert-unit-card__state-indicator cert-unit-card__state-indicator--active" aria-label="Ready to scan"></span>'
    : ''
  const linkedIndicator = uid
    ? '<span class="cert-unit-card__state-indicator cert-unit-card__state-indicator--linked" aria-label="Linked"></span>'
    : ''
  const baseClass = 'cert-unit-card'
  const detailClass = detailOpen ? ' cert-unit-card--nfc-detail-open' : ''
  const extra = tactileExtras(state, unit.id)
  const unlink = isPhysicalUnlinkPulse(state, unit.id)

  let modClass = `${baseClass} ${baseClass}--${mod}${extra ? ` ${extra}` : ''}${detailClass}`
  if (unlink && mod === 'unassigned') modClass += ' cert-unit-card--unlink-wave'

  const typeLabel = String(unit.entityType || 'UNIT').toUpperCase()
  const activeConflict = state.activeNfcConflict
  const conflictTarget = getConflictTargetState(state, unit.id)
  const cardShowsConflict = mod === 'identity-pending'
  const sourceOwner = Boolean(activeConflict?.sourceUnitId && activeConflict.sourceUnitId === unit.id)
  const historicalKnown = hasHistoricalMemoryForEntity(state, unit.id)
  if (activeConflict && unit.id !== activeConflict.targetUnitId && cardShowsConflict) {
    console.error('CONFLICT_LEAK_DETECTED', unit.id, activeConflict)
  }

  const body = `
    <span class="cert-unit-card__sweep cert-unit-card__sweep--success" aria-hidden="true"></span>
    ${activeIndicator}
    ${linkedIndicator}
    <p class="cert-unit-card__meta">
      <span class="entity-type-chip" data-entity-type="${esc(typeLabel)}">${esc(typeLabel)}</span>
    </p>
    <p class="cert-unit-card__id"><strong>${esc(unit.id)}</strong></p>
    <h3 class="cert-unit-card__title">${esc(unit.name)}</h3>
    <p class="cert-unit-card__wounds">${esc(durabilityLine(unit))}</p>
  `

  if (mod === 'assigned') {
    if (!uid) {
      console.error('INVALID_UI_ASSIGNMENT_STATE', unit.id, {
        derivedState: mod,
        source: 'isUnitCertified=true but getUnitAssignedUid missing',
      })
    }
    const lkScan = tactileExtras(state, unit.id)
    modClass += lkScan ? ` ${lkScan}` : ''

    return `
      <article class="${modClass}" data-entity-card="${esc(unit.id)}">
        <div class="cert-unit-card__ribbon">
          ${CHECK_SVG}
          <span class="cert-unit-card__cert-text">Linked</span>
        </div>
        ${body}
        <p class="cert-unit-card__uid-line"><span class="cert-unit-card__uid-label">Tag</span> <span class="cert-unit-card__uid">${esc(preview)}</span></p>
        ${sourceOwner ? `<span class="cert-unit-card__badge cert-unit-card__badge--known">Current owner</span>` : ''}
      </article>
    `
  }

  if (mod === 'identity-pending') {
    const ex = state.nfcIdentityModal?.existingName || state.nfcIdentityModal?.existingEntityId || '—'
    return `
      <div class="${modClass} cert-unit-card--identity-hold" data-entity-card="${esc(unit.id)}">
        <span class="cert-unit-card__nfc-corner" aria-hidden="true">${NFC_SVG}</span>
        <div class="cert-unit-card__identity-banner">
          <span class="cert-unit-card__identity-kicker">Tag recognized</span>
          <span class="cert-unit-card__identity-copy">Already linked on this table · ${esc(ex)} · use sheet</span>
        </div>
        ${body}
      </div>
    `
  }

  if (mod === 'error') {
    const hint =
      state.lastAssignmentResult?.reason === 'unsupported_tag'
        ? 'Unreadable tag — try flat on phone.'
        : 'Could not read tag.'
    return `
      <button type="button" class="${modClass} cert-unit-card--interactive cert-unit-card--tactile" data-action="nfc-tap-entity" data-entity-card="${esc(unit.id)}" data-value="${esc(unit.id)}">
        <span class="cert-unit-card__nfc-corner" aria-hidden="true">${NFC_SVG}</span>
        <div class="cert-unit-card__errbar">
          ${WARN_SVG}
          <span class="cert-unit-card__errmsg">${esc(hint)}</span>
        </div>
        ${body}
        <p class="cert-unit-card__tap-hint cert-unit-card__tap-hint--error">Tap · try again</p>
      </button>
    `
  }

  if (mod === 'active-scanning') {
    return `
      <button type="button" class="${modClass} cert-unit-card--interactive cert-unit-card--tactile cert-unit-card--listening" data-action="nfc-tap-entity" data-entity-card="${esc(unit.id)}" data-value="${esc(unit.id)}">
        <span class="cert-unit-card__nfc-corner" aria-hidden="true">${NFC_SVG}</span>
        <div class="cert-unit-card__scanbar cert-unit-card__scanbar--radar" aria-live="polite">
          <span class="cert-unit-card__ripple"></span>
          <span class="cert-unit-card__scanmsg">Reading tag…</span>
        </div>
        ${body}
        <p class="cert-unit-card__hintwait">Touch NFC tag to phone</p>
      </button>
    `
  }

  if (mod === 'focus-wait') {
    return `
      <button type="button" class="${modClass} cert-unit-card--interactive cert-unit-card--tactile cert-unit-card--listening" data-action="nfc-tap-entity" data-entity-card="${esc(unit.id)}" data-value="${esc(unit.id)}">
        <span class="cert-unit-card__nfc-corner" aria-hidden="true">${NFC_SVG}</span>
        <div class="cert-unit-card__focusbar">
          <span class="cert-unit-card__listen-ring"></span>
          <span class="cert-unit-card__waitmsg">Hold tag near phone</span>
        </div>
        ${body}
      </button>
    `
  }

  if (mod === 'historically-known' || historicalKnown) {
    return `
      <button type="button" class="${modClass} cert-unit-card--interactive cert-unit-card--tactile" data-action="nfc-tap-entity" data-entity-card="${esc(unit.id)}" data-value="${esc(unit.id)}">
        <span class="cert-unit-card__nfc-corner" aria-hidden="true">${NFC_SVG}</span>
        ${body}
        <span class="cert-unit-card__badge cert-unit-card__badge--known">Known tag</span>
        <p class="cert-unit-card__tap-hint">Tap to rescan or relink</p>
      </button>
    `
  }

  /* unassigned */
  return `
    <button type="button" class="${modClass} cert-unit-card--interactive cert-unit-card--tactile" data-action="nfc-tap-entity" data-entity-card="${esc(unit.id)}" data-value="${esc(unit.id)}">
      <span class="cert-unit-card__nfc-corner" aria-hidden="true">${NFC_SVG}</span>
      ${body}
      <span class="cert-unit-card__badge cert-unit-card__badge--open">Ready to pair</span>
      <p class="cert-unit-card__tap-hint">Tap · phone listens for NFC</p>
    </button>
  `
}

export function renderRosterViewerScreen(state) {
  const roster = state.activeRoster

  if (!roster || !Array.isArray(roster.units)) {
    return `
      <h2>Roster</h2>
      <p>No roster loaded.</p>
      <button type="button" class="link-button" data-action="go-package-selection">Go to Package Selection</button>
    `
  }

  const { certified, total, percent } = (() => {
    let c = 0
    for (const u of roster.units) {
      if (isUnitCertified(state, u.id)) c += 1
    }
    const t = roster.units.length
    const p = t > 0 ? Math.round((c / t) * 100) : 0
    return { certified: c, total: t, percent: p }
  })()

  const shellTone =
    total > 0 && certified === total ? 'complete' : certified > 0 ? 'partial' : 'fresh'

  const conflictTargetCount = roster.units.filter(
    (u) => getConflictTargetState(state, u.id) === 'current'
  ).length
  if (conflictTargetCount > 1) {
    console.error('MULTI_CONFLICT_TARGET', { count: conflictTargetCount, active: state.activeNfcConflict })
  }

  const unitsMarkup = roster.units.map((u) => renderUnitCard(state, u)).join('')

  return `
    <div class="roster-cert-shell roster-cert-shell--${shellTone}${state.nfcIdentityModal ? ' roster-cert-shell--identity-modal' : ''}">
      <header class="roster-cert-header">
        <h2 class="roster-cert-header__title">Pair tags</h2>
        <p class="roster-cert-header__lead">
          Tap a piece, touch tag to phone — recognizes identity, links in place — then jumps to what’s left.
        </p>
      </header>
      ${renderCertificationProgressHeader(state)}
      ${renderAssignmentScanDock(state, 'compact')}
      <div class="cert-unit-grid" style="--cert-pct:${percent}">
        ${unitsMarkup}
      </div>
      ${renderCertificationRuntimeCta(state)}
      ${renderNfcCompactDebugSummary(state, DEBUG_UI)}
      ${renderNfcTapEntityDetail(state)}
      <div class="roster-cert-footer">
        <button type="button" class="link-button roster-cert-footer__link" data-action="go-nfc-assignment">
          Full-screen pairing
        </button>
        <div class="roster-cert-footer__row">
          <button type="button" class="link-button" data-action="go-package-selection">Packages</button>
          <button type="button" class="link-button" data-action="go-home">Home</button>
        </div>
      </div>
    </div>
  `
}
