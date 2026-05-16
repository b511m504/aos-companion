/**
 * Centralized operator NFC assignment logic (pure + snapshot-oriented).
 * UI and NFC bridge call into the store; the store delegates here for decisions and patches.
 */

const ASSIGN_LOCK_MS = 450

/** @param {unknown} uid */
export function normalizeUid(uid) {
  const s = String(uid ?? '').trim()
  if (!s) return ''
  return s.replace(/[\s:-]/g, '').toUpperCase()
}

/**
 * Build UID → binding map from nfcAssignments using normalized UIDs as keys.
 * @param {Record<string, { uid?: string, assignedAt?: number }>} nfcAssignments
 * @param {Array<{ entityId: string, display?: { name?: string } }>} entities
 */
export function buildAssignedTagsMirror(nfcAssignments, entities) {
  const next = {}
  const ents = Array.isArray(entities) ? entities : []
  for (const e of ents) {
    const id = e.entityId
    const cert = nfcAssignments?.[id]
    const nu = normalizeUid(cert?.uid)
    if (!nu) continue
    next[nu] = {
      unitId: id,
      entityId: id,
      unitName: e.display?.name ?? id,
      assignedAt: cert.assignedAt || Date.now(),
    }
  }
  return next
}

/**
 * Re-key legacy assignedTags (mixed-case / separators) to normalized keys; merge duplicates conservatively.
 * @param {Record<string, { unitId?: string, entityId?: string, unitName?: string, assignedAt?: number }>} assignedTags
 */
export function normalizeAssignedTagsMap(assignedTags) {
  const raw = assignedTags && typeof assignedTags === 'object' ? assignedTags : {}
  const out = {}
  const warnings = []
  for (const [k, v] of Object.entries(raw)) {
    const nu = normalizeUid(k)
    if (!nu || !v) continue
    const unitId = String(v.unitId ?? v.entityId ?? '').trim()
    if (!unitId) {
      warnings.push(`Dropped tag binding with missing unit for key "${k.slice(0, 24)}"`)
      continue
    }
    if (out[nu] && out[nu].unitId !== unitId) {
      warnings.push(`Merged duplicate normalized UID ${nu.slice(0, 16)}… — kept first binding`)
      continue
    }
    if (!out[nu]) {
      out[nu] = {
        unitId,
        entityId: String(v.entityId ?? v.unitId),
        unitName: String(v.unitName || unitId),
        assignedAt: Number(v.assignedAt) || Date.now(),
      }
    }
  }
  return { assignedTags: out, warnings }
}

/**
 * Normalize all UID fields inside nfcAssignments values.
 * @param {Record<string, { uid?: string, [k: string]: unknown }>} nfcAssignments
 */
export function normalizeNfcAssignmentUids(nfcAssignments) {
  const raw = nfcAssignments && typeof nfcAssignments === 'object' ? { ...nfcAssignments } : {}
  const warnings = []
  for (const [entityId, rec] of Object.entries(raw)) {
    if (!rec || typeof rec !== 'object') {
      delete raw[entityId]
      warnings.push(`Removed malformed assignment row for ${entityId}`)
      continue
    }
    const nu = normalizeUid(rec.uid)
    if (rec.uid && !nu) {
      delete raw[entityId]
      warnings.push(`Removed assignment with empty UID after normalize for ${entityId}`)
      continue
    }
    if (nu) raw[entityId] = { ...rec, uid: nu }
  }
  return { nfcAssignments: raw, warnings }
}

/**
 * @param {string} normalizedUid
 * @param {Record<string, { unitId?: string, entityId?: string, unitName?: string }>} assignedTags — keys normalized
 * @param {Array<{ entityId: string, display?: { name?: string } }>} entities
 */
export function lookupAssignmentByUid(normalizedUid, assignedTags, entities) {
  const uid = normalizeUid(normalizedUid)
  if (!uid) return { kind: 'empty' }
  let binding = assignedTags?.[uid]
  if (!binding && assignedTags && typeof assignedTags === 'object') {
    for (const [k, v] of Object.entries(assignedTags)) {
      if (normalizeUid(k) === uid && v) {
        binding = v
        break
      }
    }
  }
  if (!binding) return { kind: 'unknown', uid }
  const eid = String(binding.entityId ?? binding.unitId ?? '')
  const entity = (entities || []).find((e) => e.entityId === eid)
  const unitName = entity?.display?.name ?? binding.unitName ?? eid
  return {
    kind: 'found',
    uid,
    entityId: eid,
    unitName,
  }
}

