import type { Action, RuntimeEvent, CanonicalEntityStates, RuntimeEntityRecord } from "@/models/runtimeTypes"
import { defaultCanonicalStates } from "@/models/runtimeTypes"
import type { StateStore } from "@/runtime/StateStore"
import type { EvaluationContext } from "@/runtime/ConditionEvaluator"
import { resolveTargetGroup, resolveTargetToken } from "@/runtime/targetResolution"

export type StateMutationDebug = {
  entityId: string
  key: string
  before: unknown
  after: unknown
  ruleId: string
  sourceAction: string
  timestampMs: number
}

export type ActionResult = {
  messages: string[]
  warnings: string[]
  followUpEvents: RuntimeEvent[]
  openEntityPanel: boolean
  /** For debug log */
  actionNotes: string[]
  stateMutations: StateMutationDebug[]
}

const NUM_KEYS = new Set(["health", "resource", "cooldown"])

function cloneStatuses(store: StateStore, entityId: string): string[] {
  return [...(store.getEntity(entityId)?.states.statuses ?? [])]
}

export function executeAction(ctx: EvaluationContext, action: Action, ruleId: string, clockMs: number): ActionResult {
  const out: ActionResult = {
    messages: [],
    warnings: [],
    followUpEvents: [],
    openEntityPanel: false,
    actionNotes: [],
    stateMutations: []
  }

  const note = (s: string) => {
    out.actionNotes.push(`[${ruleId}] ${s}`)
  }

  const pushStatusMutation = (entityId: string, before: string[], after: string[]) => {
    out.stateMutations.push({
      entityId,
      key: "statuses",
      before,
      after,
      ruleId,
      sourceAction: action.type,
      timestampMs: clockMs
    })
  }

  const pushScalarMutation = (entityId: string, key: string, before: unknown, after: unknown) => {
    out.stateMutations.push({ entityId, key, before, after, ruleId, sourceAction: action.type, timestampMs: clockMs })
  }

  switch (action.type) {
    case "show_message":
      out.messages.push(action.text)
      note(`show_message: ${action.text}`)
      break
    case "open_entity_panel":
      out.openEntityPanel = true
      note("open_entity_panel")
      break
    case "emit_event": {
      const ev: RuntimeEvent = {
        type: action.event,
        payload: action.payload ?? {}
      }
      out.followUpEvents.push(ev)
      note(`emit_event → ${action.event} ${JSON.stringify(ev.payload)}`)
      break
    }
    case "set_state": {
      const tid = resolveTargetToken(action.target, ctx.chain, ctx.primaryEntityId)
      if (!tid) {
        out.warnings.push(`set_state: unresolved target ${action.target}`)
        note(`set_state skipped (unresolved target)`)
        break
      }
      const beforeEnt = ctx.stateStore.getEntity(tid)
      const beforeVal = beforeEnt ? (beforeEnt.states as Record<string, unknown>)[action.key as string] : undefined
      const res = ctx.stateStore.setStateField(tid, action.key as keyof CanonicalEntityStates, action.value)
      if (!res.ok) out.warnings.push(res.error)
      else {
        const afterEnt = ctx.stateStore.getEntity(tid)
        const afterVal = afterEnt ? (afterEnt.states as Record<string, unknown>)[action.key as string] : undefined
        pushScalarMutation(tid, String(action.key), beforeVal, afterVal)
        note(`set_state ${tid}.${String(action.key)}`)
      }
      break
    }
    case "increment_state": {
      const tid = resolveTargetToken(action.target, ctx.chain, ctx.primaryEntityId)
      if (!tid) {
        out.warnings.push(`increment_state: unresolved target ${action.target}`)
        break
      }
      const k = action.key
      if (!NUM_KEYS.has(k as string)) {
        out.warnings.push(`increment_state only supports health/resource/cooldown, got ${String(k)}`)
        break
      }
      const key = k as "health" | "resource" | "cooldown"
      const entBefore = ctx.stateStore.getEntity(tid)
      if (!entBefore) {
        out.warnings.push(`increment_state: unknown entity ${tid}`)
        break
      }
      const before = entBefore.states[key]
      const res = ctx.stateStore.incrementField(tid, key, action.delta)
      if (!res.ok) out.warnings.push(res.error)
      else {
        const after = ctx.stateStore.getEntity(tid)?.states[key]
        pushScalarMutation(tid, key, before, after)
        note(`increment_state ${tid}.${String(key)} += ${action.delta}`)
      }
      break
    }
    case "toggle_state": {
      const tid = resolveTargetToken(action.target, ctx.chain, ctx.primaryEntityId)
      if (!tid) {
        out.warnings.push(`toggle_state: unresolved target ${action.target}`)
        break
      }
      const before = ctx.stateStore.getEntity(tid)?.states.activated
      const res = ctx.stateStore.toggleActivated(tid)
      if (!res.ok) out.warnings.push(res.error)
      else {
        const after = ctx.stateStore.getEntity(tid)?.states.activated
        pushScalarMutation(tid, "activated", before, after)
        note(`toggle_state activated on ${tid}`)
      }
      break
    }
    case "apply_status": {
      if (!action.target && !action.targetGroup) {
        out.warnings.push("apply_status requires target or targetGroup")
        note("apply_status skipped")
        break
      }
      if (action.targetGroup) {
        const ids = resolveTargetGroup(action.targetGroup, ctx.chain, ctx.stateStore)
        if (!ids.length) {
          out.warnings.push(`apply_status: targetGroup ${action.targetGroup} resolved to no entities`)
          note(`apply_status group ${action.targetGroup} → (empty)`)
          break
        }
        for (const id of ids) {
          const before = cloneStatuses(ctx.stateStore, id)
          const res = ctx.stateStore.applyStatus(id, action.status)
          if (!res.ok) out.warnings.push(res.error)
          else {
            const after = cloneStatuses(ctx.stateStore, id)
            pushStatusMutation(id, before, after)
            note(`apply_status ${action.status} → ${id} (group ${action.targetGroup})`)
          }
        }
        break
      }
      const tid = resolveTargetToken(action.target!, ctx.chain, ctx.primaryEntityId)
      if (!tid) {
        out.warnings.push(`apply_status: unresolved target ${action.target}`)
        break
      }
      const before = cloneStatuses(ctx.stateStore, tid)
      const res = ctx.stateStore.applyStatus(tid, action.status)
      if (!res.ok) out.warnings.push(res.error)
      else {
        const after = cloneStatuses(ctx.stateStore, tid)
        pushStatusMutation(tid, before, after)
        note(`apply_status ${action.status} → ${tid}`)
      }
      break
    }
    case "remove_status": {
      const tid = resolveTargetToken(action.target, ctx.chain, ctx.primaryEntityId)
      if (!tid) {
        out.warnings.push(`remove_status: unresolved target ${action.target}`)
        break
      }
      const before = cloneStatuses(ctx.stateStore, tid)
      const res = ctx.stateStore.removeStatus(tid, action.status)
      if (!res.ok) out.warnings.push(res.error)
      else {
        const after = cloneStatuses(ctx.stateStore, tid)
        pushStatusMutation(tid, before, after)
        note(`remove_status ${action.status} → ${tid}`)
      }
      break
    }
    case "upsert_entity": {
      const e = action.entity
      if (!e?.id?.trim() || !e.name?.trim()) {
        out.warnings.push("upsert_entity: entity.id and entity.name required")
        note("upsert_entity skipped")
        break
      }
      const record: RuntimeEntityRecord = {
        id: e.id.trim(),
        type: "entity",
        name: e.name.trim(),
        tags: e.tags?.length ? [...e.tags] : [],
        states: defaultCanonicalStates(e.states ?? {})
      }
      const res = ctx.stateStore.upsertEntity(record)
      if (!res.ok) out.warnings.push(res.error)
      else {
        note(`upsert_entity ${record.id}`)
        out.stateMutations.push({
          entityId: record.id,
          key: "(entity)",
          before: null,
          after: record.id,
          ruleId,
          sourceAction: action.type,
          timestampMs: clockMs
        })
      }
      break
    }
    case "remove_entity": {
      const tid = resolveTargetToken(action.target, ctx.chain, ctx.primaryEntityId)
      if (!tid) {
        out.warnings.push(`remove_entity: unresolved target ${action.target}`)
        break
      }
      const had = ctx.stateStore.getEntity(tid)
      const res = ctx.stateStore.removeEntity(tid)
      if (!res.ok) out.warnings.push(res.error)
      else {
        note(`remove_entity ${tid} removed=${res.removed}`)
        out.stateMutations.push({
          entityId: tid,
          key: "(entity)",
          before: had?.id ?? null,
          after: res.removed ? null : tid,
          ruleId,
          sourceAction: action.type,
          timestampMs: clockMs
        })
      }
      break
    }
  }

  return out
}

export function executeActions(ctx: EvaluationContext, actions: Action[], ruleId: string, clockMs: number): ActionResult {
  const merged: ActionResult = {
    messages: [],
    warnings: [],
    followUpEvents: [],
    openEntityPanel: false,
    actionNotes: [],
    stateMutations: []
  }
  for (const a of actions) {
    const r = executeAction(ctx, a, ruleId, clockMs)
    merged.messages.push(...r.messages)
    merged.warnings.push(...r.warnings)
    merged.followUpEvents.push(...r.followUpEvents)
    merged.openEntityPanel = merged.openEntityPanel || r.openEntityPanel
    merged.actionNotes.push(...r.actionNotes)
    merged.stateMutations.push(...r.stateMutations)
  }
  return merged
}
