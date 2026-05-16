/**
 * Canonical runtime vocabulary — never store system-specific terms here.
 * Translation JSON maps these keys to presentation labels per game.
 */

import type { RuntimeEventName } from "@/runtime/runtimeConstants"

export type { RuntimeEventName } from "@/runtime/runtimeConstants"

export const CANONICAL_STATE_KEYS = [
  "health",
  "resource",
  "activated",
  "statuses",
  "owner",
  "cooldown",
  "position",
  "inventory",
  "objective"
] as const

export type CanonicalStateKey = (typeof CANONICAL_STATE_KEYS)[number]

/** Canonical entity runtime state (numeric/boolean primitives + string lists). */
export type CanonicalEntityStates = {
  health: number
  resource: number
  activated: boolean
  statuses: string[]
  owner: string
  cooldown: number
  position: string
  inventory: string[]
  objective: string | null
}

export function defaultCanonicalStates(overrides?: Partial<CanonicalEntityStates>): CanonicalEntityStates {
  return {
    health: 0,
    resource: 0,
    activated: false,
    statuses: [],
    owner: "player1",
    cooldown: 0,
    position: "",
    inventory: [],
    objective: null,
    ...overrides
  }
}

export type RuntimeEntityRecord = {
  id: string
  type: "entity"
  name: string
  /** Logical tags for conditions (e.g. objective, door, trap) — not NFC UIDs. */
  tags: string[]
  states: CanonicalEntityStates
}

export type RuntimeEvent = {
  type: RuntimeEventName
  payload: Record<string, unknown>
}

/** Snapshot passed to conditions/actions — canonical ids only, no per-system branches. */
export type RuntimeExecutionContext = {
  timestamp: string
  /** Same as chain.rootPrimaryEntityId — entity that started the interaction (scan/selection). */
  triggeringEntityId: string | null
  triggeringPlayerId: string
  /** Root dispatch event (depth 0). */
  sourceEvent: RuntimeEvent
  /** Payload of the event currently being evaluated. */
  payload: Record<string, unknown>
}

export type Condition =
  | { type: "entity_exists"; entityId?: string }
  | { type: "entity_has_tag"; tag: string; entityId?: string }
  | { type: "state_equals"; target: string; key: keyof CanonicalEntityStates | string; value: unknown }
  | { type: "state_greater_than"; target: string; key: keyof CanonicalEntityStates | string; value: number }
  | { type: "status_present"; target: string; status: string }
  | { type: "owner_matches"; target: string; owner: string }
  /** Deterministic only when EvaluationContext.rng is set (SeededRandom). */
  | { type: "random_below"; threshold: number }

export type Action =
  | { type: "set_state"; target: string; key: keyof CanonicalEntityStates | string; value: unknown }
  | { type: "increment_state"; target: string; key: keyof CanonicalEntityStates | string; delta: number }
  | { type: "toggle_state"; target: string; key: "activated" }
  | { type: "apply_status"; target?: string; targetGroup?: string; status: string }
  | { type: "remove_status"; target: string; status: string }
  | { type: "show_message"; text: string }
  | { type: "emit_event"; event: RuntimeEventName; payload?: Record<string, unknown> }
  | { type: "open_entity_panel" }
  | {
      type: "upsert_entity"
      entity: {
        id: string
        name: string
        tags?: string[]
        states?: Partial<CanonicalEntityStates>
      }
    }
  | { type: "remove_entity"; target: string }

export type EventRule = {
  id: string
  trigger: RuntimeEventName
  /** Higher runs first (default 0). */
  priority?: number
  /** When set, rule only runs for these system ids (content id, e.g. aos). */
  appliesToSystems?: string[] | null
  conditions: Condition[]
  actions: Action[]
}

export type TranslationTable = {
  systemId: string
  schemaVersion: 1
  translations: Partial<Record<string, string>>
}

export type RuntimeStressMetrics = {
  eventsProcessed: number
  actionsExecuted: number
  mutationsApplied: number
  warningsGenerated: number
  dedupeSkips: number
  queueDepthSum: number
  queueDepthSamples: number
  maxQueueDepthObserved: number
  maxChainDepthReached: number
  ruleCandidatesEvaluated: number
  rulesPassedAllConditions: number
  conditionEvaluations: number
  followUpsEnqueued: number
  dispatchWallMsSum: number
  dispatchWallSamples: number
}

export type RuntimeDebugEntry =
  | {
      kind: "event_in"
      at: string
      event: RuntimeEvent
    }
  | {
      kind: "execution"
      at: string
      depth: number
      rootEventType: string
      rootPrimaryEntityId: string | null
      effectSubjectId: string | null
      triggeringPlayerId: string
      currentEventType: string
      currentPayload: Record<string, unknown>
    }
  | {
      kind: "rule"
      at: string
      ruleId: string
      conditionDetails: string[]
    }
  | {
      kind: "rule_skip"
      at: string
      ruleId: string
      conditionDetails: string[]
    }
  | {
      kind: "action"
      at: string
      ruleId: string
      action: Action
      detail: string
    }
  | {
      kind: "state_mutation"
      at: string
      entityId: string
      key: string
      before: unknown
      after: unknown
      ruleId: string
      sourceAction: string
      timestampMs: number
    }
  | {
      kind: "dedupe_skip"
      at: string
      event: RuntimeEvent
      detail: string
    }
  | {
      kind: "load_warning"
      at: string
      text: string
    }
  | {
      kind: "depth_blocked"
      at: string
      event: RuntimeEvent
      chainDepth: number
      detail: string
    }
  | {
      kind: "warning"
      at: string
      text: string
    }
  | {
      kind: "follow_up"
      at: string
      event: RuntimeEvent
      /** Depth of the dispatch that emitted this follow-up (parent). */
      fromDepth: number
    }
  | {
      kind: "queue_enqueue"
      at: string
      eventType: string
      chainDepth: number
      queueLengthAfter: number
    }
  | {
      kind: "queue_dequeue"
      at: string
      eventType: string
      chainDepth: number
      queueLengthAfter: number
      waitMs?: number
    }
  | {
      kind: "dispatch_complete"
      at: string
      eventType: string
      chainDepth: number
      durationMs: number
      rulesMatched: number
    }
