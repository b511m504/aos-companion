/**
 * Universal launcher package registry — built-ins, demos, and imported entries.
 * UI derives systems and tiles from merged data only (no hardcoded game lists).
 */
import { resolveBuiltInPackageUrl } from '../services/builtInPackages.js'
import { loadImportedPackageRecords, saveImportedPackageRecords } from './importedPackages.js'
import { getRecentPackageLoads } from '../services/recentLists.js'

/** @typedef {'demo' | 'builtin' | 'scenario' | 'imported'} SourceType */

/**
 * Static definitions — keys must exist in builtIn package URL map OR be imported-only.
 * @type {Array<{
 *   packageId: string,
 *   systemId: string,
 *   launcherGroupKey: string,
 *   systemDisplayName: string,
 *   title: string,
 *   subtitle: string,
 *   entityCount: number,
 *   sourceType: SourceType,
 *   suggestedTheme: string,
 *   thumbnail: string,
 *   tags: string[],
 *   faction?: string | null,
 * }>}
 */
export const PACKAGE_DEFINITIONS = [
  {
    packageId: 'demo-aos-stormhost',
    systemId: 'aos',
    launcherGroupKey: 'aos',
    systemDisplayName: 'Age of Sigmar',
    title: 'Stormhost Vanguard',
    subtitle: 'Fantasy army roster — balanced strike force.',
    entityCount: 4,
    sourceType: 'demo',
    suggestedTheme: 'stormcast',
    thumbnail: 'aos-gold',
    tags: ['fantasy', 'army'],
    faction: 'Stormcast',
  },
  {
    packageId: 'demo-40k-strike',
    systemId: 'warhammer40k',
    launcherGroupKey: 'warhammer40k',
    systemDisplayName: 'Warhammer 40,000',
    title: 'Ultramarines Strike Force',
    subtitle: 'Classic battleline + fire support.',
    entityCount: 4,
    sourceType: 'demo',
    suggestedTheme: 'grimdark',
    thumbnail: 'grim-40k',
    tags: ['sci-fi', 'strike'],
    faction: 'Ultramarines',
  },
  {
    packageId: 'demo-skirmish-squad',
    systemId: 'generic',
    launcherGroupKey: 'skirmish',
    systemDisplayName: 'Sci-Fi Skirmish',
    title: 'Spectre Fireteam',
    subtitle: 'Infiltration specialists & drones.',
    entityCount: 5,
    sourceType: 'demo',
    suggestedTheme: 'holo-scifi',
    thumbnail: 'neon-skirmish',
    tags: ['skirmish', 'sci-fi'],
    faction: null,
  },
  {
    packageId: 'demo-rpg-encounter',
    systemId: 'generic',
    launcherGroupKey: 'rpg',
    systemDisplayName: 'RPG Combat',
    title: 'Roadside Ambush',
    subtitle: 'Encounter-sized heroes & creatures.',
    entityCount: 5,
    sourceType: 'scenario',
    suggestedTheme: 'parchment',
    thumbnail: 'parchment-rpg',
    tags: ['rpg', 'encounter'],
    faction: null,
  },
  {
    packageId: 'demo-objectives-set',
    systemId: 'generic',
    launcherGroupKey: 'skirmish',
    systemDisplayName: 'Sci-Fi Skirmish',
    title: 'Objective Sweep',
    subtitle: 'Markers & scoring positions.',
    entityCount: 5,
    sourceType: 'demo',
    suggestedTheme: 'neon-cyber',
    thumbnail: 'objective-neon',
    tags: ['objectives', 'markers'],
    faction: null,
  },
  {
    packageId: 'demo-card-token-board',
    systemId: 'generic',
    launcherGroupKey: 'rpg',
    systemDisplayName: 'RPG Combat',
    title: 'Arcane Duel Grid',
    subtitle: 'Cards, tokens & summons-heavy setup.',
    entityCount: 6,
    sourceType: 'demo',
    suggestedTheme: 'neon-cyber',
    thumbnail: 'arcane-cards',
    tags: ['cards', 'tokens'],
    faction: null,
  },
  {
    packageId: 'demo-vehicle-convoy',
    systemId: 'generic',
    launcherGroupKey: 'motorpool',
    systemDisplayName: 'Vehicle Ops',
    title: 'Armor Column Escort',
    subtitle: 'Convoy vehicles & escorts — same runtime pipeline.',
    entityCount: 4,
    sourceType: 'demo',
    suggestedTheme: 'tactical-red',
    thumbnail: 'convoy-tactical',
    tags: ['vehicles', 'convoy'],
    faction: null,
  },
  {
    packageId: 'demo-battletech-stars',
    systemId: 'generic',
    launcherGroupKey: 'battletech',
    systemDisplayName: 'BattleTech',
    title: 'Lance Star (demo)',
    subtitle: 'Mech-scale skirmish placeholder content.',
    entityCount: 4,
    sourceType: 'demo',
    suggestedTheme: 'tournament',
    thumbnail: 'btech-grid',
    tags: ['mechs', 'skirmish'],
    faction: null,
  },
  {
    packageId: 'demo-cyberpunk-run',
    systemId: 'generic',
    launcherGroupKey: 'cyberpunk',
    systemDisplayName: 'Cyberpunk Skirmish',
    title: 'Night Market Run',
    subtitle: 'Street team vs drones — compact skirmish demo.',
    entityCount: 5,
    sourceType: 'demo',
    suggestedTheme: 'neon-cyber',
    thumbnail: 'cyber-night',
    tags: ['cyberpunk', 'urban'],
    faction: null,
  },
  {
    packageId: 'Test Army Alpha',
    systemId: 'aos',
    launcherGroupKey: 'aos',
    systemDisplayName: 'Age of Sigmar',
    title: 'Test Army Alpha',
    subtitle: 'Built-in smoke test list.',
    entityCount: 2,
    sourceType: 'builtin',
    suggestedTheme: 'default-dark',
    thumbnail: 'aos-gold',
    tags: ['test'],
    faction: null,
  },
  {
    packageId: 'Test Army Beta',
    systemId: 'warhammer40k',
    launcherGroupKey: 'warhammer40k',
    systemDisplayName: 'Warhammer 40,000',
    title: 'Test Army Beta',
    subtitle: 'Built-in smoke test list.',
    entityCount: 2,
    sourceType: 'builtin',
    suggestedTheme: 'grimdark',
    thumbnail: 'grim-40k',
    tags: ['test'],
    faction: null,
  },
]

