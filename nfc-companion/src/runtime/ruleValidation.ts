import type { Action, Condition, EventRule } from "@/models/runtimeTypes"
import { RUNTIME_EVENT_NAMES } from "@/runtime/runtimeConstants"

const RESERVED_TARGETS = new Set(["selected_entity", "triggering_entity"])

const ACTION_TYPES = new Set([
  "set_state",
  "increment_state",
  "toggle_state",
  "apply_status",
  "remove_status",
  "show_message",
  "emit_event",
  "open_entity_panel",
  "upsert_entity",
  "remove_entity"
])

const CONDITION_TYPES = new Set([
  "entity_exists",
  "entity_has_tag",
  "state_equals",
  "state_greater_than",
  "status_present",
  "owner_matches",
  "random_below"
])

const NUM_STATE_KEYS = new Set(["health", "resource", "cooldown"])

export function validateTargetField(target: string, label: string): string[] {
  const w: string[] = []
  if (!target || typeof target !== "string") {
    w.push(`${label}: target must be a non-empty string`)
    return w
  }
  if (RESERVED_TARGETS.has(target)) return w
  if (!/^[a-zA-Z0-9_-]+$/.test(target)) {
    w.push(`${label}: target "${target}" should be a reserved token or alphanumeric id`)
  }
  return w
}

export function validateCondition(c: Condition, file: string, index: number): string[] {
  const w: string[] = []
  const prefix = `${file} condition[${index}]`
  if (!c || typeof (c as { type?: unknown }).type !== "string") {
    w.push(`${prefix}: invalid condition object`)
    return w
  }
  if (!CONDITION_TYPES.has((c as { type: string }).type)) {
    w.push(`${prefix}: unknown type ${(c as { type: string }).type}`)
    return w
  }
  switch (c.type) {
    case "entity_exists":
      if (c.entityId !== undefined && typeof c.entityId !== "string") w.push(`${prefix}: entityId must be string when set`)
      break
    case "entity_has_tag":
      if (!c.tag || typeof c.tag !== "string") w.push(`${prefix}: entity_has_tag requires tag`)
      if (c.entityId !== undefined && typeof c.entityId !== "string")
        w.push(`${prefix}: entityId must be string when set`)
      break
    case "state_equals":
    case "state_greater_than":
      if (typeof c.target !== "string") w.push(`${prefix}: ${c.type} requires target`)
      if (typeof c.key !== "string") w.push(`${prefix}: ${c.type} requires key`)
      if (c.type === "state_greater_than" && typeof c.value !== "number") w.push(`${prefix}: state_greater_than requires numeric value`)
      break
    case "status_present":
    case "owner_matches":
      if (typeof c.target !== "string") w.push(`${prefix}: ${c.type} requires target`)
      break
    case "random_below":
      if (typeof c.threshold !== "number" || !Number.isFinite(c.threshold) || c.threshold < 0 || c.threshold > 1) {
        w.push(`${prefix}: random_below requires threshold in [0,1]`)
      }
      break
    default:
      break
  }
  return w
}

export function validateAction(a: Action, file: string, index: number): string[] {
  const w: string[] = []
  const prefix = `${file} action[${index}]`
  if (!a || typeof a.type !== "string") {
    w.push(`${prefix}: invalid action`)
    return w
  }
  if (!ACTION_TYPES.has(a.type)) {
    w.push(`${prefix}: unknown action type ${a.type}`)
    return w
  }
  switch (a.type) {
    case "show_message":
      if (typeof a.text !== "string" || !a.text.trim()) w.push(`${prefix}: show_message requires text`)
      break
    case "emit_event":
      if (typeof a.event !== "string" || !a.event.trim()) w.push(`${prefix}: emit_event requires event`)
      else if (!RUNTIME_EVENT_NAMES.has(a.event)) w.push(`${prefix}: emit_event unknown event name ${a.event}`)
      if (a.payload !== undefined && (typeof a.payload !== "object" || a.payload === null || Array.isArray(a.payload))) {
        w.push(`${prefix}: emit_event payload must be object when set`)
      }
      break
    case "set_state":
      w.push(...validateTargetField(a.target, `${prefix} set_state`))
      if (typeof a.key !== "string") w.push(`${prefix}: set_state requires key`)
      break
    case "increment_state":
      w.push(...validateTargetField(a.target, `${prefix} increment_state`))
      if (typeof a.key !== "string") w.push(`${prefix}: increment_state requires key`)
      if (typeof a.delta !== "number" || !Number.isFinite(a.delta)) w.push(`${prefix}: increment_state requires finite delta`)
      if (!NUM_STATE_KEYS.has(a.key as string)) w.push(`${prefix}: increment_state key must be health|resource|cooldown`)
      break
    case "toggle_state":
      w.push(...validateTargetField(a.target, `${prefix} toggle_state`))
      if (a.key !== "activated") w.push(`${prefix}: toggle_state only supports activated`)
      break
    case "apply_status": {
      if (!a.target && !a.targetGroup) w.push(`${prefix}: apply_status needs target or targetGroup`)
      if (a.target) w.push(...validateTargetField(a.target, `${prefix} apply_status`))
      if (a.targetGroup && typeof a.targetGroup !== "string") w.push(`${prefix}: targetGroup must be string`)
      if (typeof a.status !== "string" || !a.status.trim()) w.push(`${prefix}: apply_status requires status`)
      break
    }
    case "remove_status":
      w.push(...validateTargetField(a.target, `${prefix} remove_status`))
      if (typeof a.status !== "string" || !a.status.trim()) w.push(`${prefix}: remove_status requires status`)
      break
    case "open_entity_panel":
      break
    case "upsert_entity": {
      const ent = (a as { entity?: unknown }).entity
      if (!ent || typeof ent !== "object" || ent === null || Array.isArray(ent)) {
        w.push(`${prefix}: upsert_entity requires entity object`)
        break
      }
      const er = ent as Record<string, unknown>
      if (typeof er.id !== "string" || !er.id.trim()) w.push(`${prefix}: upsert_entity.entity.id required`)
      if (typeof er.name !== "string" || !er.name.trim()) w.push(`${prefix}: upsert_entity.entity.name required`)
      if (er.tags !== undefined && !Array.isArray(er.tags)) w.push(`${prefix}: upsert_entity.entity.tags must be array when set`)
      if (er.states !== undefined && (typeof er.states !== "object" || er.states === null || Array.isArray(er.states))) {
        w.push(`${prefix}: upsert_entity.entity.states must be object when set`)
      }
      break
    }
    case "remove_entity":
      w.push(...validateTargetField(a.target, `${prefix} remove_entity`))
      break
  }
  return w
}

export function validateRuleDiagnostics(rule: EventRule, file: string): string[] {
  const w: string[] = []
  if (rule.priority !== undefined && (typeof rule.priority !== "number" || !Number.isFinite(rule.priority))) {
    w.push(`${file} rule ${rule.id}: priority must be a finite number`)
  }
  rule.conditions.forEach((c, i) => w.push(...validateCondition(c, file, i)))
  rule.actions.forEach((a, i) => w.push(...validateAction(a, file, i)))
  return w
}
