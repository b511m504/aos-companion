import { createSelector } from './_memo.js'

export const selectActiveEntities = createSelector(
  'selectActiveEntities',
  (s) => s?.runtimeUnits || {},
  (units) =>
    Object.entries(units)
      .filter(([, ru]) => ru?.activated || ru?.destroyed)
      .map(([id]) => id)
      .sort()
)

export const selectVisibleRuntimeUnits = createSelector(
  'selectVisibleRuntimeUnits',
  (s) => ({
    units: s?.runtimeUnits || {},
    roster: s?.activeRoster?.units || [],
  }),
  ({ units, roster }) => {
    const rosterMap = new Map(roster.map((u) => [u.id, u]))
    return Object.entries(units)
      .map(([id, ru]) => ({
        id,
        name: rosterMap.get(id)?.name || ru?.name || id,
        activated: Boolean(ru?.activated),
        destroyed: Boolean(ru?.destroyed),
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  }
)

