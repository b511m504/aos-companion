function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Optional metadata filter — no longer a required step in the flow. */
export function renderFactionSelectionScreen(state) {
  return `
    <div class="launcher-dash">
      <h2 class="launcher-dash__title">Faction filters</h2>
      <p class="launcher-dash__lead">
        Factions are optional labels on packages. Use the chips inside the
        <strong>package browser</strong> when a system exposes them — nothing is forced here anymore.
      </p>
      <p class="launcher-dash__hint">Current browse group: ${esc(state.selectedLauncherGroupKey || '—')}</p>
      <button type="button" class="action-button" data-action="go-package-selection">Open package browser</button>
      <button type="button" class="link-button" data-action="go-home">Launcher home</button>
    </div>
  `
}
