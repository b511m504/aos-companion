function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function assignmentForUnit(nfcRuntime, unitId) {
  return nfcRuntime?.activeAssignment?.assignments?.[unitId] || ''
}

function selectedUnitId(nfcRuntime) {
  return nfcRuntime?.activeAssignment?.selectedUnitId || null
}

function waitingForScan(nfcRuntime) {
  return nfcRuntime?.activeAssignment?.waitingForScan === true
}

function cardClass(nfcRuntime, unitId) {
  const tagId = assignmentForUnit(nfcRuntime, unitId)
  const isSelected = selectedUnitId(nfcRuntime) === unitId
  if (isSelected) return 'nfc-assign-card nfc-assign-card--selected'
  if (tagId) return 'nfc-assign-card nfc-assign-card--linked'
  return 'nfc-assign-card'
}

function statusLabel(nfcRuntime, unitId) {
  const tagId = assignmentForUnit(nfcRuntime, unitId)
  const isSelected = selectedUnitId(nfcRuntime) === unitId
  if (tagId) return `<span class="nfc-assign-card__status nfc-assign-card__status--ok">Assigned</span>`
  if (isSelected) return `<span class="nfc-assign-card__status nfc-assign-card__status--arm">Arming</span>`
  return `<span class="nfc-assign-card__status">Tap to arm</span>`
}

function reassignmentPrompt(state) {
  const r = state.lastAssignmentResult
  if (r?.reason !== 'tag_already_assigned') return ''
  const ex = r.existingUnitName || r.existingUnitId || 'another unit'
  return `
    <div class="operator-reassign-prompt" role="region" aria-label="Tag already linked">
      <p class="operator-reassign-prompt__msg">Tag assigned to <strong>${esc(ex)}</strong></p>
      <div class="operator-reassign-prompt__actions">
        <button type="button" class="operator-secondary" data-action="operator-reassign-cancel">Cancel</button>
        <button type="button" class="operator-primary" data-action="operator-reassign-confirm">Reassign</button>
      </div>
    </div>`
}

function feedbackBanner(state) {
  const r = state.lastAssignmentResult
  const reassign = reassignmentPrompt(state)
  if (reassign) return reassign
  if (!r) return ''
  if (r.ok) {
    return `<div class="operator-banner operator-banner--success" role="status">${esc(r.unitName || r.entityId || 'Unit')} linked.</div>`
  }
  const msg =
    r.reason === 'no_unit_selected'
      ? 'No unit selected'
      : r.message || r.reason || 'Assignment failed'
  return `<div class="operator-banner operator-banner--warn" role="alert">${esc(msg)}</div>`
}

export function renderNfcTestScreen(nfcRuntime) {
  return `
    <div class="operator-flow">
      <h2 class="operator-flow__title">NFC test</h2>
      <p class="operator-flow__lead">This screen is disabled in operator builds.</p>
      <button type="button" class="operator-secondary" data-action="go-nfc-assignment">Back</button>
    </div>
  `
}

export function renderNfcAssignmentRuntimeScreen(state, nfcRuntime, units = []) {
  const list = Array.isArray(units) ? units : []
  const selected = selectedUnitId(nfcRuntime)
  const waiting = waitingForScan(nfcRuntime)
  const armingName = selected ? list.find((u) => u.id === selected)?.name || selected : ''
  const armingBlock =
    selected && waiting
      ? `<div class="operator-arming" role="status">
          <p class="operator-arming__title">Tap NFC tag</p>
          <p class="operator-arming__target">for <strong>${esc(armingName)}</strong></p>
        </div>`
      : `<p class="operator-flow__hint">Select a unit, then tap its physical base.</p>`

  const cards = list
    .map((unit) => {
      const unitId = unit.id
      const tagId = assignmentForUnit(nfcRuntime, unitId)
      const uidShort = tagId ? esc(tagId.length > 14 ? `${tagId.slice(0, 10)}…` : tagId) : ''
      return `
        <li class="nfc-assign-row">
          <button type="button" class="${cardClass(nfcRuntime, unitId)}" data-action="nfc-select-unit" data-value="${esc(unitId)}">
            <span class="nfc-assign-card__check" aria-hidden="true">${tagId ? '✓' : ''}</span>
            <span class="nfc-assign-card__body">
              <span class="nfc-assign-card__name">${esc(unit.name || unitId)}</span>
              <span class="nfc-assign-card__meta">${esc(unitId)}${tagId ? ` · UID ${uidShort}` : ''}</span>
            </span>
            ${statusLabel(nfcRuntime, unitId)}
          </button>
          ${
            tagId
              ? `<button type="button" class="operator-link" data-action="nfc-clear-unit" data-value="${esc(unitId)}">Clear</button>`
              : ''
          }
        </li>`
    })
    .join('')

  const listTitle = state.activeRoster?.name ? esc(state.activeRoster.name) : 'Units'
  const backAction = String(state.selectedPackage || '').startsWith('operator:')
    ? 'exit-nfc-assignment'
    : 'exit-nfc-assignment'

  return `
    <div class="operator-flow operator-flow--assign">
      <h2 class="operator-flow__title">Assign NFC tags</h2>
      <p class="operator-flow__lead">${listTitle}</p>
      ${feedbackBanner(state)}
      ${armingBlock}
      <ul class="nfc-assign-list">${cards || '<li class="operator-flow__hint">No units loaded.</li>'}</ul>
      <div class="operator-actions operator-actions--footer">
        <button type="button" class="operator-secondary" data-action="go-operator-overview">Overview</button>
        <button type="button" class="operator-secondary" data-action="go-operator-validation">Validate</button>
        <button type="button" class="operator-secondary" data-action="${backAction}">Back</button>
      </div>
    </div>
  `
}
