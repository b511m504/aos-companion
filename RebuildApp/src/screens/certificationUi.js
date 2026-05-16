/**
 * Shared pairing markup — roster command center + optional NFC focused mode.
 */

import { getCertificationProgress } from '../state/certificationSelectors.js'

function esc(label) {
  return String(label)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function scanPhaseHeadline(phase) {
  switch (phase) {
    case 'waiting':
      return 'Listening'
    case 'scanning':
      return 'Reading…'
    case 'scan_success':
      return 'Linked'
    case 'write_failure':
      return 'Pairing issue'
    case 'unsupported_tag':
      return 'Unreadable tag'
    default:
      return String(phase || '')
  }
}

export function scanPhaseDetailLine(state) {
  const phase = state.nfcScanPhase || 'waiting'
  const r = state.lastAssignmentResult
  if (r?.reason === 'tag_recognized_linked' || r?.reason === 'tag_recognized_inline') {
    return `Tag recognized — linked to ${esc(r.existingUnitName || r.existingUnitId || 'another piece')}.`
  }
  if (phase === 'write_failure' && r?.reason === 'no_unit_selected') {
    return 'Tap a piece on the table below.'
  }
  if (phase === 'unsupported_tag') {
    return 'Try again with the tag flat on the phone.'
  }
  if (phase === 'scan_success' && r?.ok) {
    return r.idempotent ? 'Same tag · still linked.' : 'Tag linked to this piece.'
  }
  if (phase === 'scanning') {
    return 'Hold the tag against the phone…'
  }
  return 'Tap any piece below — your phone listens for NFC automatically.'
}

export function renderCertificationProgressHeader(state) {
  const { certified, total, percent } = getCertificationProgress(state)
  const complete = total > 0 && certified === total

  const shellClass = complete
    ? 'cert-progress cert-progress--complete'
    : certified > 0
      ? 'cert-progress cert-progress--partial'
      : 'cert-progress cert-progress--empty'

  const completeMsg = complete
    ? `<p class="cert-progress__done" role="status">All paired · ready for runtime <span class="cert-progress__checkmark" aria-hidden="true">✓</span></p>`
    : ''

  return `
    <section class="${shellClass}" aria-label="Pairing progress">
      <h3 class="cert-progress__title">Tags paired</h3>
      <p class="cert-progress__counts"><strong>${certified}</strong> / ${total} linked</p>
      <div class="cert-progress__bar" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100">
        <div class="cert-progress__fill cert-progress__fill--animated" style="width:${percent}%"></div>
      </div>
      ${completeMsg}
    </section>
  `
}

/**
 * Passive status strip — primary interaction is on entity cards.
 * @param {'compact' | 'full'} variant
 */
export function renderAssignmentScanDock(state, variant = 'compact') {
  const selId = state.selectedUnitId
  const name = state.selectedUnitName || '—'
  const phase = state.nfcScanPhase || 'waiting'
  const hasSelectedAssignment = Boolean(selId && state.nfcAssignments?.[selId]?.uid)
  const wrapClass =
    variant === 'compact'
      ? 'cert-scan-dock cert-scan-dock--passive cert-scan-dock--compact'
      : 'cert-scan-dock cert-scan-dock--passive cert-scan-dock--full'

  if (state.nfcIdentityModal) {
    return `
      <div class="${wrapClass} cert-scan-dock--sheet-open" role="status">
        <div class="cert-scan-dock__passive-inner">
          <span class="cert-scan-dock__dot cert-scan-dock__dot--identity"></span>
          <div class="cert-scan-dock__passive-copy">
            <span class="cert-scan-dock__focus-name">Physical tag detected</span>
            <span class="cert-scan-dock__phase-row cert-scan-dock__phase-row--identity">
              <span class="cert-scan-dock__headline">Already linked on this table</span>
              <span class="cert-scan-dock__detail">Choose in the sheet — move tag or jump to the piece that has it.</span>
            </span>
          </div>
        </div>
      </div>
    `
  }

  if (state.activeNfcConflict && state.activeNfcConflict.targetUnitId === selId) {
    const c = state.activeNfcConflict
    const viewBtn = c.canViewCurrent
      ? `<button type="button" class="cert-scan-dock__mini-link" data-action="jump-to-linked-piece" data-value="${esc(c.sourceUnitId || '')}">View current</button>`
      : ''
    return `
      <div class="${wrapClass} cert-scan-dock--sheet-open" role="status">
        <div class="cert-scan-dock__passive-inner">
          <span class="cert-scan-dock__dot cert-scan-dock__dot--identity"></span>
          <div class="cert-scan-dock__passive-copy">
            <span class="cert-scan-dock__focus-name">Tag recognized</span>
            <span class="cert-scan-dock__phase-row cert-scan-dock__phase-row--identity">
              <span class="cert-scan-dock__headline">Ready to relink</span>
              <span class="cert-scan-dock__detail">Linked to ${esc(c.sourceUnitName || c.sourceUnitId || 'another piece')} · relink here if you want.</span>
            </span>
          </div>
        </div>
        <div class="cert-scan-dock__subtle-actions">
          <button type="button" class="cert-scan-dock__mini-link" data-action="relink-inline-tag">Relink tag</button>
          <span class="cert-scan-dock__sep" aria-hidden="true">·</span>
          ${viewBtn}
          ${viewBtn ? `<span class="cert-scan-dock__sep" aria-hidden="true">·</span>` : ''}
          <button type="button" class="cert-scan-dock__mini-link" data-action="dismiss-tag-identity-sheet">Cancel</button>
        </div>
      </div>
    `
  }

  if (state.nfcRuntimeLookupMode) {
    return `
      <div class="${wrapClass} cert-scan-dock--lookup-mode" role="status">
        <div class="cert-scan-dock__passive-inner">
          <span class="cert-scan-dock__dot cert-scan-dock__dot--listen"></span>
          <p class="cert-scan-dock__passive-text">Lookup mode — touch a tag to recognize a piece (coming soon in runtime).</p>
        </div>
      </div>
    `
  }

  if (!selId) {
    return `
      <div class="${wrapClass}" role="status">
        <div class="cert-scan-dock__passive-inner">
          <span class="cert-scan-dock__dot cert-scan-dock__dot--idle"></span>
          <p class="cert-scan-dock__passive-text">Tap a piece to start · phone listens for NFC</p>
        </div>
      </div>
    `
  }

  const phaseClass =
    phase === 'scan_success'
      ? 'cert-scan-dock__phase-row cert-scan-dock__phase-row--ok'
      : ['write_failure', 'unsupported_tag'].includes(phase)
        ? 'cert-scan-dock__phase-row cert-scan-dock__phase-row--err'
        : phase === 'scanning'
          ? 'cert-scan-dock__phase-row cert-scan-dock__phase-row--busy'
          : 'cert-scan-dock__phase-row'

  const dotClass =
    phase === 'scan_success'
      ? 'ok'
      : ['write_failure', 'unsupported_tag'].includes(phase)
        ? 'err'
        : phase === 'scanning'
          ? 'busy'
          : 'listen'

  return `
    <div class="${wrapClass}" role="status" aria-live="polite">
      <div class="cert-scan-dock__passive-inner">
        <span class="cert-scan-dock__dot cert-scan-dock__dot--${dotClass}"></span>
        <div class="cert-scan-dock__passive-copy">
          <span class="cert-scan-dock__focus-name">${esc(name)}</span>
          <span class="${phaseClass}">
            <span class="cert-scan-dock__headline">${esc(scanPhaseHeadline(phase))}</span>
            <span class="cert-scan-dock__detail">${scanPhaseDetailLine(state)}</span>
          </span>
        </div>
      </div>
      <div class="cert-scan-dock__subtle-actions">
        <button type="button" class="cert-scan-dock__mini-link" data-action="retry-nfc-scan">Retry</button>
        <span class="cert-scan-dock__sep" aria-hidden="true">·</span>
        <button type="button" class="cert-scan-dock__mini-link" data-action="skip-assignment-unit">Skip</button>
        <span class="cert-scan-dock__sep" aria-hidden="true">·</span>
        <button type="button" class="cert-scan-dock__mini-link" data-action="clear-nfc-assignment" data-value="${esc(selId || '')}" ${hasSelectedAssignment ? '' : 'disabled aria-disabled="true"'}>Clear tag</button>
      </div>
    </div>
  `
}

export function renderNfcCompactDebugSummary(state, debugEnabled) {
  if (!debugEnabled) return ''
  const assignments = Object.values(state.nfcAssignments || {}).filter((a) => Boolean(a?.uid)).length
  const knownTags = Object.keys(state.nfcHistoricalTags || {}).length
  const activeConflict = state.activeNfcConflict || null
  const conflictTarget = activeConflict?.targetUnitId || 'none'
  const focused = state.selectedEntityId || state.selectedUnitId || 'none'
  return `
    <section class="nfc-debug-box" aria-label="NFC debug summary">
      <h3 class="nfc-side-title">NFC Debug</h3>
      <p><strong>Assignments:</strong> ${assignments}</p>
      <p><strong>Known tags:</strong> ${knownTags}</p>
      <p><strong>Active conflict:</strong> ${activeConflict ? 'yes' : 'no'}</p>
      <p><strong>Conflict target:</strong> ${esc(conflictTarget)}</p>
      <p><strong>Focused card:</strong> ${esc(focused)}</p>
    </section>
  `
}

/** Runtime CTA — shared gate copy */
export function renderCertificationRuntimeCta(state) {
  const ready = state.runtimeReady === true
  const warn =
    state.runtimeGateWarning && (state.currentScreen === 'roster-viewer' || state.currentScreen === 'nfc-assignment')
      ? `<p class="cert-runtime-warn" role="alert">${esc(state.runtimeGateWarning)}</p>`
      : ''

  if (ready) {
    return `
      <div class="cert-runtime-cta">
        ${warn}
        <button type="button" class="action-button action-button--runtime-ready cert-runtime-cta__btn" data-action="start-runtime">
          Enter runtime
        </button>
      </div>
    `
  }

  return `
    <div class="cert-runtime-cta">
      ${warn}
      <button type="button" class="action-button cert-runtime-cta__btn" disabled aria-disabled="true">
        Pair all tags to continue
      </button>
    </div>
  `
}

export { esc }
