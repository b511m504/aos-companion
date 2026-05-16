import type { Assignment } from "@/models/types"
import { normalizeUid } from "@/utils/uid"
import { validateAssignmentShape } from "@/services/assignmentValidation"

export type RegistrySnapshot = {
  byEntityId: ReadonlyMap<string, Assignment>
  byTagUid: ReadonlyMap<string, Assignment>
}

export type IntegrityIssueKind =
  | "duplicate_uid"
  | "duplicate_entity"
  | "malformed"
  | "orphan_entity"
  | "internal_inconsistency"

export type IntegrityIssue = {
  kind: IntegrityIssueKind
  detail: string
  refs?: string[]
}

export type IntegrityReport = {
  ok: boolean
  issues: IntegrityIssue[]
}

export type IntegrityOptions = {
  /** When provided, assignments whose entityId is not in this set are flagged as orphan_entity. */
  allowedEntityIds?: ReadonlySet<string>
}

export class AssignmentRegistry {
  private byEntityId = new Map<string, Assignment>()
  private byTagUid = new Map<string, Assignment>()

  /**
   * Detects contradictory rows before they are merged (same UID → different entities, etc.).
   */
  static validateRawAssignmentList(assignments: readonly Assignment[]): IntegrityReport {
    const issues: IntegrityIssue[] = []
    const uidOwner = new Map<string, string>()
    const entityOwner = new Map<string, string>()

    for (const a of assignments) {
      const uid = normalizeUid(a.tagUid)
      const eid = a.entityId.trim()
      const shape = validateAssignmentShape({ ...a, tagUid: uid, entityId: eid })
      if (shape) {
        issues.push({ kind: "malformed", detail: shape, refs: [eid || "(empty)", uid] })
        continue
      }
      const prevE = uidOwner.get(uid)
      if (prevE && prevE !== eid) {
        issues.push({
          kind: "duplicate_uid",
          detail: `UID ${uid} targets both ${prevE} and ${eid}`,
          refs: [uid, prevE, eid]
        })
      } else {
        uidOwner.set(uid, eid)
      }
      const prevU = entityOwner.get(eid)
      if (prevU && prevU !== uid) {
        issues.push({
          kind: "duplicate_entity",
          detail: `Entity ${eid} has multiple tag UIDs in import batch`,
          refs: [eid, prevU, uid]
        })
      } else {
        entityOwner.set(eid, uid)
      }
    }

    return { ok: issues.length === 0, issues }
  }

  static fromAssignments(assignments: readonly Assignment[]): AssignmentRegistry {
    const r = new AssignmentRegistry()
    for (const a of assignments) {
      r.ingestValidated(a)
    }
    return r
  }

  validateRegistryIntegrity(options?: IntegrityOptions): IntegrityReport {
    const issues: IntegrityIssue[] = []
    const all = this.getAll()
    const uidCount = new Map<string, number>()
    const entitySeen = new Set<string>()

    for (const a of all) {
      const uid = normalizeUid(a.tagUid)
      const eid = a.entityId.trim()
      const shape = validateAssignmentShape({ ...a, tagUid: uid })
      if (shape) {
        issues.push({ kind: "malformed", detail: shape, refs: [eid || "(empty)", uid] })
      }
      if (options?.allowedEntityIds && eid && !options.allowedEntityIds.has(eid)) {
        issues.push({
          kind: "orphan_entity",
          detail: `Assignment references unknown entity ${eid}`,
          refs: [eid]
        })
      }
      uidCount.set(uid, (uidCount.get(uid) ?? 0) + 1)
      if (entitySeen.has(eid)) {
        issues.push({
          kind: "duplicate_entity",
          detail: `More than one assignment for entity ${eid}`,
          refs: [eid]
        })
      }
      if (eid) entitySeen.add(eid)
    }

    for (const [uid, c] of uidCount) {
      if (c > 1) {
        issues.push({
          kind: "duplicate_uid",
          detail: `Tag UID mapped ${c} times`,
          refs: [uid]
        })
      }
    }

    for (const a of all) {
      const uid = normalizeUid(a.tagUid)
      const byTag = this.byTagUid.get(uid)
      const byEnt = this.byEntityId.get(a.entityId)
      if (byTag !== byEnt || !byTag) {
        issues.push({
          kind: "internal_inconsistency",
          detail: `Maps diverge for entity ${a.entityId} / uid ${uid}`,
          refs: [a.entityId, uid]
        })
      }
    }

    return { ok: issues.length === 0, issues }
  }

