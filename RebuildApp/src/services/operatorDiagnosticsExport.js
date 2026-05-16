import { SESSION_SNAPSHOT_SCHEMA_VERSION } from './sessionSnapshot.js'
import { validateAssignmentsDeep } from './operatorAssignmentService.js'

/**
 * Strip preview payload so diagnostics never embed a full backup blob.
 * @param {unknown} preview
 */
function sanitizeOperatorBackupPreviewForExport(preview) {
  if (!preview || typeof preview !== 'object') return null
  const p = /** @type {Record<string, unknown>} */ (preview)
  const bundle = p.bundle
  const assignmentCount =
    bundle && typeof bundle === 'object' && Array.isArray(bundle.assignments)
      ? bundle.assignments.length
      : 0
  return {
    ok: p.ok === true,
    at: typeof p.at === 'number' ? p.at : null,
    safeCount: typeof p.safeCount === 'number' ? p.safeCount : null,
    conflictCount: typeof p.conflictCount === 'number' ? p.conflictCount : null,
    unknownCount: typeof p.unknownCount === 'number' ? p.unknownCount : null,
    commitHint: typeof p.commitHint === 'string' ? p.commitHint : null,
    errors: Array.isArray(p.errors) ? p.errors.map((e) => String(e)) : null,
    bundleAssignmentCount: assignmentCount,
  }
}

/**
 * Read-only diagnostics bundle for field support. Does not mutate `input.state`.
 * Omits free-text roster lists, raw backup JSON, and full user-agent strings.
 * @param {{ state: object, buildInfo?: object }} input
 */
export function buildOperatorDiagnosticsPayload(input) {
  const state = input.state && typeof input.state === 'object' ? input.state : {}
  const entities = Array.isArray(state.runtimeRegistry?.entities) ? state.runtimeRegistry.entities : []
  const entityCount = entities.length
  const nfc = state.nfcAssignments && typeof state.nfcAssignments === 'object' ? state.nfcAssignments : {}
  const tags = state.assignedTags && typeof state.assignedTags === 'object' ? state.assignedTags : {}
  const integrity = validateAssignmentsDeep({
    nfcAssignments: nfc,
    assignedTags: tags,
    entities,
    packageKey: String(state.selectedPackage || ''),
  })
  const bi = input.buildInfo && typeof input.buildInfo === 'object' ? input.buildInfo : {}
  const metrics = state.scanSessionMetrics && typeof state.scanSessionMetrics === 'object' ? { ...state.scanSessionMetrics } : null

  let viewport = null
  if (typeof window !== 'undefined') {
    viewport = { w: window.innerWidth, h: window.innerHeight }
  }

  return {
    kind: 'spearhead_operator_diagnostics',
    exportedAt: new Date().toISOString(),
    sessionSnapshotSchemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION,
    buildInfo: {
      displayVersion: bi.displayVersion || bi.appVersion,
      packageVersion: bi.packageVersion,
      buildTime: bi.buildTime,
      gitHash: bi.gitHash,
      runtimeMode: bi.runtimeMode,
    },
    operatorHydrationWarning: String(state.operatorHydrationWarning || ''),
    operatorBackupImportPreview: sanitizeOperatorBackupPreviewForExport(state.operatorBackupImportPreview),
    assignmentIntegrity: {
      level: integrity.level,
      duplicateUids: integrity.duplicateUids,
      malformed: integrity.malformed,
      warnings: integrity.warnings,
      orphanNfcKeys: integrity.orphanNfcKeys,
      orphanTagBindings: integrity.orphanTagBindings,
      invalidPackageRefs: integrity.invalidPackageRefs,
      mirrorDriftCount: integrity.mirrorDriftCount,
    },
    scanSessionMetrics: metrics,
    screen: state.currentScreen,
    appMode: state.appMode,
    packageKey: state.selectedPackage || '',
    rosterEntityCount: entityCount,
    environment: {
      userAgentPresent: typeof navigator !== 'undefined' && Boolean(navigator.userAgent),
      viewport,
    },
  }
}

export function stringifyOperatorDiagnosticsPayload(input) {
  return JSON.stringify(buildOperatorDiagnosticsPayload(input), null, 2)
}
