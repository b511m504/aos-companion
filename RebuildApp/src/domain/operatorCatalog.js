/**
 * High-level game / faction catalog for the operator NFC binding workflow.
 * Keys feed persistence (`package` field on tag bindings) as `operator:{gameId}:{factionKey}`.
 */

/** @typedef {{ key: string, label: string }} OperatorFaction */

/** @typedef {{ id: string, label: string, systemId: string, factions: OperatorFaction[] }} OperatorGame */

/** @type {OperatorGame[]} */
export const OPERATOR_GAMES = [
  {
    id: 'aos',
    label: 'Age of Sigmar',
    systemId: 'aos',
    factions: [
      { key: 'aos_stormcast', label: 'Stormcast Eternals' },
      { key: 'aos_skaven', label: 'Skaven' },
      { key: 'aos_nighthaunt', label: 'Nighthaunt' },
    ],
  },
  {
    id: 'wh40k',
    label: 'Warhammer 40,000',
    systemId: 'warhammer40k',
    factions: [
      { key: '40k_ultramarines', label: 'Ultramarines' },
      { key: '40k_necrons', label: 'Necrons' },
      { key: '40k_orks', label: 'Orks' },
    ],
  },
  {
    id: 'killteam',
    label: 'Kill Team',
    systemId: 'generic',
    factions: [
      { key: 'kt_veteran_guard', label: 'Veteran Guard' },
      { key: 'kt_compendium', label: 'Compendium' },
      { key: 'kt_elucidian_starstriders', label: 'Elucidian Starstriders' },
    ],
  },
]

export function listOperatorGames() {
  return OPERATOR_GAMES
}

export function getOperatorGame(gameId) {
  return OPERATOR_GAMES.find((g) => g.id === gameId) || null
}

export function getOperatorFaction(gameId, factionKey) {
  const g = getOperatorGame(gameId)
  if (!g) return null
  return g.factions.find((f) => f.key === factionKey) || null
}

export function makeOperatorPackageKey(gameId, factionKey) {
  return `operator:${String(gameId || '').trim()}:${String(factionKey || '').trim()}`
}

export function parseOperatorPackageKey(packageKey) {
  const raw = String(packageKey || '').trim()
  if (!raw.startsWith('operator:')) return null
  const parts = raw.split(':')
  if (parts.length < 3) return null
  const gameId = parts[1] || ''
  const factionKey = parts.slice(2).join(':') || ''
  return { gameId, factionKey, packageKey: raw }
}