/**
 * @param {{
 *   uid: string,
 *   entityId: string,
 *   packageKey: string,
 *   factionKey?: string,
 *   rosterId?: string,
 * }} params
 * @param {{
 *   selectedEntityId: string | null,
 *   entities: Array<{ entityId: string, display?: { name?: string } }>,
 *   nfcAssignments: Record<string, { uid?: string, assignedAt?: number, scanCount?: number, package?: string, writable?: boolean }>,
 *   assignedTags: Record<string, { unitId?: string, entityId?: string, unitName?: string, assignedAt?: number }>,
 *   nfcHistoricalTags: Record<string, unknown>,
 *   recentAssignments: Array<unknown>,
 *   recentMax: number,
 * }} ctx
 */
export function assignTagToEntity(params, ctx) {
  const rawUid = String(params.uid ?? '')
  const uid = normalizeUid(rawUid)
  const entityId = String(params.entityId ?? '').trim()
  const packageKey = String(params.packageKey ?? '')

  if (!uid) {
    return {
      ok: false,
      reason: 'empty_uid',
      patch: {
        lastNfcStubRead: '',
        nfcStatus: 'error',
        nfcScanPhase: 'unsupported_tag',
        lastAssignmentResult: { ok: false, reason: 'empty_uid', tagId: '' },
      },
    }
  }

  if (!entityId) {
    return {
      ok: false,
      reason: 'no_unit_selected',
      patch: {
        lastNfcStubRead: rawUid,
        nfcStatus: 'error',
        nfcScanPhase: 'write_failure',
        lastAssignmentResult: { ok: false, reason: 'no_unit_selected', tagId: uid },
      },
    }
  }

  const entity = ctx.entities.find((e) => e.entityId === entityId)
  if (!entity) {
    return {
      ok: false,
      reason: 'unit_not_in_roster',
      patch: {
        lastNfcStubRead: rawUid,
        nfcStatus: 'error',
        nfcScanPhase: 'write_failure',
        lastAssignmentResult: {
          ok: false,
          reason: 'unit_not_in_roster',
          tagId: uid,
          requestedEntityId: entityId,
          requestedUnitId: entityId,
        },
      },
    }
  }

  const entityName = entity.display?.name ?? entityId
  const existing = ctx.assignedTags[uid]

  if (existing && String(existing.unitId ?? existing.entityId) !== entityId) {
    if (ctx.inlineTagConflict) {
      const exId = String(existing.unitId ?? existing.entityId ?? '')
      const exEnt = ctx.entities.find((e) => e.entityId === exId)
      const existingUnitName = exEnt?.display?.name ?? existing.unitName ?? exId
      return {
        ok: false,
        reason: 'tag_already_assigned',
        patch: {
          lastNfcStubRead: rawUid,
          nfcStatus: 'idle',
          nfcScanPhase: 'waiting',
          activeNfcConflict: null,
          nfcIdentityModal: null,
          lastAssignmentResult: {
            ok: false,
            reason: 'tag_already_assigned',
            tagId: uid,
            message: 'Tag already assigned',
            existingUnitId: exId,
            existingUnitName,
            requestedEntityId: entityId,
            requestedUnitName: entityName,
          },
        },
      }
    }
    return {
      ok: false,
      reason: 'tag_linked_elsewhere',
      applyLegacyConflict: true,
      conflictParams: {
        tagId: uid,
        requestedEntityId: entityId,
        requestedName: entityName,
        existingEntityId: existing.entityId ?? existing.unitId,
        existingName: existing.unitName || existing.unitId || '',
        existingPackageKey: '',
        recognizedFromHistory: false,
        canViewCurrent: true,
      },
    }
  }

  if (existing && String(existing.unitId ?? existing.entityId) === entityId) {
    const prevA = ctx.nfcAssignments[entityId] || {}
    const assignedAt = existing.assignedAt || Date.now()
    const nextNfc = {
      ...ctx.nfcAssignments,
      [entityId]: {
        uid,
        assignedAt,
        writable: true,
        scanCount: (prevA.scanCount || 0) + 1,
        package: packageKey,
      },
    }
    const nextTags = buildAssignedTagsMirror(nextNfc, ctx.entities)
    return {
      ok: true,
      idempotent: true,
      lockMs: ASSIGN_LOCK_MS,
      patch: {
        lastNfcStubRead: rawUid,
        nfcStatus: 'success',
        nfcScanPhase: 'scan_success',
        nfcAssignments: nextNfc,
        assignedTags: nextTags,
        activeNfcConflict: null,
        nfcUiHighlightEntityId: null,
        nfcPulseUnlinkedEntityId: null,
        runtimeGateWarning: '',
        lastAssignmentResult: {
          ok: true,
          idempotent: true,
          tagId: uid,
          entityId,
          unitId: entityId,
          unitName: entityName,
          assignedAt,
        },
      },
      applyHistorical: { uid, entityId, entityName },
    }
  }

  const assignedAt = Date.now()
  const prevCert = ctx.nfcAssignments[entityId]
  const nextNfc = { ...ctx.nfcAssignments }
  const baseMirror = buildAssignedTagsMirror(ctx.nfcAssignments, ctx.entities)
  const nextTags = { ...baseMirror }

  const prevUid = normalizeUid(prevCert?.uid)
  if (prevUid && prevUid !== uid) {
    delete nextTags[prevUid]
  }

  nextTags[uid] = {
    unitId: entityId,
    entityId,
    unitName: entityName,
    assignedAt,
  }
  nextNfc[entityId] = {
    uid,
    assignedAt,
    writable: true,
    scanCount: (prevCert?.scanCount || 0) + 1,
    package: packageKey,
  }

  const nextRecent = [
    ...ctx.recentAssignments,
    {
      uid,
      assignedTo: entityId,
      package: packageKey,
      unitId: entityId,
      unitName: entityName,
      at: assignedAt,
    },
  ].slice(-ctx.recentMax)

  return {
    ok: true,
    idempotent: false,
    lockMs: ASSIGN_LOCK_MS,
    patch: {
      lastNfcStubRead: rawUid,
      assignedTags: nextTags,
      nfcAssignments: nextNfc,
      activeNfcConflict: null,
      nfcUiHighlightEntityId: null,
      nfcPulseUnlinkedEntityId: null,
      recentAssignments: nextRecent,
      nfcStatus: 'success',
      nfcScanPhase: 'scan_success',
      runtimeGateWarning: '',
      lastAssignmentResult: {
        ok: true,
        tagId: uid,
        entityId,
        unitId: entityId,
        unitName: entityName,
        assignedAt,
      },
    },
    applyHistorical: { uid, entityId, entityName },
  }
}

