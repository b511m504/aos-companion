/**
 * Deterministic demo tabletop preset — merged via GAMEPLAY_SCENARIO_APPLIED only.
 */

import { cloneGameplayState, appendGameplayTimeline } from './gameState.js'
import { cloneZones } from './zones.js'
import {
  createEntityRecord,
  registerEntityDeterministic,
  ENTITY_TYPES,
} from './entityRegistry.js'

export const DEMO_SCENARIO_PRESETS = Object.freeze({
  demo_quick_skirmish: 'demo_quick_skirmish',
})

/**
 * Minimal runtime registry: two small forces (4 units total).
 * @returns {import('../runtime/runtimeEntityFactory.js').RuntimeEntity[]}
 */
export function buildDemoRuntimeEntities() {
  const rows = [
    { id: 'demo_u_a1', name: 'Vanguard Alpha', wounds: 4, entityType: 'UNIT', subtitle: 'Stormhost' },
    { id: 'demo_u_a2', name: 'Liberator Alpha', wounds: 2, entityType: 'UNIT', subtitle: 'Stormhost' },
    { id: 'demo_u_b1', name: 'Brute Boss Beta', wounds: 5, entityType: 'UNIT', subtitle: 'Orruk' },
    { id: 'demo_u_b2', name: 'Hobgrot Beta', wounds: 2, entityType: 'UNIT', subtitle: 'Orruk' },
  ]
  return rows.map((u, i) => ({
    entityId: u.id,
    entityType: String(u.entityType || 'UNIT').toUpperCase().replace(/\s+/g, '_'),
    systemId: 'demo-skirmish',
    display: {
      name: String(u.name),
      subtitle: String(u.subtitle || ''),
      icon: null,
    },
    fields: { wounds: Number(u.wounds) || 0 },
    capabilities: { nfcBindable: true, woundTrackable: true, activatable: true },
    certification: { required: false },
    relationships: [],
  }))
}

export function buildDemoRuntimeRegistry() {
  return {
    entities: buildDemoRuntimeEntities(),
    relationships: [],
    metadata: {
      systemId: 'demo-skirmish',
      listName: 'Demo quick skirmish',
      factionName: 'Stormhost vs Orruk',
      factionSummary: 'Stormhost Vanguard vs Orruk raiders',
    },
  }
}

/**
 * Register preset units in gameplay registry (UID `preset:<entityId>`) so scans / zones validate.
 * @param {import('./gameState.js').GameplayState} gameplay
 */
export function seedDemoGameplayEntityRegistry(gameplay) {
  const demoIds = ['demo_u_a1', 'demo_u_a2', 'demo_u_b1', 'demo_u_b2']
  let reg = gameplay.entityRegistry
  for (const eid of demoIds) {
    const uid = `preset:${eid}`
    const seq = Number(reg.registrationSeq) || 0
    const rec = createEntityRecord(
      eid,
      uid,
      ENTITY_TYPES.MINIATURE,
      eid.startsWith('demo_u_a') ? 'p1' : 'p2',
      1,
      {},
      { demoPreset: true },
      seq + 1,
      seq + 1
    )
    const { registry } = registerEntityDeterministic(reg, rec)
    reg = registry
  }
  return reg
}

/**
 * Merge preset into gameplay (pure).
 * @param {import('./gameState.js').GameplayState} gameplay
 * @param {string} preset
 */
export function mergeDemoScenarioIntoGameplay(gameplay, preset) {
  if (preset !== DEMO_SCENARIO_PRESETS.demo_quick_skirmish) {
    return { gameplay: cloneGameplayState(gameplay), applied: false }
  }

  let next = cloneGameplayState(gameplay)
  next.entityRegistry = seedDemoGameplayEntityRegistry(next)

  const zones = cloneZones(next.zones)
  zones.obj_zone_alpha = {
    ...zones.obj_zone_alpha,
    entitiesPresent: ['demo_u_a1'],
    ownership: 'demo_u_a1',
    state: { ...(zones.obj_zone_alpha?.state || {}), objectiveId: 'obj_alpha' },
  }
  zones.obj_zone_beta = {
    ...zones.obj_zone_beta,
    entitiesPresent: ['demo_u_b1'],
    ownership: 'demo_u_b1',
    state: { ...(zones.obj_zone_beta?.state || {}), objectiveId: 'obj_beta' },
  }

  next.zones = zones
  next.objectives = {
    obj_alpha: {
      status: 'contested',
      progress: 55,
      ownerEntityId: 'demo_u_a1',
      owner: 'demo_u_a1',
      scanCount: 1,
      capturePhase: 'started',
    },
    obj_beta: {
      status: 'neutral',
      progress: 20,
      ownerEntityId: 'demo_u_b1',
      owner: 'demo_u_b1',
      scanCount: 1,
      capturePhase: 'started',
    },
  }

  next.phase = 'command'
  next.round = 1
  next.turn = 1
  next.activePlayerId = 'p1'

  next.timeline = []
  next.eventSeq = 0

  next = appendGameplayTimeline(next, 'GAMEPLAY_SCENARIO_APPLIED', { preset: 'demo_quick_skirmish' })
  next = appendGameplayTimeline(next, 'GAMEPLAY_ROUND_ADVANCED', { round: 1 })
  next = appendGameplayTimeline(next, 'GAMEPLAY_PHASE_CHANGED', { phase: 'command' })
  next = appendGameplayTimeline(next, 'GAMEPLAY_ENTITY_ENTERED_ZONE', {
    zoneId: 'obj_zone_alpha',
    entityId: 'demo_u_a1',
  })
  next = appendGameplayTimeline(next, 'GAMEPLAY_OBJECTIVE_CAPTURE_STARTED', {
    objectiveId: 'obj_alpha',
    entityId: 'demo_u_a1',
  })

  next.lastScan = null
  next.ui = { registerOpen: false, registerUid: '', feedback: null }

  return { gameplay: next, applied: true }
}
