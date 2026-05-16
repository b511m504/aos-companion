function stable(value) {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map(stable)
  if (typeof value === 'object') {
    const out = {}
    for (const k of Object.keys(value).sort()) {
      out[k] = stable(value[k])
    }
    return out
  }
  return value
}

export function stableStringify(value) {
  return JSON.stringify(stable(value))
}

export function fnv1a32(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function hashRuntimeStateShape(state) {
  const shape = {
    runtimeEpoch: Number(state?.runtimeEpoch || 0),
    runtimeGroupId: String(state?.selectedLauncherGroupKey || ''),
    packageId: String(state?.selectedPackage || ''),
    entityActivationSet: Object.entries(state?.runtimeUnits || {})
      .filter(([, ru]) => ru?.activated || ru?.destroyed)
      .map(([id, ru]) => [id, !!ru?.activated, !!ru?.destroyed])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    assignments: Object.entries(state?.nfcAssignments || {})
      .map(([id, rec]) => [id, rec?.uid || ''])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    scenarioStateVersion: Number(state?.runtimeSuspendEpoch || 0),
    actionSequence: Number(state?.runtimeActionSequence || 0),
  }
  return fnv1a32(stableStringify(shape))
}