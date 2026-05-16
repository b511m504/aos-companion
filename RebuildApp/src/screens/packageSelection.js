import {
  listPackagesForBrowse,
  uniqueFactionsForFilter,
  listLauncherSystemSummaries,
  getPackageEntry,
} from '../packages/packageRegistry.js'
import { getRecentPackageLoads } from '../services/recentLists.js'
import { resolveTheme } from '../themes/index.js'
import { compactUidPreview } from '../state/certificationSelectors.js'

function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function escAttr(s) {
  return esc(s).replaceAll("'", '&#39;')
}

const SOURCE_LABEL = {
  demo: 'Demo',
  builtin: 'Built-in',
  scenario: 'Scenario',
  imported: 'Imported',
}

function formatPlayed(at) {
  if (!at) return ''
  const m = (Date.now() - at) / 60000
  if (m < 1) return 'Played just now'
  if (m < 1440) return `Played ${Math.floor(m)}m ago`
  return `Played ${Math.floor(m / 1440)}d ago`
}

function renderPackageCard(p) {
  const suggest = resolveTheme(p.suggestedTheme).displayName || p.suggestedTheme
  const played = p.lastPlayedAt ? formatPlayed(p.lastPlayedAt) : ''
  const factionLine = p.faction ? `<span class="pkg-browser-card__faction">${esc(p.faction)}</span>` : ''

  return `
    <button
      type="button"
      class="pkg-browser-card pkg-thumb pkg-thumb--${esc(p.thumbnail)}"
      data-action="select-package"
      data-value="${escAttr(p.packageId)}"
    >
      <div class="pkg-browser-card__badges">
        <span class="pkg-browser-card__badge pkg-browser-card__badge--${esc(p.sourceType)}">${esc(SOURCE_LABEL[p.sourceType] || p.sourceType)}</span>
        <span class="pkg-browser-card__sys">${esc(p.systemDisplayName)}</span>
      </div>
      <h3 class="pkg-browser-card__title">${esc(p.title)}</h3>
      <p class="pkg-browser-card__subtitle">${esc(p.subtitle)}</p>
      ${factionLine}
      <div class="pkg-browser-card__footer">
        <span>${esc(String(p.entityCount))} entities</span>
        <span class="pkg-browser-card__theme-dot" style="--preview-accent:${esc(resolveTheme(p.suggestedTheme).colors?.accent || '#888')}">${esc(suggest)}</span>
      </div>
      ${played ? `<span class="pkg-browser-card__played">${esc(played)}</span>` : ''}
    </button>
  `
}

function renderPackageNfcBanner(state) {
  const eid = state.packageNfcHighlightEntityId
  if (!eid) return ''
  const tag = state.packageNfcHighlightTagId || ''
  const tagPreview = tag ? compactUidPreview(tag) : '—'
  const src = state.packageNfcLookupSource || '—'
  return `
    <section class="pkg-nfc-hit" data-package-nfc-entity="${escAttr(eid)}" role="status" aria-live="polite">
      <div class="pkg-nfc-hit__row">
        <span class="pkg-nfc-hit__label">NFC</span>
        <span class="pkg-nfc-hit__entity"><strong>${esc(eid)}</strong></span>
        <span class="pkg-nfc-hit__tag">Tag ${esc(tagPreview)}</span>
        <span class="pkg-nfc-hit__src">via ${esc(src)}</span>
        <button type="button" class="link-button pkg-nfc-hit__dismiss" data-action="close-package-nfc-highlight">Dismiss</button>
      </div>
    </section>
  `
}

export function renderPackageSelectionScreen(state) {
  const groupKey = state.selectedLauncherGroupKey || ''
  const factionFilter = state.packageFactionFilter || ''

  const summaries = listLauncherSystemSummaries()
  const activeSummary = summaries.find((s) => s.launcherGroupKey === groupKey)

  const browseTitle = activeSummary
    ? activeSummary.systemDisplayName
    : 'All packages'

  const browseLead = activeSummary
    ? 'Packages tagged for this runtime group.'
    : 'Every installed package — filter by system from the home dashboard.'

  const packages = listPackagesForBrowse({
    launcherGroupKey: groupKey,
    packageFactionFilter: factionFilter,
  })

  const factions = groupKey ? uniqueFactionsForFilter(groupKey) : []

  const factionChips =
    factions.length > 0
      ? `
    <div class="pkg-browser-factions" role="tablist" aria-label="Optional faction filter">
      <button type="button" class="pkg-chip ${!factionFilter ? 'pkg-chip--active' : ''}" data-action="set-package-faction-filter" data-value="">All</button>
      ${factions
        .map(
          (f) => `
        <button type="button" class="pkg-chip ${factionFilter === f ? 'pkg-chip--active' : ''}" data-action="set-package-faction-filter" data-value="${escAttr(f)}">${esc(f)}</button>`
        )
        .join('')}
    </div>
  `
      : ''

  const recent = getRecentPackageLoads()
  const recentFiltered = recent.filter((r) => {
    const m = getPackageEntry(r.key)
    if (!groupKey) return true
    return m && (m.launcherGroupKey || m.systemId) === groupKey
  })

  const recentCards = recentFiltered
    .slice(0, 6)
    .map((r) => {
      const m = getPackageEntry(r.key)
      if (m) return renderPackageCard({ ...m, lastPlayedAt: r.at })
      return `
        <button type="button" class="pkg-browser-card pkg-browser-card--orphan" data-action="select-package" data-value="${escAttr(r.key)}">
          <h3 class="pkg-browser-card__title">${esc(r.label || r.key)}</h3>
          <p class="pkg-browser-card__subtitle">Recent load · tap to open</p>
        </button>`
    })
    .join('')

  const grid = packages.map((p) => renderPackageCard(p)).join('')

  return `
    <div class="pkg-browser">
      <header class="pkg-browser__masthead">
        <p class="pkg-browser__eyebrow">Package browser</p>
        <h2 class="pkg-browser__title">${esc(browseTitle)}</h2>
        <p class="pkg-browser__lead">${esc(browseLead)}</p>
      </header>
      ${renderPackageNfcBanner(state)}
      ${factionChips}
      ${
        recentCards
          ? `<section class="pkg-browser__lane">
        <h3 class="pkg-browser__lane-title">Jump back in</h3>
        <div class="pkg-browser__grid pkg-browser__grid--recent">${recentCards}</div>
      </section>`
          : ''
      }
      <section class="pkg-browser__lane">
        <h3 class="pkg-browser__lane-title">${groupKey ? 'Packages for this system' : 'Every installed package'}</h3>
        <div class="pkg-browser__grid">
          ${grid || `<p class="pkg-browser__empty">No packages match this filter.</p>`}
        </div>
      </section>
      <section class="pkg-browser__lane pkg-browser__lane--import">
        <h3 class="pkg-browser__lane-title">Add packages</h3>
        <div class="pkg-browser__import-row">
          <button type="button" class="action-button action-button--secondary" data-action="trigger-json-import">Import JSON package</button>
          <button type="button" class="action-button action-button--secondary" data-action="trigger-scenario-import">Import scenario</button>
          <button type="button" class="action-button action-button--secondary" data-action="load-demo-package">Load demo package</button>
        </div>
      </section>
      <footer class="pkg-browser__footer">
        <button type="button" class="link-button" data-action="go-home">Launcher home</button>
        ${groupKey ? `<button type="button" class="link-button" data-action="browse-all-packages">Show all systems</button>` : ''}
      </footer>
    </div>
  `
}
