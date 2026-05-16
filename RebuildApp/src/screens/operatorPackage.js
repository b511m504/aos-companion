import { listOperatorGames } from '../domain/operatorCatalog.js'

function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function renderOperatorPackageScreen() {
  const games = listOperatorGames()
  const cards = games
    .map(
      (g) => `
      <button type="button" class="operator-tile" data-action="operator-select-game" data-value="${esc(g.id)}">
        <span class="operator-tile__label">${esc(g.label)}</span>
      </button>`
    )
    .join('')

  return `
    <div class="operator-flow">
      <h2 class="operator-flow__title">Select game</h2>
      <p class="operator-flow__lead">Choose the ruleset for this binding session.</p>
      <div class="operator-tile-grid">${cards}</div>
    </div>
  `
}
