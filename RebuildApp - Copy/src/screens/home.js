import {
  listLauncherSystemSummaries,
  mergePackageLists,
  getPackageEntry,
} from '../packages/packageRegistry.js'
import { loadSessionSnapshot } from '../services/sessionSnapshot.js'
import { resolveBuiltInPackageUrl } from '../services/builtInPackages.js'
import { resolveTheme } from '../themes/index.js'
import { getRecentPackageLoads } from '../services/recentLists.js'
import { BUILD_INFO } from '../buildInfo.js'

function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function buildInfoLine() {
  if (!BUILD_INFO?.generated) return 'BUILD INFO FAILED'
  const visibleVersion = BUILD_INFO.displayVersion || BUILD_INFO.appVersion
  return `Build v${visibleVersion} · pkg ${BUILD_INFO.packageVersion || BUILD_INFO.appVersion} · ${BUILD_INFO.buildTime} · ${BUILD_INFO.runtimeMode} · ${BUILD_INFO.gitHash}`
}

function canResumeBuiltInSession() {
  const snap = loadSessionSnapshot()
  return Boolean(snap?.packageKey && resolveBuiltInPackageUrl(snap.packageKey))
}

function formatRelative(ts) {
  if (!ts) return ''
  const d = (Date.now() - ts) / 60000
  if (d < 1) return 'just now'
  if (d < 1440) return `${Math.floor(d)}m ago`
  return `${Math.floor(d / 1440)}d ago`
}

export function renderHomeScreen(state) {
  const systems = listLauncherSystemSummaries()
  const allPackages = mergePackageLists()
  const demos = allPackages.filter((p) => p.sourceType === 'demo').slice(0, 12)
  const recentLoads = getRecentPackageLoads().slice(0, 5)

  const resumeSnap = loadSessionSnapshot()
  const resumeLabel =
    resumeSnap?.packageKey
      ? `${getPackageEntry(resumeSnap.packageKey)?.title || resumeSnap.packageKey.replace(/-/g, ' ')} · ${resolveTheme(resumeSnap.themeId).displayName || ''}`
      : 'Load session'

  const resumeBlock = canResumeBuiltInSession()
    ? `
    <section class="launcher-dash__section launcher-dash__section--hero" aria-label="Continue session">
      <h3 class="launcher-dash__heading">Continue session</h3>
      <button type="button" class="launcher-hero-btn action-button" data-action="resume-last-session">
        <span class="launcher-hero-btn__label">${esc(resumeLabel.trim())}</span>
        <span class="launcher-hero-btn__sub">Resume last system, package, and look</span>
      </button>
    </section>
  `
    : ''

  const systemTiles = systems
    .map(
      (s) => `
    <button type="button" class="launcher-sys-tile ${esc(s.tileClass)}" data-action="select-launcher-group" data-value="${esc(s.launcherGroupKey)}">
      <span class="launcher-sys-tile__name">${esc(s.systemDisplayName)}</span>
      <span class="launcher-sys-tile__count">${esc(String(s.packageCount))} packages</span>
    </button>
  `
    )
    .join('')

  const recentRows = recentLoads
    .map((r) => {
      const meta = getPackageEntry(r.key)
      const title = meta?.title || r.label || r.key
      const sys = meta?.systemDisplayName || ''
      return `
      <button type="button" class="launcher-recent-row" data-action="select-package" data-value="${esc(r.key)}">
        <span class="launcher-recent-row__title">${esc(title)}</span>
        <span class="launcher-recent-row__meta">${esc(sys)} · ${esc(formatRelative(r.at))}</span>
      </button>`
    })
    .join('')

  const demoGrid = demos
    .map(
      (p) => `
    <button type="button" class="launcher-demo-card pkg-thumb pkg-thumb--${esc(p.thumbnail)}" data-action="select-package" data-value="${esc(p.packageId)}">
      <span class="launcher-demo-card__system">${esc(p.systemDisplayName)}</span>
      <span class="launcher-demo-card__title">${esc(p.title)}</span>
      <span class="launcher-demo-card__meta">${esc(String(p.entityCount))} entities · Demo</span>
    </button>
  `
    )
    .join('')

  const quickOpen = state.activeRoster
    ? `<p class="launcher-quick"><button type="button" class="link-button" data-action="go-roster-viewer">Return to active runtime list</button></p>`
    : ''

  const buildStamp = `
    <div class="build-stamp" aria-label="Build information">
      ${esc(buildInfoLine())}
    </div>
  `

  return `
    <div class="launcher-dash">
      <header class="launcher-dash__masthead">
        <p class="launcher-dash__eyebrow">Runtime launcher</p>
        <h2 class="launcher-dash__title">Load · certify · play</h2>
        <p class="launcher-dash__lead">
          Everything here comes from installed packages. Pick a system or jump straight into a list.
        </p>
      </header>
      ${resumeBlock}
      ${
        recentRows
          ? `<section class="launcher-dash__section" aria-label="Recent packages">
        <h3 class="launcher-dash__heading">Recent packages</h3>
        <div class="launcher-recent-list">${recentRows}</div>
      </section>`
          : ''
      }
      <section class="launcher-dash__section" aria-label="Installed systems">
        <div class="launcher-dash__section-head">
          <h3 class="launcher-dash__heading">Installed systems</h3>
          <button type="button" class="link-button launcher-dash__link" data-action="browse-all-packages">Browse all packages</button>
        </div>
        ${
          systemTiles
            ? `<div class="launcher-sys-grid">${systemTiles}</div>`
            : `<p class="launcher-dash__empty">No package metadata yet. Import a JSON package or load a demo.</p>`
        }
      </section>
      <section class="launcher-dash__section" aria-label="Demo experiences">
        <h3 class="launcher-dash__heading">Demo experiences</h3>
        <p class="launcher-dash__hint">Same runtime path as imports — tap to load.</p>
        <div class="launcher-demo-grid">${demoGrid}</div>
      </section>
      <section class="launcher-dash__section" aria-label="Import content">
        <h3 class="launcher-dash__heading">Import content</h3>
        <p class="launcher-dash__hint">Add JSON packages from files — no setup screens required.</p>
        <div class="launcher-import-actions">
          <button type="button" class="action-button action-button--secondary" data-action="trigger-json-import">Import JSON package</button>
          <button type="button" class="action-button action-button--secondary" data-action="trigger-scenario-import">Import scenario</button>
          <button type="button" class="action-button action-button--secondary" data-action="load-demo-package">Load demo package</button>
        </div>
      </section>
      <section class="launcher-dash__section launcher-dash__section--dev" aria-label="Developer actions">
        <h3 class="launcher-dash__heading">Developer</h3>
        <button type="button" class="link-button" data-action="clear-local-runtime-data">Clear local runtime data</button>
        <button type="button" class="link-button" data-action="go-nfc-test">Open NFC Android test</button>
        ${buildStamp}
      </section>
      ${quickOpen}
    </div>
  `
}
