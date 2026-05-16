import { createSelector } from './_memo.js'

export const selectAssignmentsForPackage = createSelector(
  'selectAssignmentsForPackage',
  (s) => ({
    packageId: s?.selectedPackage || '',
    nfcAssignments: s?.nfcAssignments || {},
  }),
  ({ packageId, nfcAssignments }) => ({
    packageId,
    assignments: Object.entries(nfcAssignments)
      .map(([entityId, rec]) => ({ entityId, uid: rec?.uid || '' }))
      .filter((r) => r.uid)
      .sort((a, b) => a.entityId.localeCompare(b.entityId)),
  })
)