/** Visual tile class per launcher group — data table, not runtime logic. */
export const LAUNCHER_GROUP_TILE_CLASS = {
  aos: 'launcher-sys-tile--aos',
  warhammer40k: 'launcher-sys-tile--wh40k',
  skirmish: 'launcher-sys-tile--skirmish',
  rpg: 'launcher-sys-tile--rpg',
  motorpool: 'launcher-sys-tile--motorpool',
  battletech: 'launcher-sys-tile--btech',
  cyberpunk: 'launcher-sys-tile--cyber',
  imported: 'launcher-sys-tile--imported',
  generic: 'launcher-sys-tile--neutral',
}

export function tileClassForLauncherGroup(groupKey) {
  return LAUNCHER_GROUP_TILE_CLASS[groupKey] || 'launcher-sys-tile--neutral'
}

export function mergePackageLists() {
  const imported = loadImportedPackageRecords()
  const byId = new Map()

  for (const def of PACKAGE_DEFINITIONS) {
    byId.set(def.packageId, { ...def, builtIn: true })
  }
  for (const row of imported) {
    if (!row?.packageId) continue
    byId.set(row.packageId, { ...row, builtIn: false })
  }

  const recent = getRecentPackageLoads()
  const recentAt = Object.fromEntries(recent.map((r) => [r.key, r.at]))

  return [...byId.values()].map((p) => ({
    ...p,
    lastPlayedAt: recentAt[p.packageId] ?? null,
  }))
}

/**
 * One row per launcher group that has ≥1 package.
 * @returns {Array<{ launcherGroupKey: string, systemDisplayName: string, packageCount: number, tileClass: string }>}
 */
