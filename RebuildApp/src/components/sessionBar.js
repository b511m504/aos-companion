import { getPackageEntry } from '../packages/packageRegistry.js'
import { parseOperatorPackageKey, getOperatorGame, getOperatorFaction } from '../domain/operatorCatalog.js'
import { resolveTheme } from '../themes/index.js'
import { BUILD_INFO } from '../buildInfo.js'

function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Compact session summary — reads registry + theme only */
export function renderSessionBar(state) {
  const op = state.selectedPackage?.startsWith('operator:') ? parseOperatorPackageKey(state.selectedPackage) : null
  const pkg = state.selectedPackage && !op ? getPackageEntry(state.selectedPackage) : null
  const systemLine = op
    ? (() => {
        const g = getOperatorGame(op.gameId)
        const f = getOperatorFaction(op.gameId, op.factionKey)
        return [g?.label, f?.label].filter(Boolean).join(' · ') || 'Operator session'
      })()
    : pkg?.systemDisplayName ?? ''
  const listName =
    state.runtimeRegistry?.metadata?.listName ?? state.activeRoster?.name ?? ''
  const theme = resolveTheme(state.activeThemeId)
  const themeLabel = theme.displayName || state.activeThemeId || 'Default'
  const n = state.runtimeRegistry?.entities?.length ?? 0
  const atTable = state.currentScreen === 'runtime'

  const show = Boolean(pkg || op || state.runtimeRegistry?.entities?.length)

  if (!show) {
    return ''
  }

  if (op) {
    const pieces = state.activeRoster?.units?.length ?? n
    const ver = esc(BUILD_INFO?.displayVersion || BUILD_INFO?.appVersion || '—')
    return `
    <aside class="session-bar session-bar--operator" aria-label="Binding session">
      <span class="session-bar__item"><strong>${esc(systemLine)}</strong></span>
      <span class="session-bar__sep" aria-hidden="true">·</span>
      <span class="session-bar__item">${esc(listName || 'Roster')}</span>
      <span class="session-bar__sep" aria-hidden="true">·</span>
      <span class="session-bar__item">${pieces} unit(s)</span>
      <span class="session-bar__sep" aria-hidden="true">·</span>
      <span class="session-bar__item session-bar__ver" data-operator-diagnostics-hold="1" tabindex="0" role="button" title="Hold to export support file">${ver}</span>
    </aside>
  `
  }

  if (atTable) {
    const pieces = state.activeRoster?.units?.length ?? n
    return `
    <aside class="session-bar session-bar--match" aria-label="Match context">
      <span class="session-bar__item"><strong>${esc(systemLine || 'Game')}</strong></span>
      <span class="session-bar__sep" aria-hidden="true">·</span>
      <span class="session-bar__item">${esc(listName || 'Your list')}</span>
      <span class="session-bar__sep" aria-hidden="true">·</span>
      <span class="session-bar__item">${pieces} pieces · ${esc(themeLabel)}</span>
    </aside>
  `
  }

  return `
    <aside class="session-bar" aria-label="Session summary">
      <span class="session-bar__item"><strong>${esc(systemLine || '—')}</strong></span>
      <span class="session-bar__sep" aria-hidden="true">·</span>
      <span class="session-bar__item">${esc(listName || 'No package loaded')}</span>
      <span class="session-bar__sep" aria-hidden="true">·</span>
      <span class="session-bar__item">Theme: ${esc(themeLabel)}</span>
      <span class="session-bar__sep" aria-hidden="true">·</span>
      <span class="session-bar__item">${n} pieces in package</span>
    </aside>
  `
}