/**
 * @param {string} entityId
 * @param {Record<string, { uid?: string }>} nfcAssignments
 * @param {Array<{ entityId: string, display?: { name?: string } }>} entities
 */
export function removeAssignmentForEntity(entityId, nfcAssignments, entities) {
  const id = String(entityId ?? '').trim()
  if (!id || !nfcAssignments[id]) return { nfcAssignments, assignedTags: buildAssignedTagsMirror(nfcAssignments, entities) }
  const nextNfc = { ...nfcAssignments }
  delete nextNfc[id]
  return {
    nfcAssignments: nextNfc,
    assignedTags: buildAssignedTagsMirror(nextNfc, entities),
  }
}

/**
 * @param {{
 *   nfcAssignments: Record<string, { uid?: string }>,
 *   assignedTags: Record<string, { unitId?: string, entityId?: string }>,
 *   entities: Array<{ entityId: string }>,
 * }} input
 */
export function validateAssignments(input) {
  const warnings = []
  const duplicateUids = []
  const malformed = []
  const nfc = input.nfcAssignments && typeof input.nfcAssignments === 'object' ? input.nfcAssignments : {}
  const tags = input.assignedTags && typeof input.assignedTags === 'object' ? input.assignedTags : {}
  const entityIds = new Set((input.entities || []).map((e) => e.entityId))

  const uidToEntities = new Map()
  for (const [eid, rec] of Object.entries(nfc)) {
    if (!entityIds.has(eid)) {
      warnings.push(`Assignment for unknown entity "${eid}"`)
      continue
    }
    const u = normalizeUid(rec?.uid)
    if (rec?.uid && !u) {
      malformed.push(eid)
      continue
    }
    if (!u) continue
    if (!uidToEntities.has(u)) uidToEntities.set(u, [])
    uidToEntities.get(u).push(eid)
  }

  for (const [u, list] of uidToEntities) {
    if (list.length > 1) duplicateUids.push({ uid: u, entityIds: list })
  }

  for (const [key, bind] of Object.entries(tags)) {
    const nu = normalizeUid(key)
    if (nu !== key) warnings.push('assignedTags contains non-normalized key (will be fixed on save)')
    const tgt = bind?.entityId ?? bind?.unitId
    if (tgt && !entityIds.has(String(tgt))) {
      warnings.push(`assignedTags entry points to missing entity "${tgt}"`)
    }
  }

  return {
    ok: duplicateUids.length === 0 && malformed.length === 0,
    warnings,
    duplicateUids,
    malformed,
  }
}

