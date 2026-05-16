import { listLauncherSystemSummaries } from '../packages/packageRegistry.js'

function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Legacy route — systems are derived from installed packages only. */
export function renderGameSelectionScreen(_state) {
  const systems = listLauncherSystemSummaries()

  const tiles = systems
    .map(
      (s) => `
    <button type="button" class="launcher-sys-tile ${esc(s.tileClass)}" data-action="select-launcher-group" data-value="${esc(s.launcherGroupKey)}">
      <span class="launcher-sys-tile__name">${esc(s.systemDisplayName)}</span>
      <span class="launcher-sys-tile__count">${esc(String(s.packageCount))} packages</span>
    </button>
  `
    )
    .join('')

  return `
    <div class="launcher-dash">
      <p class="launcher-dash__eyebrow">Systems view</p>
      <h2 class="launcher-dash__title">Installed systems</h2>
      <p class="launcher-dash__lead">Tiles appear only when packages exist for that runtime group.</p>
      ${
        tiles
          ? `<div class="launcher-sys-grid">${tiles}</div>`
          : `<p class="launcher-dash__empty">No packages registered yet.</p>`
      }
      <button type="button" class="link-button" data-action="go-home">Back to launcher</button>
    </div>
  `
}