export function listLauncherSystemSummaries() {
  const packs = mergePackageLists()
  const groups = new Map()

  for (const p of packs) {
    const key = p.launcherGroupKey || p.systemId
    if (!groups.has(key)) {
      groups.set(key, {
        launcherGroupKey: key,
        systemDisplayName: p.systemDisplayName,
        packageCount: 0,
      })
    }
    const g = groups.get(key)
    g.packageCount += 1
    if (p.systemDisplayName?.length >= g.systemDisplayName?.length) {
      g.systemDisplayName = p.systemDisplayName
    }
  }

  return [...groups.values()]
    .sort((a, b) => a.systemDisplayName.localeCompare(b.systemDisplayName))
    .map((g) => ({
      ...g,
      tileClass: tileClassForLauncherGroup(g.launcherGroupKey),
    }))
}

/**
 * @param {{ launcherGroupKey?: string, packageFactionFilter?: string }} filters
 */
export function listPackagesForBrowse(filters = {}) {
  const { launcherGroupKey = '', packageFactionFilter = '' } = filters
  let rows = mergePackageLists()

  if (launcherGroupKey) {
    rows = rows.filter((p) => (p.launcherGroupKey || p.systemId) === launcherGroupKey)
  }
  if (packageFactionFilter) {
    rows = rows.filter((p) => (p.faction || '').toLowerCase() === packageFactionFilter.toLowerCase())
  }

  return rows.sort((a, b) => {
    const ta = a.title || a.packageId
    const tb = b.title || b.packageId
    return ta.localeCompare(tb)
  })
}

export function uniqueFactionsForFilter(launcherGroupKey) {
  const rows = listPackagesForBrowse({ launcherGroupKey })
  const set = new Set()
  for (const p of rows) {
    if (p.faction) set.add(p.faction)
  }
  return [...set].sort()
}

export function getPackageEntry(packageId) {
  if (!packageId) return null
  return mergePackageLists().find((p) => p.packageId === packageId) ?? null
}

/**
 * Built-in roster cards that should jump straight to the table (no theme-selection wizard).
 * Excludes `scenario`, `imported`, and other flows that should keep the multi-step setup.
 * @param {{ sourceType?: string } | null | undefined} entry
 */
export function isQuickStartPackageEntry(entry) {
  if (!entry || typeof entry !== 'object') return false
  const st = entry.sourceType
  return st === 'demo' || st === 'builtin'
}

export function hasBuiltInPackage(packageId) {
  return Boolean(resolveBuiltInPackageUrl(packageId))
}

/**
 * After JSON import — persist registry metadata for launcher (same pipeline).
 */
export function registerImportedPackageFromRuntime(packageId, runtimeRegistry) {
  const md = runtimeRegistry?.metadata || {}
  const sid = md.systemId || 'generic'
  const count = runtimeRegistry?.entities?.length ?? 0
  const entry = {
    packageId,
    systemId: sid,
    launcherGroupKey: sid === 'generic' ? 'imported' : sid,
    systemDisplayName: humanizeSystemId(sid),
    title: md.listName || packageId,
    subtitle: 'Imported package',
    entityCount: count,
    sourceType: 'imported',
    suggestedTheme: 'default-dark',
    thumbnail: 'import',
    tags: ['import'],
    faction: null,
  }

  const prev = loadImportedPackageRecords().filter((x) => x.packageId !== packageId)
  saveImportedPackageRecords([entry, ...prev])
}

function humanizeSystemId(sid) {
  const id = String(sid || 'generic').toLowerCase()
  const map = {
    aos: 'Age of Sigmar',
    warhammer40k: 'Warhammer 40,000',
    generic: 'Universal',
  }
  return map[id] || id.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
}

/** Legacy session / catalog compatibility */
export function mapLauncherGroupToLegacyGameId(groupKey) {
  const m = {
    warhammer40k: 'wh40k',
    aos: 'aos',
    skirmish: 'skirmish',
    rpg: 'rpg',
    motorpool: 'motorpool',
    battletech: 'battletech',
    cyberpunk: 'cyberpunk',
    imported: 'imported',
  }
  return m[groupKey] || groupKey
}

/** Fallback when no catalog row exists yet — maps adapter output to launcher group key. */
export function mapAdapterSystemIdToLauncherGroup(systemId) {
  const s = String(systemId || '').toLowerCase()
  if (s === 'warhammer40k') return 'warhammer40k'
  if (s === 'aos') return 'aos'
  if (s === 'generic') return 'rpg'
  return s || 'rpg'
}