/**
 * Extended integrity pass for field operations (orphans, package refs, mirror drift).
 * @param {{
 *   nfcAssignments: Record<string, { uid?: string, package?: string }>,
 *   assignedTags: Record<string, { unitId?: string, entityId?: string }>,
 *   entities: Array<{ entityId: string, display?: { name?: string } }>,
 *   packageKey?: string,
 * }} input
 */
export function validateAssignmentsDeep(input) {
  const base = validateAssignments(input)
  const entityIds = new Set((input.entities || []).map((e) => e.entityId))
  const nfc = input.nfcAssignments && typeof input.nfcAssignments === 'object' ? input.nfcAssignments : {}
  const tags = input.assignedTags && typeof input.assignedTags === 'object' ? input.assignedTags : {}
  const expectedPkg = String(input.packageKey || '').trim()

  const orphanNfcKeys = []
  for (const k of Object.keys(nfc)) {
    if (!entityIds.has(k)) orphanNfcKeys.push(k)
  }

  const orphanTagBindings = []
  for (const [uidKey, bind] of Object.entries(tags)) {
    const nu = normalizeUid(uidKey)
    if (!nu) continue
    const tgt = String(bind?.entityId ?? bind?.unitId ?? '')
    if (tgt && !entityIds.has(tgt)) orphanTagBindings.push({ uid: nu, entityId: tgt })
  }

  const invalidPackageRefs = []
  if (expectedPkg) {
    for (const eid of entityIds) {
      const rec = nfc[eid]
      const u = normalizeUid(rec?.uid)
      if (!u) continue
      const p = String(rec?.package || '').trim()
      if (p && p !== expectedPkg) invalidPackageRefs.push({ entityId: eid, package: p })
    }
  }

  const mirror = buildAssignedTagsMirror(nfc, input.entities || [])
  let mirrorDrift = 0
  for (const [uid, bind] of Object.entries(mirror)) {
    const t = tags[uid]
    const tid = t ? String(t.entityId ?? t.unitId ?? '') : ''
    const mid = bind ? String(bind.entityId ?? '') : ''
    if (tid && mid && tid !== mid) mirrorDrift += 1
  }

  let level = 'healthy'
  if (!base.ok || orphanNfcKeys.length || orphanTagBindings.length || mirrorDrift > 0) {
    level = 'conflicts'
  } else if (base.warnings.length || invalidPackageRefs.length) {
    level = 'warnings'
  }

  return {
    ...base,
    level,
    orphanNfcKeys,
    orphanTagBindings,
    invalidPackageRefs,
    mirrorDriftCount: mirrorDrift,
  }
}

/**
 * Move tag UID from its current entity (if any) onto targetEntityId; pure merge result.
 * @param {{
 *   uid: string,
 *   targetEntityId: string,
 *   nfcAssignments: Record<string, { uid?: string, assignedAt?: number, scanCount?: number, package?: string, writable?: boolean }>,
 *   entities: Array<{ entityId: string, display?: { name?: string } }>,
 *   packageKey: string,
 *   recentAssignments: Array<unknown>,
 *   recentMax: number,
 * }} input
 */
