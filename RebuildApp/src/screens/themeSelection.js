import { listThemesForPicker, resolveTheme } from '../themes/index.js'
import { getPackageEntry } from '../packages/packageRegistry.js'

function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function renderThemeSelectionScreen(state) {
  const themes = listThemesForPicker()
  const pkgMeta = state.selectedPackage ? getPackageEntry(state.selectedPackage) : null
  const suggestedName = pkgMeta?.suggestedTheme
    ? resolveTheme(pkgMeta.suggestedTheme).displayName || pkgMeta.suggestedTheme
    : ''
  const hint = suggestedName
    ? `<p class="theme-picker__hint">Suggested look for this package: <strong>${esc(suggestedName)}</strong></p>`
    : ''

  const cards = themes
    .map((t) => {
      const active = state.activeThemeId === t.themeId
      const accent = t.colors?.accent || '#888'
      return `
      <button type="button"
        class="theme-picker-card ${active ? 'theme-picker-card--active' : ''}"
        data-action="select-launcher-theme"
        data-value="${esc(t.themeId)}"
      >
        <div class="theme-picker-card__preview" aria-hidden="true">
          <div class="theme-mini-shell theme-mini-shell--active" style="--mini-accent:${esc(accent)}">
            <span class="theme-mini-shell__bar"></span>
            <div class="theme-mini-shell__card">
              <span class="theme-mini-shell__chip"></span>
              <span class="theme-mini-shell__line"></span>
              <span class="theme-mini-shell__line theme-mini-shell__line--short"></span>
            </div>
            <span class="theme-mini-shell__cta"></span>
          </div>
        </div>
        <span class="theme-picker-card__swatch theme-picker-card__swatch--${esc(t.themeId)}"></span>
        <span class="theme-picker-card__label">${esc(t.displayName || t.themeId)}</span>
      </button>`
    })
    .join('')

  return `
    <div class="theme-picker-screen">
      <p class="theme-picker__eyebrow">Cosmetics</p>
      <h2 class="theme-picker__title">Choose a table look</h2>
      <p class="theme-picker__lead">
        Preview shows accents and certification styling — rules stay the same.
      </p>
      ${hint}
      <div class="theme-picker__row" role="list">
        ${cards}
      </div>
      <div class="theme-picker__actions">
        <button type="button" class="action-button" data-action="continue-to-roster">Continue</button>
        <button type="button" class="link-button" data-action="skip-theme-default">Skip · use default</button>
        <button type="button" class="link-button" data-action="go-package-selection">Back to packages</button>
      </div>
    </div>
  `
}
