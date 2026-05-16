import { defaultDark } from './default-dark.js'
import { stormcast } from './stormcast.js'
import { necronGreen } from './necronGreen.js'
import { tacticalRed } from './tacticalRed.js'
import { minimalMono } from './minimalMono.js'
import { grimdark } from './grimdark.js'
import { holoScifi } from './holoScifi.js'
import { parchment } from './parchment.js'
import { tournament } from './tournament.js'
import { neonCyber } from './neonCyber.js'

const THEMES = {
  'default-dark': defaultDark,
  stormcast,
  'necron-green': necronGreen,
  'tactical-red': tacticalRed,
  'minimal-mono': minimalMono,
  grimdark,
  'holo-scifi': holoScifi,
  parchment,
  tournament,
  'neon-cyber': neonCyber,
}

/** Horizontal picker order — visible cosmetic test set */
export const THEME_PICKER_ORDER = [
  'default-dark',
  'stormcast',
  'grimdark',
  'tactical-red',
  'necron-green',
  'holo-scifi',
  'parchment',
  'tournament',
  'minimal-mono',
  'neon-cyber',
]

export function resolveTheme(themeId) {
  const id = themeId || 'default-dark'
  return THEMES[id] ?? defaultDark
}

export function listThemeIds() {
  return Object.keys(THEMES)
}

export function listThemesForPicker() {
  return THEME_PICKER_ORDER.filter((id) => THEMES[id]).map((themeId) => ({
    themeId,
    displayName: THEMES[themeId].displayName || themeId,
    accent: THEMES[themeId].colors?.accent,
    ...THEMES[themeId],
  }))
}
