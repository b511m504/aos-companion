/** Central tuning for runtime safety (no gameplay semantics). */
export const RUNTIME_LIMITS = {
  /** Max chain depth (follow-up generations from one root dispatch). */
  MAX_CHAIN_DEPTH: 25,
  /** Max dequeue steps per outer dispatch to bound runaway queues. */
  MAX_QUEUE_STEPS: 20_000,
  /** Dedupe window (ms): identical type+payload re-enqueued within window is dropped. */
  EVENT_DEDUPE_MS: 100,
  /** Max debug log entries retained. */
  MAX_DEBUG_ENTRIES: 400
} as const

/** All runtime event names the engine accepts (triggers + emit_event targets). */
export const RUNTIME_EVENT_NAMES_ARR = [
  "nfc.scan",
  "turn.start",
  "turn.end",
  "entity.selected",
  "entity.updated",
  "status.applied",
  "status.removed",
  "objective.completed",
  "objective.scored",
  "room.entered",
  "trap.awakened",
  "trap.triggered",
  "runtime.stress_loop_a",
  "runtime.stress_loop_b",
  "runtime.stress_loop_c",
  /* Mass battle (40k-style) */
  "unit.damaged",
  "unit.destroyed",
  "aura.applied",
  "transport.embark",
  "transport.disembark",
  "morale.tested",
  /* Fantasy battle (AoS-style) */
  "spell.cast",
  "spell.denied",
  "summon.unit",
  "ward.save",
  "tactic.completed",
  "command.issued",
  /* Skirmish (Kill Team-style) */
  "operative.activated",
  "overwatch.fired",
  "conceal.changed",
  "action.spent",
  /* Dungeon */
  "enemy.revealed",
  "loot.found",
  "monster.spawned",
  "chest.opened",
  /* RPG campaign */
  "quest.started",
  "quest.completed",
  "xp.gained",
  "level.gained",
  "item.equipped",
  "dialogue.choice",
  "reputation.changed",
  /* Simulation / timers */
  "timer.fire",
  "phase.advance",
  "ai.tick",
  "simulation.tick",
  "rng.table",
  /* Skeleton lab — lifecycle + generic entity vocabulary (underscore names) */
  "start_game",
  "end_game",
  "start_round",
  "end_round",
  "start_turn",
  "end_turn",
  "timer_tick",
  "entity_damaged",
  "entity_healed",
  "entity_spawned",
  "entity_removed",
  "objective_scored",
  "status_applied",
  "status_removed"
] as const

export type RuntimeEventName = (typeof RUNTIME_EVENT_NAMES_ARR)[number]

export const RUNTIME_EVENT_NAMES = new Set<string>([...RUNTIME_EVENT_NAMES_ARR])
