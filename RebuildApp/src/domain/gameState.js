/**
 * @typedef {object} GameplayEntity
 * @property {string} entityId
 * @property {string} uid
 * @property {string} entityType
 * @property {string} ownerId
 * @property {number} revision
 * @property {Record<string, unknown>} state
 * @property {Record<string, unknown>} metadata
 * @property {boolean} tombstone
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/**
 * @typedef {object} GameplayEntityRegistry
 * @property {Record<string, GameplayEntity>} entitiesById
 * @property {Record<string, string>} entityIdByUid
 * @property {number} registrationSeq
 */

/**
 * @typedef {object} GameplayZone
 * @property {string} zoneId
 * @property {string} zoneType
 * @property {string[]} entitiesPresent
 * @property {string} ownership
 * @property {Record<string, unknown>} state
 */

/**
 * @typedef {object} GameplayState
 * @property {number} version
 * @property {number} turn
 * @property {number} round
 * @property {string} phase
 * @property {string} activePlayerId
 * @property {Record<string, unknown>} objectives
 * @property {Record<string, GameplayZone>} zones
 * @property {GameplayEntityRegistry} entityRegistry
 * @property {{ aurasById: Record<string, unknown>, indexByEmitter: Record<string, string[]> }} auraState
 * @property {Record<string, boolean|number|string>} gameplayFlags
 * @property {Array<{ seq: number, type: string, payload: Record<string, unknown> }>} timeline
 * @property {{ uid: string, entityId: string|null, scanSeq: number } | null} lastScan
 * @property {{ registerOpen: boolean, registerUid: string, feedback: Record<string, unknown> | null }} ui
 */

import { emptyEntityRegistry } from './entityRegistry.js'
import { createZoneRecord, ZONE_TYPES } from './zones.js'

const TIMELINE_MAX = 64

/** @returns {GameplayState} */
export function createInitialGameplayState() {
  const zones = Object.create(null)
  zones.obj_zone_alpha = createZoneRecord('obj_zone_alpha', ZONE_TYPES.OBJECTIVE_RANGE, [], '', {
    objectiveId: 'obj_alpha',
  })
  zones.obj_zone_beta = createZoneRecord('obj_zone_beta', ZONE_TYPES.SCORING, [], '', {
    objectiveId: 'obj_beta',
  })
  return {
    version: 1,
    turn: 1,
    round: 1,
    phase: 'command',
    activePlayerId: 'p1',
    objectives: {
      obj_alpha: {
        status: 'neutral',
        progress: 0,
        ownerEntityId: '',
        owner: '',
        scanCount: 0,
        capturePhase: 'idle',
      },
      obj_beta: {
        status: 'neutral',
        progress: 0,
        ownerEntityId: '',
        owner: '',
        scanCount: 0,
        capturePhase: 'idle',
      },
    },
    zones,
    entityRegistry: emptyEntityRegistry(),
    auraState: { aurasById: Object.create(null), indexByEmitter: Object.create(null) },
    gameplayFlags: Object.create(null),
    timeline: [],
    /** Monotonic gameplay event counter (deterministic; not wall clock). */
    eventSeq: 0,
    lastScan: null,
    ui: { registerOpen: false, registerUid: '', feedback: null },
  }
}

/** @param {GameplayState} g */
export function cloneGameplayState(g) {
  const base = g && typeof g === 'object' ? g : createInitialGameplayState()
  const er = base.entityRegistry || emptyEntityRegistry()
  const entitiesById = { ...er.entitiesById }
  for (const k of Object.keys(entitiesById)) {
    const e = entitiesById[k]
    entitiesById[k] = e && typeof e === 'object' ? { ...e, state: { ...e.state }, metadata: { ...e.metadata } } : e
  }
  return {
    version: Number(base.version) || 1,
    turn: Number(base.turn) || 0,
    round: Number(base.round) || 1,
    phase: String(base.phase || 'pre_game'),
    activePlayerId: String(base.activePlayerId || ''),
    objectives: { ...base.objectives },
    zones: { ...base.zones },
    entityRegistry: {
      entitiesById,
      entityIdByUid: { ...er.entityIdByUid },
      registrationSeq: Number(er.registrationSeq) || 0,
    },
    auraState: {
      aurasById: { ...base.auraState?.aurasById },
      indexByEmitter: { ...(base.auraState?.indexByEmitter || {}) },
    },
    gameplayFlags: { ...base.gameplayFlags },
    timeline: Array.isArray(base.timeline) ? base.timeline.map((e) => ({ ...e, payload: { ...e.payload } })) : [],
    eventSeq: Number(base.eventSeq) || 0,
    lastScan: base.lastScan && typeof base.lastScan === 'object' ? { ...base.lastScan } : null,
    ui: {
      registerOpen: Boolean(base.ui?.registerOpen),
      registerUid: String(base.ui?.registerUid || ''),
      feedback: base.ui?.feedback && typeof base.ui.feedback === 'object' ? { ...base.ui.feedback } : null,
    },
  }
}

/**
 * @param {GameplayState} gameplay
 * @param {string} type
 * @param {Record<string, unknown>} payload
 */
export function appendGameplayTimeline(gameplay, type, payload) {
  const g = cloneGameplayState(gameplay)
  g.eventSeq += 1
  const seq = g.eventSeq
  g.timeline.push({
    seq,
    type: String(type || ''),
    payload: payload && typeof payload === 'object' ? { ...payload } : {},
  })
  if (g.timeline.length > TIMELINE_MAX) g.timeline.splice(0, g.timeline.length - TIMELINE_MAX)
  return g
}
