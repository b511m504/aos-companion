function classify(msg) {
  if (msg.includes('mismatch') || msg.includes('missing')) return 'warning'
  if (msg.includes('audit_threw')) return 'critical'
  return 'info'
}

export function auditRuntimeInvariants(state) {
  const issues = []

  try {
    if (state.runtimeResolvedUnit && state.activeRoster?.units) {
      const id = state.runtimeResolvedUnit.id
      const u = state.activeRoster.units.find((x) => x.id === id)
      if (!u) issues.push({ severity: classify('resolved_unit_missing_from_roster'), message: 'resolved_unit_missing_from_roster' })
    }

    if (state.runtimeUnits && typeof state.runtimeUnits === 'object') {
      const keys = Object.keys(state.runtimeUnits)
      const uniq = new Set(keys)
      if (uniq.size !== keys.length) issues.push({ severity: classify('runtime_units_duplicate_keys'), message: 'runtime_units_duplicate_keys' })
    }

    const ents = state.runtimeRegistry?.entities
    const nfc = state.nfcAssignments || {}
    if (Array.isArray(ents)) {
      for (const e of ents) {
        const id = e.entityId
        const cert = nfc[id]
        const uid = cert?.uid
        if (!uid) continue
        const at = state.assignedTags?.[uid]
        if (at && at.unitId && at.unitId !== id) {
          issues.push({ severity: classify('assigned_tag_mismatch'), message: `assigned_tag_mismatch uid=${uid}` })
          break
        }
      }
    }

  } catch {
    issues.push({ severity: 'critical', message: 'audit_threw' })
  }

  return {
    issues,
    warnings: issues.map((i) => i.message),
    criticalCount: issues.filter((i) => i.severity === 'critical').length,
    warningCount: issues.filter((i) => i.severity === 'warning').length,
    infoCount: issues.filter((i) => i.severity === 'info').length,
  }
}
