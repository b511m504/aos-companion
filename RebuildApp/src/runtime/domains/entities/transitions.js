import { RUNTIME_ACTION_TYPES } from '../../runtimeActionSchema.js'
import { RUNTIME_EFFECT_REPLAY_POLICY } from '../../effects/index.js'
import { runtimeClock } from '../../runtimeClock.js'
import { isPackageBrowseNfcScreen } from '../../nfcScanRouting.js'

const LOOKUP_HISTORY_MAX = 15
/** Runtime-safe duplicate suppression window (ms), keyed by tag + outcome class. */
const NFC_SEMANTIC_DEDUP_MS = 420

function findUnitById(roster, id) {
  const units = roster?.units
  if (!Array.isArray(units)) return null
  return units.find((u) => u.id === id) ?? null
}

function isNavigationAction(action) {
  return action.type === RUNTIME_ACTION_TYPES.RUNTIME_NFC_SCAN
}

function findEntityInRegistry(registry, entityId) {
  const ents = registry?.entities
  if (!Array.isArray(ents)) return null
  return ents.find((e) => e.entityId === entityId) ?? null
}

/**
 * Generalized entity resolution: roster units → runtime registry → assignment binding metadata.
 * @returns {{ unit: { id: string, name: string, wounds: number }, lookupSource: string } | null}
 */
export function resolveVirtualUnitForBinding(prevState, binding) {
  const id = binding?.unitId || binding?.entityId
  if (!id) return null
  const roster = prevState.activeRoster
  if (Array.isArray(roster?.units)) {
    const u = findUnitById(roster, id)
    if (u) return { unit: { id: u.id, name: u.name, wounds: Number(u.wounds) }, lookupSource: 'roster' }
  }
  const ent = findEntityInRegistry(prevState.runtimeRegistry, id)
  if (ent) {
    const w = Number(ent.gameplay?.woundsMax ?? ent.wounds ?? 0) || 0
    return {
      unit: {
        id: ent.entityId,
        name: ent.display?.name ?? ent.entityId,
        wounds: w,
      },
      lookupSource: 'registry',
    }
  }
  const name =
    binding.unitName ||
    prevState.nfcAssignments?.[id]?.displayName ||
    prevState.nfcAssignments?.[id]?.name ||
    id
  return {
    unit: { id, name: String(name), wounds: 0 },
    lookupSource: 'binding_only',
  }
}

function semanticOutcomeKey(prevState, binding) {
  if (!binding) return 'unknown_tag'
  const roster = prevState.activeRoster
  const hasRoster = Array.isArray(roster?.units) && roster.units.length > 0
  if (hasRoster) {
    const unit = findUnitById(roster, binding.unitId || binding.entityId)
    if (!unit) return 'unit_not_in_roster'
  }
  const id = binding.unitId || binding.entityId
  return id ? `resolved:${id}` : 'unknown_tag'
}

function shouldSuppressDuplicate(prevState, tagId, at, outcomeKey) {
  const d = prevState.nfcScanDedupe
  if (!d || d.tagId !== tagId) return false
  if (outcomeKey !== d.outcomeKey) return false
  return at - Number(d.at || 0) < NFC_SEMANTIC_DEDUP_MS
}

function pushHistory(prevState, entry) {
  const list = Array.isArray(prevState.runtimeLookupHistory) ? prevState.runtimeLookupHistory : []
  return [...list, entry].slice(-LOOKUP_HISTORY_MAX)
}

function navigationSelectionPatch(prevState, unit) {
  const units = prevState.activeRoster?.units
  if (!Array.isArray(units) || !unit) return {}
  const idx = units.findIndex((u) => u.id === unit.id)
  return {
    selectedEntity: unit.id,
    selectedEntityId: unit.id,
    selectedEntityName: unit.name,
    selectedEntityIndex: idx >= 0 ? idx : null,
    nfcStatus: 'idle',
    lastAssignmentResult: null,
    nfcUiHighlightEntityId: unit.id,
    nfcTapSelectDetailOpen: true,
  }
}

