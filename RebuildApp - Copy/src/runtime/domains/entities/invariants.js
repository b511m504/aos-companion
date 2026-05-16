export function auditEntityDomain(state) {
  const warnings = []
  if (
    state.runtimeResolvedUnit &&
    Array.isArray(state.activeRoster?.units) &&
    state.activeRoster.units.length > 0
  ) {
    const id = state.runtimeResolvedUnit.id
    const u = state.activeRoster.units.find((x) => x.id === id)
    if (!u) warnings.push('resolved_unit_missing_from_roster')
  }
  if (state.runtimeUnits && typeof state.runtimeUnits === 'object') {
    const keys = Object.keys(state.runtimeUnits)
    const uniq = new Set(keys)
    if (uniq.size !== keys.length) warnings.push('runtime_units_duplicate_keys')
  }
  return warnings
}