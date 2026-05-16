import type { CanonicalEntityStates, RuntimeEntityRecord } from "@/models/runtimeTypes"
import { defaultCanonicalStates } from "@/models/runtimeTypes"

type Listener = () => void

/**
 * Holds canonical entity records only — no translation, no NFC UIDs.
 * Reads return detached copies so callers cannot mutate internal state.
 */
export class StateStore {
  private entities = new Map<string, RuntimeEntityRecord>()
  private listeners = new Set<Listener>()

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit() {
    for (const l of this.listeners) l()
  }

  private cloneRecord(e: RuntimeEntityRecord): RuntimeEntityRecord {
    return {
      id: e.id,
      type: "entity",
      name: e.name,
      tags: [...e.tags],
      states: {
        ...e.states,
        statuses: [...e.states.statuses],
        inventory: [...e.states.inventory]
      }
    }
  }

  getEntity(id: string): RuntimeEntityRecord | undefined {
    const e = this.entities.get(id)
    return e ? this.cloneRecord(e) : undefined
  }

  getAll(): RuntimeEntityRecord[] {
    return [...this.entities.values()].map((e) => this.cloneRecord(e))
  }

  snapshot(): Map<string, RuntimeEntityRecord> {
    const m = new Map<string, RuntimeEntityRecord>()
    for (const [id, e] of this.entities) m.set(id, this.cloneRecord(e))
    return m
  }

  resetFromRecords(records: RuntimeEntityRecord[]) {
    this.entities.clear()
    for (const r of records) {
      this.entities.set(r.id, {
        id: r.id,
        type: "entity",
        name: r.name,
        tags: [...r.tags],
        states: {
          ...r.states,
          statuses: [...r.states.statuses],
          inventory: [...r.states.inventory]
        }
      })
    }
    this.emit()
  }

  /**
   * Insert or replace a canonical entity (generic spawn from JSON rules).
   * Does not validate game semantics — callers supply coherent ids/tags.
   */
  upsertEntity(record: RuntimeEntityRecord): { ok: true } | { ok: false; error: string } {
    if (!record.id?.trim()) return { ok: false, error: "upsertEntity: id required" }
    const base = defaultCanonicalStates()
    const mergedStates: CanonicalEntityStates = {
      ...base,
      ...record.states,
      statuses: [...(record.states?.statuses ?? base.statuses)],
      inventory: [...(record.states?.inventory ?? base.inventory)]
    }
    this.entities.set(record.id, {
      id: record.id,
      type: "entity",
      name: record.name || record.id,
      tags: [...(record.tags ?? [])],
      states: mergedStates
    })
    this.emit()
    return { ok: true }
  }

  removeEntity(entityId: string): { ok: true; removed: boolean } | { ok: false; error: string } {
    if (!entityId?.trim()) return { ok: false, error: "removeEntity: id required" }
    const had = this.entities.has(entityId)
    this.entities.delete(entityId)
    if (had) this.emit()
    return { ok: true, removed: had }
  }

  setStateField(
    entityId: string,
    key: keyof CanonicalEntityStates,
    value: unknown
  ): { ok: true } | { ok: false; error: string } {
    const e = this.entities.get(entityId)
    if (!e) return { ok: false, error: `Unknown entity ${entityId}` }
    if (key === "statuses" && Array.isArray(value)) {
      e.states.statuses = value.map(String)
    } else if (key === "inventory" && Array.isArray(value)) {
      e.states.inventory = value.map(String)
    } else if (key === "objective" && (value === null || typeof value === "string")) {
      e.states.objective = value
    } else if (key === "position" && typeof value === "string") {
      e.states.position = value
    } else if (key === "owner" && typeof value === "string") {
      e.states.owner = value
    } else if (key === "activated" && typeof value === "boolean") {
      e.states.activated = value
    } else if ((key === "health" || key === "resource" || key === "cooldown") && typeof value === "number" && Number.isFinite(value)) {
      if (key === "health") e.states.health = value
      else if (key === "resource") e.states.resource = value
      else e.states.cooldown = value
    } else {
      return { ok: false, error: `Invalid value for ${String(key)}` }
    }
    this.emit()
    return { ok: true }
  }

  incrementField(entityId: string, key: "health" | "resource" | "cooldown", delta: number): { ok: true } | { ok: false; error: string } {
    const e = this.entities.get(entityId)
    if (!e) return { ok: false, error: `Unknown entity ${entityId}` }
    const cur = e.states[key]
    e.states[key] = cur + delta
    this.emit()
    return { ok: true }
  }

  toggleActivated(entityId: string): { ok: true } | { ok: false; error: string } {
    const e = this.entities.get(entityId)
    if (!e) return { ok: false, error: `Unknown entity ${entityId}` }
    e.states.activated = !e.states.activated
    this.emit()
    return { ok: true }
  }

  applyStatus(entityId: string, status: string): { ok: true; added: boolean } | { ok: false; error: string } {
    const e = this.entities.get(entityId)
    if (!e) return { ok: false, error: `Unknown entity ${entityId}` }
    if (e.states.statuses.includes(status)) return { ok: true, added: false }
    e.states.statuses = [...e.states.statuses, status]
    this.emit()
    return { ok: true, added: true }
  }

  removeStatus(entityId: string, status: string): { ok: true; removed: boolean } | { ok: false; error: string } {
    const e = this.entities.get(entityId)
    if (!e) return { ok: false, error: `Unknown entity ${entityId}` }
    const had = e.states.statuses.includes(status)
    e.states.statuses = e.states.statuses.filter((s) => s !== status)
    this.emit()
    return { ok: true, removed: had }
  }
}