function packageBrowseHighlightPatch(unit, tagId, lookupSource) {
  return {
    packageNfcHighlightEntityId: unit.id,
    packageNfcHighlightTagId: tagId,
    packageNfcLookupSource: lookupSource,
    nfcUiHighlightEntityId: unit.id,
    nfcTapSelectDetailOpen: false,
  }
}

function latencyPatch(action) {
  const at = Number(action.receivedAt) || 0
  const now = runtimeClock.now()
  const ms = at > 0 ? Math.max(0, now - at) : 0
  return {
    nfcLastDispatchLatencyMs: ms,
    nfcLastScannedUid: String(action.uid || '').trim(),
  }
}

function scanRouteFromPayload(action) {
  return String(action?.payload?.scanRoute || '')
}

function packageSemanticBinding(prevState, tagId) {
  if (!tagId) return null
  const def = prevState.packageRuntimeDefinition
  const map =
    def?.uidMappings && typeof def.uidMappings === 'object'
      ? def.uidMappings[String(tagId || '').trim().toUpperCase()]
      : null
  if (!map) return null
  const entityId = String(map.runtimeEntityId || map.entityId || '').trim()
  if (!entityId) return null
  return {
    unitId: entityId,
    entityId,
    unitName: String(map.entityId || entityId),
    semanticActionId: String(map.actionId || '').trim(),
    semanticEntityId: String(map.entityId || entityId),
    bindingSource: 'package_mapping',
  }
}

/**
 * @param {object} prevState
 * @param {object} action
 */
