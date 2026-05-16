/** Built-in & demo lists — URLs under /public (static assets). Keys match launcher catalog. */
export const BUILT_IN_PACKAGE_URLS = {
  'Test Army Alpha': '/rosters/test-army-alpha.json',
  'Test Army Beta': '/rosters/test-army-beta.json',
  'demo-aos-stormhost': '/rosters/demo-aos-stormhost.json',
  'demo-40k-strike': '/rosters/demo-40k-strike.json',
  'demo-skirmish-squad': '/rosters/demo-skirmish-squad.json',
  'demo-rpg-encounter': '/rosters/demo-rpg-encounter.json',
  'demo-objectives-set': '/rosters/demo-objectives-set.json',
  'demo-card-token-board': '/rosters/demo-card-token-board.json',
  'demo-vehicle-convoy': '/rosters/demo-vehicle-convoy.json',
  'demo-battletech-stars': '/rosters/demo-battletech-stars.json',
  'demo-cyberpunk-run': '/rosters/demo-cyberpunk-run.json',
}

export function getBuiltInPackageKeys() {
  return Object.keys(BUILT_IN_PACKAGE_URLS)
}

/**
 * @param {string} packageKey
 * @returns {string | null}
 */
export function resolveBuiltInPackageUrl(packageKey) {
  return BUILT_IN_PACKAGE_URLS[packageKey] ?? null
}