export function applyTagReassignmentToTarget(input) {
  const nu = normalizeUid(input.uid)
  const targetEntityId = String(input.targetEntityId ?? '').trim()
  const entities = Array.isArray(input.entities) ? input.entities : []
  const packageKey = String(input.packageKey ?? '')

  if (!nu || !targetEntityId) {
    return { ok: false, reason: 'bad_params' }
  }

  const targetEntity = entities.find((e) => e.entityId === targetEntityId)
  if (!targetEntity) {
    return { ok: false, reason: 'target_missing' }
  }
  const targetName = targetEntity.display?.name ?? targetEntityId

  const nextNfc = { ...(input.nfcAssignments && typeof input.nfcAssignments === 'object' ? input.nfcAssignments : {}) }

  let fromId = null
  for (const e of entities) {
    if (normalizeUid(nextNfc[e.entityId]?.uid) === nu) {
      fromId = e.entityId
      break
    }
  }

  if (fromId && fromId !== targetEntityId) {
    delete nextNfc[fromId]
  }

  const prevTargetCert = nextNfc[targetEntityId]
  const assignedAt = Date.now()
  nextNfc[targetEntityId] = {
    uid: nu,
    assignedAt,
    writable: true,
    scanCount: (prevTargetCert?.scanCount || 0) + 1,
    package: packageKey,
  }

  const assignedTags = buildAssignedTagsMirror(nextNfc, entities)
  const fromName =
    fromId && fromId !== targetEntityId
      ? entities.find((e) => e.entityId === fromId)?.display?.name ?? fromId
      : ''

  const nextRecent = [
    ...(Array.isArray(input.recentAssignments) ? input.recentAssignments : []),
    { tagId: nu, unitId: targetEntityId, unitName: targetName, at: assignedAt },
  ].slice(-Math.max(1, Number(input.recentMax) || 10))

  return {
    ok: true,
    applyHistorical: { uid: nu, entityId: targetEntityId, entityName: targetName },
    patch: {
      nfcAssignments: nextNfc,
      assignedTags,
      recentAssignments: nextRecent,
      nfcStatus: 'success',
      nfcScanPhase: 'scan_success',
      runtimeGateWarning: '',
      nfcIdentityModal: null,
      activeNfcConflict: null,
      nfcUiHighlightEntityId: null,
      nfcPulseUnlinkedEntityId: null,
      lastAssignmentResult: {
        ok: true,
        tagId: nu,
        entityId: targetEntityId,
        unitId: targetEntityId,
        unitName: targetName,
        reassigned: true,
        transferFromEntityId: fromId || undefined,
        transferFromName: fromName || undefined,
        assignedAt,
      },
    },
  }
}

export function buildOperatorOverviewModel({ entities, nfcAssignments, assignedTags, rosterName, packageKey }) {
  const ent = Array.isArray(entities) ? entities : []
  const integrity = validateAssignments({ nfcAssignments, assignedTags, entities: ent })
  const integrityDeep = validateAssignmentsDeep({
    nfcAssignments,
    assignedTags,
    entities: ent,
    packageKey: packageKey || '',
  })
  let assigned = 0
  const rows = ent.map((e) => {
    const u = normalizeUid(nfcAssignments?.[e.entityId]?.uid)
    const has = Boolean(u)
    if (has) assigned += 1
    return { entityId: e.entityId, name: e.display?.name ?? e.entityId, assigned: has }
  })
  return {
    rows,
    rosterName: rosterName || 'Roster',
    assigned,
    unassigned: Math.max(0, ent.length - assigned),
    integrity,
    integrityDeep,
    healthLevel: integrityDeep.level,
  }
}

/**
 * Sanitize persisted NFC bundle for hydration; preserves recoverable data.
 * @param {{
 *   nfcAssignments?: Record<string, unknown>,
 *   assignedTags?: Record<string, unknown>,
 * }} bundle
 * @param {Array<{ entityId: string, display?: { name?: string } }>} entities
 */
export function sanitizePersistedNfcBundle(bundle, entities) {
  const warnings = []
  let nfcAssignments = { ...(bundle?.nfcAssignments || {}) }
  let assignedTags = { ...(bundle?.assignedTags || {}) }

  const n1 = normalizeNfcAssignmentUids(nfcAssignments)
  nfcAssignments = n1.nfcAssignments
  warnings.push(...n1.warnings)

  const n2 = normalizeAssignedTagsMap(assignedTags)
  assignedTags = n2.assignedTags
  warnings.push(...n2.warnings)

  const mirror = buildAssignedTagsMirror(nfcAssignments, entities)
  for (const [k, v] of Object.entries(mirror)) {
    assignedTags[k] = v
  }

  const v = validateAssignments({ nfcAssignments, assignedTags, entities })
  warnings.push(...v.warnings)

  const summary =
    v.duplicateUids.length || v.malformed.length || warnings.length
      ? [
          v.duplicateUids.length ? `${v.duplicateUids.length} duplicate UID binding(s)` : '',
          v.malformed.length ? `${v.malformed.length} malformed UID(s)` : '',
        ]
          .filter(Boolean)
          .join(' · ') || 'Assignment data was adjusted on load'
      : ''

  return {
    nfcAssignments,
    assignedTags,
    validation: v,
    hydrationWarning: summary || (warnings.length ? warnings[0] : ''),
  }
}

export function assignmentCommitLockExpiry(lockMs = ASSIGN_LOCK_MS) {
  return Date.now() + lockMs
}

export { ASSIGN_LOCK_MS }
