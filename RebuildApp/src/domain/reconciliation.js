/**
 * Reconciliation policy entry points for gameplay entities.
 * Core logic lives in `entityRegistry.js` (`registerEntityDeterministic`).
 */

export { registerEntityDeterministic, tombstoneEntity, resolveEntityIdByUid } from './entityRegistry.js'
