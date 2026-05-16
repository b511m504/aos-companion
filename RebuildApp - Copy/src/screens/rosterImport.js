import { getOperatorFaction, getOperatorGame } from '../domain/operatorCatalog.js'

function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function renderRosterImportScreen(state) {
  const g = getOperatorGame(state.operatorGameId)
  const f = g ? getOperatorFaction(state.operatorGameId, state.operatorFactionKey) : null
  const err = state.operatorImportError ? `<p class="operator-alert operator-alert--error" role="alert">${esc(state.operatorImportError)}</p>` : ''
  const roster = state.activeRoster
  const summary = roster
    ? `<p class="operator-flow__hint">${esc(roster.units.length)} unit(s) loaded — <strong>${esc(roster.name)}</strong></p>`
    : '<p class="operator-flow__hint">Paste JSON or upload a file. Format: <code>[{ "instanceId", "name", "models" }]</code></p>'

  return `
    <div class="operator-flow">
      <h2 class="operator-flow__title">Import roster</h2>
      <p class="operator-flow__lead">${g ? esc(g.label) : '—'} · ${f ? esc(f.label) : '—'}</p>
      ${err}
      ${summary}
      <label class="operator-field">
        <span class="operator-field__label">List name (optional)</span>
        <input class="operator-input" type="text" name="operatorListName" placeholder="e.g. Tournament 2000" maxlength="120" />
      </label>
      <label class="operator-field">
        <span class="operator-field__label">Roster JSON</span>
        <textarea class="operator-textarea" name="operatorRosterJson" rows="10" placeholder='[{"instanceId":"unit_001","name":"Liberators","models":5}]'></textarea>
      </label>
      <div class="operator-actions">
        <button type="button" class="operator-primary" data-action="operator-import-paste">Import from text</button>
        <button type="button" class="operator-secondary" data-action="operator-import-file">Upload JSON file</button>
      </div>
      ${
        roster
          ? `<div class="operator-actions">
        <button type="button" class="operator-primary" data-action="go-operator-overview">Assignment overview</button>
        <button type="button" class="operator-secondary" data-action="go-nfc-assignment">Assign NFC tags</button>
        <button type="button" class="operator-secondary" data-action="operator-import-backup">Import tag backup</button>
      </div>`
          : ''
      }
      <button type="button" class="operator-secondary" data-action="operator-back-faction">Change faction</button>
    </div>
  `
}
