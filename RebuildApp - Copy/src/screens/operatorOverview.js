import { buildOperatorOverviewModel } from '../services/operatorAssignmentService.js'

function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function fmtTs(ts) {
  const n = Number(ts)
  if (!n) return ''
  try {
    return new Date(n).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return ''
  }
}

function healthLabel(level) {
  if (level === 'healthy') return 'Healthy'
  if (level === 'warnings') return 'Warnings'
  if (level === 'conflicts') return 'Needs attention'
  return '—'
}

export function renderOperatorOverviewScreen(state) {
  const reg = state.runtimeRegistry
  const entities = reg?.entities || []
  const model = buildOperatorOverviewModel({
    entities,
    nfcAssignments: state.nfcAssignments,
    assignedTags: state.assignedTags,
    rosterName: state.activeRoster?.name || 'Roster',
    packageKey: state.selectedPackage || '',
  })
  const hl = model.healthLevel || 'healthy'
  const healthClass =
    hl === 'healthy'
      ? 'operator-health operator-health--ok'
      : hl === 'warnings'
        ? 'operator-health operator-health--warn'
        : 'operator-health operator-health--bad'

  const warn = state.operatorHydrationWarning
    ? `<p class="operator-banner operator-banner--warn" role="status">${esc(state.operatorHydrationWarning)} <button type="button" class="operator-link" data-action="dismiss-operator-hydration-warning">Dismiss</button></p>`
    : ''
  const integrityLine =
    !model.integrity.ok && !warn
      ? `<p class="operator-banner operator-banner--warn" role="status">Some tag bindings need review (duplicates or invalid data).</p>`
      : ''
  const deepExtra =
    model.integrityDeep?.orphanNfcKeys?.length || model.integrityDeep?.orphanTagBindings?.length
      ? `<p class="operator-flow__hint">Orphan or drift entries detected — re-save from assignment screen if needed.</p>`
      : ''
  const dupDetail =
    model.integrity.duplicateUids.length > 0
      ? `<p class="operator-flow__hint">${esc(String(model.integrity.duplicateUids.length))} duplicate UID binding(s)</p>`
      : ''
  const imported = fmtTs(state.operatorRosterImportedAt)
  const importedLine = imported ? `<p class="operator-flow__hint">Last roster load: ${esc(imported)}</p>` : ''

  const prev = state.operatorBackupImportPreview
  let backupBanner = ''
  if (prev) {
    if (!prev.ok) {
      const errs = Array.isArray(prev.errors) ? prev.errors.map((e) => esc(e)).join(' ') : 'Invalid file'
      backupBanner = `<div class="operator-banner operator-banner--warn" role="alert">${errs} <button type="button" class="operator-link" data-action="operator-backup-preview-dismiss">Dismiss</button></div>`
    } else {
      const hint = prev.commitHint ? `<p class="operator-flow__hint">${esc(prev.commitHint)}</p>` : ''
      backupBanner = `<div class="operator-banner ${prev.commitHint ? 'operator-banner--warn' : 'operator-banner--success'}" role="status">
        ${hint}
        Backup ready: ${esc(String(prev.safeCount))} safe update(s)${prev.conflictCount ? `, ${esc(String(prev.conflictCount))} conflict(s)` : ''}${prev.unknownCount ? `, ${esc(String(prev.unknownCount))} unknown row(s) skipped` : ''}.
        <div class="operator-reassign-prompt__actions" style="margin-top:0.5rem">
          <button type="button" class="operator-secondary" data-action="operator-import-commit" data-value="merge_safe">Apply safe</button>
          ${prev.conflictCount ? `<button type="button" class="operator-secondary" data-action="operator-import-commit" data-value="replace_all">Replace conflicting</button>` : ''}
          <button type="button" class="operator-link" data-action="operator-backup-preview-dismiss">Cancel</button>
        </div>
      </div>`
    }
  }

  const clearEffect = state.operatorPendingClear ? 'confirm' : 'arm'
  const rows = model.rows
    .map((r) => {
      const mark = r.assigned ? '✓' : '✗'
      const cls = r.assigned ? 'operator-overview-row operator-overview-row--ok' : 'operator-overview-row operator-overview-row--miss'
      return `<li class="${cls}"><span class="operator-overview-row__mark" aria-hidden="true">${mark}</span><span>${esc(r.name)}</span></li>`
    })
    .join('')

  const clearLabel = state.operatorPendingClear ? 'Tap again to confirm clear' : 'Clear assignments'
  const cancelClear = state.operatorPendingClear
    ? `<p class="operator-flow__hint"><button type="button" class="operator-link" data-action="operator-cancel-clear">Cancel clear</button></p>`
    : ''

  return `
    <div class="operator-flow operator-flow--overview">
      <h2 class="operator-flow__title">Assignments</h2>
      <p class="operator-flow__lead">${esc(model.rosterName)}</p>
      <p class="${healthClass}" role="status"><span class="operator-health__label">Integrity:</span> ${esc(healthLabel(hl))}</p>
      <p class="operator-flow__hint">${model.assigned} assigned · ${model.unassigned} unassigned</p>
      ${importedLine}
      ${backupBanner}
      ${warn}
      ${integrityLine}
      ${dupDetail}
      ${deepExtra}
      ${cancelClear}
      <ul class="operator-overview-list">${rows || '<li class="operator-flow__hint">No units.</li>'}</ul>
      <div class="operator-actions operator-actions--stack">
        <button type="button" class="operator-primary" data-action="go-operator-validation">Validate tags</button>
        <button type="button" class="operator-secondary" data-action="go-nfc-assignment">Assign NFC tags</button>
        <button type="button" class="operator-secondary" data-action="operator-export-backup">Export backup</button>
        <button type="button" class="operator-secondary" data-action="operator-import-backup">Import backup</button>
        <button type="button" class="operator-secondary operator-secondary--danger" data-action="operator-clear-assignments" data-effect="${esc(clearEffect)}">${esc(clearLabel)}</button>
      </div>
      <button type="button" class="operator-secondary" data-action="operator-back-roster-import">Import / change list</button>
    </div>
  `
}