export function transitionResolveTag(prevState, action) {
  const types = [
    RUNTIME_ACTION_TYPES.RUNTIME_RESOLVE_TAG,
    RUNTIME_ACTION_TYPES.RUNTIME_NFC_SCAN,
    RUNTIME_ACTION_TYPES.PACKAGE_SEMANTIC_ACTION,
  ]
  if (!types.includes(action.type)) {
    return { handled: false }
  }
  if (action.type === RUNTIME_ACTION_TYPES.PACKAGE_SEMANTIC_ACTION) {
    const entityId = String(action.entityId || action.payload?.entityId || '').trim()
    const semanticActionId = String(action.payload?.actionId || '').trim()
    const mutation = String(action.payload?.mutation || '').trim().toUpperCase()
    const amount = Number(action.payload?.amount) || 0
    const ru = prevState.runtimeUnits?.[entityId]
    if (!ru) {
      return {
        handled: true,
        outcome: 'rejected',
        reason: 'unknown_entity',
        actionLabel: `package semantic rejected: ${semanticActionId || mutation}`,
      }
    }
    if (mutation !== 'APPLY_WOUND') {
      return {
        handled: true,
        outcome: 'rejected',
        reason: 'unsupported_package_mutation',
        actionLabel: `package semantic rejected: ${semanticActionId || mutation}`,
      }
    }
    const nextWounds = Math.max(0, Number(ru.woundsCurrent ?? ru.woundsMax ?? 0) - Math.max(1, amount))
    const nextDestroyed = nextWounds <= 0 ? true : Boolean(ru.destroyed)
    return {
      handled: true,
      outcome: 'resolved',
      actionLabel: `package semantic ${semanticActionId || mutation} -> ${entityId}`,
      patch: {
        runtimeUnits: {
          ...(prevState.runtimeUnits || {}),
          [entityId]: {
            ...ru,
            woundsCurrent: nextWounds,
            destroyed: nextDestroyed,
            lastModifiedAt: Number(action.receivedAt) || runtimeClock.now(),
          },
        },
      },
      recordActions: [
        { type: 'PACKAGE_SEMANTIC_ACTION', value: `${semanticActionId || mutation}:${entityId}` },
      ],
      effects: [
        {
          type: 'OVERLAY_NOTIFY',
          replayPolicy: RUNTIME_EFFECT_REPLAY_POLICY.SUPPRESS,
          payload: { message: `Semantic action ${semanticActionId || mutation} on ${entityId}` },
        },
      ],
    }
  }

  const navigate = isNavigationAction(action)
  const tagId = String(action.uid || '').trim()
  const at = Number(action.receivedAt) || runtimeClock.now()
  const nextActionSeq = Number(action.actionSequence || (prevState.runtimeActionSequence || 0) + 1)
  const binding =
    (tagId ? prevState.assignedTags?.[tagId] : null) || packageSemanticBinding(prevState, tagId)
  const outcomeKey = semanticOutcomeKey(prevState, binding)
  const gameplayResolve = action.type === RUNTIME_ACTION_TYPES.RUNTIME_RESOLVE_TAG
  const packageBrowse = navigate && isPackageBrowseNfcScreen(prevState.currentScreen)
  const hasRoster = Boolean(prevState.activeRoster?.units?.length)

  if (gameplayResolve) {
    if (!prevState.activeRoster || !Array.isArray(prevState.activeRoster.units) || !prevState.activeRoster.units.length) {
      const result = { ok: false, reason: 'no_roster', tagId, at }
      return {
        handled: true,
        outcome: 'rejected',
        reason: 'no_roster',
        actionLabel: 'runtime lookup failed: no roster',
        patch: {
          runtimeResolvedTag: null,
          runtimeResolvedUnit: null,
          runtimeLastLookupResult: result,
          runtimeLookupHistory: pushHistory(prevState, result),
          runtimeActionSequence: nextActionSeq,
          nfcScanReceiptState: 'no_roster',
          nfcLastScanReceiptAt: at,
          nfcLastResolvedEntityId: null,
          nfcLastRuntimeDispatchOk: false,
          nfcTapSelectDetailOpen: false,
          nfcLastScanRoute: scanRouteFromPayload(action) || 'runtime_resolve',
          nfcScanDedupe: { tagId, at, outcomeKey: 'no_roster' },
          ...latencyPatch(action),
        },
        recordActions: [{ type: 'RUNTIME_TAG_LOOKUP', value: tagId }],
      }
    }
  } else if (navigate) {
    if (!hasRoster && !isPackageBrowseNfcScreen(prevState.currentScreen)) {
      const result = { ok: false, reason: 'no_roster', tagId, at }
      return {
        handled: true,
        outcome: 'rejected',
        reason: 'no_roster',
        actionLabel: 'nfc scan: no roster on non-package screen',
        patch: {
          runtimeResolvedTag: null,
          runtimeResolvedUnit: null,
          runtimeLastLookupResult: result,
          runtimeLookupHistory: pushHistory(prevState, result),
          runtimeActionSequence: nextActionSeq,
          nfcScanReceiptState: 'no_roster',
          nfcLastScanReceiptAt: at,
          nfcLastResolvedEntityId: null,
          nfcLastRuntimeDispatchOk: false,
          nfcTapSelectDetailOpen: false,
          nfcLastScanRoute: scanRouteFromPayload(action) || 'nfc_scan',
          nfcScanDedupe: { tagId, at, outcomeKey: 'no_roster' },
          ...latencyPatch(action),
        },
        recordActions: [{ type: 'RUNTIME_TAG_LOOKUP', value: tagId }],
      }
    }
  }

  if (tagId && shouldSuppressDuplicate(prevState, tagId, at, outcomeKey)) {
    const dupReceipt =
      packageBrowse && navigate ? 'package_scan_ignored' : 'duplicate_ignored'
    return {
      handled: true,
      outcome: 'rejected',
      reason: 'duplicate_ignored',
      actionLabel: 'nfc scan duplicate suppressed',
      patch: {
        nfcScanReceiptState: dupReceipt,
        nfcLastScanReceiptAt: at,
        nfcLastResolvedEntityId: binding?.unitId ?? binding?.entityId ?? null,
        nfcLastRuntimeDispatchOk: false,
        runtimeActionSequence: nextActionSeq,
        nfcScanDedupe: { tagId, at, outcomeKey },
        nfcLastScanRoute: scanRouteFromPayload(action) || (packageBrowse ? 'package_browse' : 'nfc_scan'),
        ...latencyPatch(action),
      },
      recordActions: [{ type: 'NFC_SCAN_DUPLICATE_IGNORED', value: tagId }],
    }
  }

  if (!binding) {
    const result = { ok: false, reason: 'unknown_tag', tagId, at }
    const missingReceipt = packageBrowse ? 'package_entity_missing' : 'unknown_tag'
    const navExtra = navigate
      ? {
          nfcUiHighlightEntityId: null,
          nfcTapSelectDetailOpen: false,
          packageNfcHighlightEntityId: null,
          packageNfcHighlightTagId: null,
          packageNfcLookupSource: null,
        }
      : {}
    return {
      handled: true,
      outcome: 'rejected',
      reason: 'unknown_tag',
      actionLabel: 'runtime lookup failed: tag not assigned',
      patch: {
        runtimeResolvedTag: null,
        runtimeResolvedUnit: null,
        runtimeLastLookupResult: result,
        runtimeLookupHistory: pushHistory(prevState, result),
        runtimeActionSequence: nextActionSeq,
        nfcScanReceiptState: missingReceipt,
        nfcLastScanReceiptAt: at,
        nfcLastResolvedEntityId: null,
        nfcLastRuntimeDispatchOk: false,
        nfcScanDedupe: { tagId, at, outcomeKey: 'unknown_tag' },
        nfcLastScanRoute: scanRouteFromPayload(action) || (packageBrowse ? 'package_browse' : 'nfc_scan'),
        ...navExtra,
        ...latencyPatch(action),
      },
      recordActions: [
        { type: 'RUNTIME_TAG_LOOKUP', value: tagId },
        { type: 'RUNTIME_LOOKUP_FAILED', value: 'unknown_tag' },
      ],
      effects: [
        {
          type: 'OVERLAY_NOTIFY',
          replayPolicy: RUNTIME_EFFECT_REPLAY_POLICY.SIMULATE,
          payload: { message: packageBrowse ? `No piece linked to tag ${tagId}` : `Unknown tag: ${tagId}` },
        },
      ],
    }
  }

  const resolved = resolveVirtualUnitForBinding(prevState, binding)
  if (!resolved?.unit) {
    const result = {
      ok: false,
      reason: 'unit_not_in_roster',
      tagId,
      boundUnitId: binding.unitId,
      at,
    }
    return {
      handled: true,
      outcome: 'rejected',
      reason: 'unit_not_in_roster',
      actionLabel: 'runtime lookup failed: could not resolve entity',
      patch: {
        runtimeResolvedTag: null,
        runtimeResolvedUnit: null,
        runtimeLastLookupResult: result,
        runtimeLookupHistory: pushHistory(prevState, result),
        runtimeActionSequence: nextActionSeq,
        nfcScanReceiptState: packageBrowse ? 'package_entity_missing' : 'unit_not_in_roster',
        nfcLastScanReceiptAt: at,
        nfcLastResolvedEntityId: binding.unitId,
        nfcLastRuntimeDispatchOk: false,
        nfcScanDedupe: { tagId, at, outcomeKey: 'unit_not_in_roster' },
        nfcLastScanRoute: scanRouteFromPayload(action) || 'nfc_scan',
        ...latencyPatch(action),
      },
      recordActions: [
        { type: 'RUNTIME_TAG_LOOKUP', value: tagId },
        { type: 'RUNTIME_LOOKUP_FAILED', value: 'unit_not_in_roster' },
      ],
      effects: [
        {
          type: 'OVERLAY_NOTIFY',
          replayPolicy: RUNTIME_EFFECT_REPLAY_POLICY.SIMULATE,
          payload: { message: `Tag bound to unresolved entity: ${tagId}` },
        },
      ],
    }
  }

  const unit = resolved.unit
  const unitSnapshot = {
    id: unit.id,
    name: unit.name,
    wounds: Number(unit.wounds),
  }
  const prevRu = prevState.runtimeUnits?.[unit.id]
  const mergedRu = prevRu
    ? {
        ...prevRu,
        unitId: unit.id,
        name: unit.name,
        woundsMax: Number(unit.wounds),
        woundsCurrent: prevRu.woundsCurrent != null ? prevRu.woundsCurrent : Number(unit.wounds),
        lastResolvedTagId: tagId,
        lastResolvedAt: at,
        lastModifiedAt: at,
      }
    : {
        entityId: unit.id,
        unitId: unit.id,
        name: unit.name,
        woundsMax: Number(unit.wounds),
        woundsCurrent: Number(unit.wounds),
        activated: false,
        destroyed: false,
        statusEffects: [],
        lastResolvedTagId: tagId,
        lastResolvedAt: at,
        lastModifiedAt: at,
      }

  const result = {
    ok: true,
    tagId,
    unitId: unit.id,
    unitName: unit.name,
    at,
    lookupSource: resolved.lookupSource,
    semanticActionId: binding?.semanticActionId || '',
    semanticEntityId: binding?.semanticEntityId || '',
    bindingSource: binding?.bindingSource || 'assignment',
  }

  let navPatch = {}
  if (navigate) {
    if (packageBrowse) {
      navPatch = packageBrowseHighlightPatch(unit, tagId, resolved.lookupSource)
    } else if (hasRoster) {
      navPatch = navigationSelectionPatch(prevState, unit)
    } else {
      navPatch = {
        nfcUiHighlightEntityId: unit.id,
        nfcTapSelectDetailOpen: false,
      }
    }
  }

  const successReceipt =
    packageBrowse && navigate ? 'package_entity_resolved' : 'resolved'

  const effects = [
    {
      type: 'PERSIST_SYNC',
      replayPolicy: RUNTIME_EFFECT_REPLAY_POLICY.REPLAY,
      payload: { reason: 'runtime_tag_resolve', unitId: unit.id, tagId },
    },
    {
      type: 'OVERLAY_NOTIFY',
      replayPolicy: RUNTIME_EFFECT_REPLAY_POLICY.SUPPRESS,
      payload: { message: `Resolved ${tagId} -> ${unit.id}` },
    },
  ]

  if (navigate) {
    if (packageBrowse) {
      effects.push({
        type: 'NFC_UI_SCROLL_PACKAGE_NFC',
        replayPolicy: RUNTIME_EFFECT_REPLAY_POLICY.SIMULATE,
        payload: { entityId: unit.id },
      })
    } else {
      effects.push({
        type: 'NFC_UI_SCROLL_ENTITY',
        replayPolicy: RUNTIME_EFFECT_REPLAY_POLICY.SIMULATE,
        payload: { entityId: unit.id },
      })
    }
  }

  const entityCount =
    (Array.isArray(prevState.runtimeRegistry?.entities) ? prevState.runtimeRegistry.entities.length : 0) ||
    Object.keys(prevState.assignedTags || {}).length

  return {
    handled: true,
    outcome: 'resolved',
    actionLabel: `runtime resolved ${tagId} -> ${unit.id}`,
    patch: {
      runtimeResolvedTag: tagId,
      runtimeResolvedUnit: unitSnapshot,
      runtimeLastLookupResult: result,
      runtimeLookupHistory: pushHistory(prevState, result),
      runtimeUnits: {
        ...(prevState.runtimeUnits || {}),
        [unit.id]: mergedRu,
      },
      runtimeActionSequence: nextActionSeq,
      nfcScanReceiptState: successReceipt,
      nfcLastScanReceiptAt: at,
      nfcLastResolvedEntityId: unit.id,
      nfcLastRuntimeDispatchOk: true,
      nfcScanDedupe: { tagId, at, outcomeKey: `resolved:${unit.id}` },
      packageBrowseNfcEntityCount: entityCount,
      nfcLastScanRoute: scanRouteFromPayload(action) || (packageBrowse ? 'package_browse' : 'roster_context'),
      ...navPatch,
      ...latencyPatch(action),
    },
    recordActions: [
      { type: 'RUNTIME_TAG_LOOKUP', value: tagId },
      { type: 'RUNTIME_LOOKUP_OK', value: `${tagId}->${unit.id}` },
    ],
    effects,
  }
}
