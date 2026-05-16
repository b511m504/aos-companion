/**
 * Legacy helper — prefer `packagePipeline.fetchBuiltInPackageJson` + `processRawPackageJson` in store.
 * Kept for scripts/tests that only need raw JSON bytes.
 */
export { fetchBuiltInPackageJson as loadRosterByPackage } from './packagePipeline.js'
