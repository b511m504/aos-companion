export function selectActiveRuntimeEntitySet(state) {
  const units = state?.runtimeUnits || {}
  const ids = []
  for (const [id, ru] of Object.entries(units)) {
    if (ru?.activated || ru?.destroyed) ids.push(id)
  }
  ids.sort()
  return ids
}