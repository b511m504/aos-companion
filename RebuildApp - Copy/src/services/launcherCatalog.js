/**
 * Launcher helpers — presentation metadata comes from the universal package registry.
 * Legacy exports kept for minimal churn (theme selection, older imports).
 */
import {
  PACKAGE_DEFINITIONS,
  mergePackageLists,
  getPackageEntry,
  listPackagesForBrowse,
  listLauncherSystemSummaries,
  tileClassForLauncherGroup,
  mapLauncherGroupToLegacyGameId,
  registerImportedPackageFromRuntime,
  hasBuiltInPackage,
} from '../packages/packageRegistry.js'

export {
  PACKAGE_DEFINITIONS,
  mergePackageLists,
  getPackageEntry,
  listPackagesForBrowse,
  listLauncherSystemSummaries,
  tileClassForLauncherGroup,
  registerImportedPackageFromRuntime,
  hasBuiltInPackage,
}

/** @deprecated — registry-driven; use listLauncherSystemSummaries */
export const LAUNCHER_GAMES = []

export function getGameById() {
  return null
}

export function getLauncherGames() {
  return []
}

/**
 * Legacy shape for theme hints / older screens.
 * Maps unified registry row → previous CONTENT_PACKAGES row.
 */
export function getPackageCatalogMeta(packageKey) {
  const e = getPackageEntry(packageKey)
  if (!e) return null
  return {
    packageKey: e.packageId,
    gameId: mapLauncherGroupToLegacyGameId(e.launcherGroupKey),
    title: e.title,
    systemLabel: e.systemDisplayName,
    source: e.sourceType,
    blurb: e.subtitle,
    suggestedTheme: e.suggestedTheme,
    estimatedEntities: e.entityCount,
  }
}

/** @deprecated — use listPackagesForBrowse({ launcherGroupKey }) */
export function listPackagesForGame(gameId) {
  const legacy = {
    wh40k: 'warhammer40k',
    aos: 'aos',
    skirmish: 'skirmish',
    rpg: 'rpg',
  }
  const key = legacy[gameId] || gameId
  return mergePackageLists().filter((p) => (p.launcherGroupKey || p.systemId) === key)
}

/** Flat list — built-in definitions only (tests / tooling) */
export const CONTENT_PACKAGES = PACKAGE_DEFINITIONS.map((p) => ({
  packageKey: p.packageId,
  gameId: mapLauncherGroupToLegacyGameId(p.launcherGroupKey),
  title: p.title,
  systemLabel: p.systemDisplayName,
  source: p.sourceType,
  blurb: p.subtitle,
  suggestedTheme: p.suggestedTheme,
  estimatedEntities: p.entityCount,
}))

export { mapAdapterSystemIdToLauncherGroup as mapRegistrySystemToLauncherGame } from '../packages/packageRegistry.js'