  snapshot(): RegistrySnapshot {
    return {
      byEntityId: new Map(this.byEntityId),
      byTagUid: new Map(this.byTagUid)
    }
  }

  getAll(): Assignment[] {
    return [...this.byEntityId.values()]
  }

  findByEntity(entityId: string): Assignment | undefined {
    return this.byEntityId.get(entityId)
  }

  findByUid(rawUid: string): Assignment | undefined {
    const uid = normalizeUid(rawUid)
    return this.byTagUid.get(uid)
  }

  upsert(assignment: Assignment): { ok: true } | { ok: false; error: string } {
    const err = validateAssignmentShape(assignment)
    if (err) return { ok: false, error: err }
    const uid = normalizeUid(assignment.tagUid)
    const eid = assignment.entityId.trim()
    if (!eid) return { ok: false, error: "Missing entity id" }
    const next: Assignment = { ...assignment, tagUid: uid, entityId: eid }

    const prevForEntity = this.byEntityId.get(next.entityId)
    if (prevForEntity && normalizeUid(prevForEntity.tagUid) !== uid) {
      this.byTagUid.delete(normalizeUid(prevForEntity.tagUid))
    }

    const prevOwnerOfUid = this.byTagUid.get(uid)
    if (prevOwnerOfUid && prevOwnerOfUid.entityId !== next.entityId) {
      this.byEntityId.delete(prevOwnerOfUid.entityId)
    }

    this.byEntityId.set(next.entityId, next)
    this.byTagUid.set(uid, next)
    return { ok: true }
  }

  removeByEntity(entityId: string): void {
    const prev = this.byEntityId.get(entityId)
    if (!prev) return
    this.byEntityId.delete(entityId)
    this.byTagUid.delete(normalizeUid(prev.tagUid))
  }

  exportBundle(listId: string): { listId: string; assignments: Assignment[] } {
    return { listId, assignments: this.getAll() }
  }

  importBundle(assignments: readonly Assignment[]): { ok: true } | { ok: false; report: IntegrityReport } {
    const raw = AssignmentRegistry.validateRawAssignmentList(assignments)
    if (!raw.ok) return { ok: false, report: raw }

    this.byEntityId.clear()
    this.byTagUid.clear()
    for (const a of assignments) {
      const r = this.ingestValidated(a)
      if (!r.ok) {
        this.byEntityId.clear()
        this.byTagUid.clear()
        return { ok: false, report: r.report }
      }
    }
    const rep = this.validateRegistryIntegrity()
    if (!rep.ok) {
      this.byEntityId.clear()
      this.byTagUid.clear()
      return { ok: false, report: rep }
    }
    return { ok: true }
  }

  private ingestValidated(a: Assignment): { ok: true } | { ok: false; report: IntegrityReport } {
    const err = validateAssignmentShape(a)
    if (err) {
      return {
        ok: false,
        report: { ok: false, issues: [{ kind: "malformed", detail: err, refs: [a.entityId] }] }
      }
    }
    const uid = normalizeUid(a.tagUid)
    const fixed: Assignment = { ...a, tagUid: uid, entityId: a.entityId.trim() }
    const existingUidOwner = this.byTagUid.get(uid)
    if (existingUidOwner && existingUidOwner.entityId !== fixed.entityId) {
      this.byEntityId.delete(existingUidOwner.entityId)
    }
    const existingEntity = this.byEntityId.get(fixed.entityId)
    if (existingEntity) {
      this.byTagUid.delete(normalizeUid(existingEntity.tagUid))
    }
    this.byEntityId.set(fixed.entityId, fixed)
    this.byTagUid.set(uid, fixed)
    return { ok: true }
  }
}
