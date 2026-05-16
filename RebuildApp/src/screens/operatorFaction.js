import { getOperatorGame } from '../domain/operatorCatalog.js'

function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function renderOperatorFactionScreen(state) {
  const g = getOperatorGame(state.operatorGameId)
  if (!g) {
    return `
      <div class="operator-flow">
        <p class="operator-flow__lead">No game selected.</p>
        <button type="button" class="operator-primary" data-action="operator-back-package">Back</button>
      </div>`
  }

  const cards = g.factions
    .map(
      (f) => `
      <button type="button" class="operator-tile" data-action="operator-select-faction" data-value="${esc(f.key)}">
        <span class="operator-tile__label">${esc(f.label)}</span>
      </button>`
    )
    .join('')

  return `
    <div class="operator-flow">
      <h2 class="operator-flow__title">Select faction</h2>
      <p class="operator-flow__lead">${esc(g.label)} — pick your force.</p>
      <div class="operator-tile-grid">${cards}</div>
      <button type="button" class="operator-secondary" data-action="operator-back-package">Change game</button>
    </div>
  `
}
