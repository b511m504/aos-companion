/**
 * Deterministic objective + objective-zone updates driven by resolved entity scans.
 */

import { cloneGameplayState } from './gameState.js'
import { applyEntityEnteredZone } from './zones.js'

/**
 * When a resolved entity scans, associate it with objective_range / scoring zones
 * and advance capture progress (prototype: scan count gates completion).
 * @param {import('./gameState.js').GameplayState} gameplay
 * @param {string} entityId
 * @returns {{ gameplay: import('./gameState.js').GameplayState, timelineNotes: object[] }}
 */
export function applyObjectiveFlowOnEntityScan(gameplay, entityId) {
  const eid = String(entityId || '').trim()
  let next = cloneGameplayState(gameplay)
  const timelineNotes = []
  if (!eid) return { gameplay: next, timelineNotes }

  const zones = next.zones || {}
  const touchedObjectiveIds = new Set()

  for (const zid of Object.keys(zones)) {
    const z = zones[zid]
    if (!z || (z.zoneType !== 'objective_range' && z.zoneType !== 'scoring')) continue

    const present = Array.isArray(z.entitiesPresent) ? z.entitiesPresent : []
    if (!present.includes(eid)) {
      next.zones = applyEntityEnteredZone(next.zones, zid, eid)
      timelineNotes.push({ zoneId: zid, entityId: eid, kind: 'zone_enter_implicit' })
    }

    const oid = String(z.state?.objectiveId || zid)
    touchedObjectiveIds.add(oid)
  }

  for (const oid of touchedObjectiveIds) {
    const prevO = next.objectives[oid] && typeof next.objectives[oid] === 'object' ? next.objectives[oid] : {}
    const scanCount = Number(prevO.scanCount || 0) + 1
    let capturePhase = 'idle'
    let progress = Number(prevO.progress) || 0
    let status = String(prevO.status || 'neutral')
    const owner = String(prevO.ownerEntityId || prevO.owner || eid)

    if (scanCount === 1) {
      capturePhase = 'started'
      progress = Math.min(100, 45)
      timelineNotes.push({ objectiveId: oid, entityId: eid, kind: 'OBJECTIVE_CAPTURE_STARTED' })
    } else {
      capturePhase = 'completed'
      progress = 100
      status = 'captured'
      timelineNotes.push({ objectiveId: oid, entityId: eid, kind: 'OBJECTIVE_CAPTURE_COMPLETED' })
    }

    next.objectives = {
      ...next.objectives,
      [oid]: {
        ...prevO,
        ownerEntityId: owner || eid,
        owner: owner || eid,
        scanCount,
        progress,
        status,
        capturePhase,
        lastActorEntityId: eid,
      },
    }

    for (const zid of Object.keys(next.zones)) {
      const z = next.zones[zid]
      const zOid = String(z?.state?.objectiveId || zid)
      if (zOid !== oid) continue
      next.zones = {
        ...next.zones,
        [zid]: { ...z, ownership: owner || eid },
      }
    }
  }

  return { gameplay: next, timelineNotes }
}
