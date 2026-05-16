/**
 * Generates workspace packages (per-game dirs) with rules JSON and sample lists.
 * Run: node scripts/gen-nfc-packages.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..", "packages")

function write(p, obj) {
  const dir = path.dirname(p)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8")
}

function listFile(pkg, systemId, factionId, lists) {
  return {
    schemaVersion: 1,
    package: {
      packageType: "lists",
      schemaVersion: 1,
      contentVersion: "1.0.0",
      systemId,
      factionId
    },
    lists
  }
}

function unit(id, name, tags = []) {
  return { id, name, tags }
}

const packages = {
  warhammer40k: {
    manifest: {
      packageId: "warhammer40k",
      name: "Warhammer 40,000",
      version: 1,
      supportsNFC: true,
      systemId: "wh40k",
      contentVersion: "1.0.0",
      entityTypes: ["unit", "character", "vehicle", "transport", "objective"]
    },
    rules: [
      {
        id: "wh40k_unit_damaged_modstack",
        trigger: "unit.damaged",
        priority: 30,
        appliesToSystems: ["wh40k"],
        conditions: [{ type: "entity_exists", entityId: "wh40k-intercessor-01" }],
        actions: [
          { type: "increment_state", target: "triggering_entity", key: "resource", delta: 1 },
          { type: "emit_event", event: "aura.applied", payload: { entityId: "wh40k-captain-01" } }
        ]
      },
      {
        id: "wh40k_aura_nested",
        trigger: "aura.applied",
        priority: 25,
        appliesToSystems: ["wh40k"],
        conditions: [],
        actions: [
          { type: "apply_status", target: "triggering_entity", status: "reroll_ones" },
          { type: "emit_event", event: "objective.scored", payload: { entityId: "wh40k-obj-01" } }
        ]
      },
      {
        id: "wh40k_objective_chain",
        trigger: "objective.scored",
        priority: 20,
        appliesToSystems: ["wh40k"],
        conditions: [],
        actions: [
          { type: "increment_state", target: "wh40k-obj-01", key: "resource", delta: 1 },
          { type: "emit_event", event: "timer.fire", payload: { entityId: "wh40k-obj-01" } }
        ]
      },
      {
        id: "wh40k_timer_morale",
        trigger: "timer.fire",
        priority: 15,
        appliesToSystems: ["wh40k"],
        conditions: [],
        actions: [{ type: "emit_event", event: "morale.tested", payload: { entityId: "wh40k-intercessor-01" } }]
      },
      {
        id: "wh40k_morale_battleshock",
        trigger: "morale.tested",
        priority: 12,
        appliesToSystems: ["wh40k"],
        conditions: [],
        actions: [{ type: "apply_status", target: "triggering_entity", status: "battle_shocked" }]
      },
      {
        id: "wh40k_transport_embark",
        trigger: "transport.embark",
        priority: 18,
        appliesToSystems: ["wh40k"],
        conditions: [],
        actions: [
          { type: "set_state", target: "wh40k-rhino-01", key: "activated", value: true },
          { type: "emit_event", event: "transport.disembark", payload: { entityId: "wh40k-rhino-01" } }
        ]
      },
      {
        id: "wh40k_transport_disembark",
        trigger: "transport.disembark",
        priority: 17,
        appliesToSystems: ["wh40k"],
        conditions: [],
        actions: [{ type: "toggle_state", target: "wh40k-rhino-01", key: "activated" }]
      },
      {
        id: "wh40k_unit_destroyed_cleanup",
        trigger: "unit.destroyed",
        priority: 40,
        appliesToSystems: ["wh40k"],
        conditions: [],
        actions: [
          { type: "remove_status", target: "triggering_entity", status: "battle_shocked" },
          {
            type: "upsert_entity",
            entity: {
              id: "wh40k-spawn-token",
              name: "Spawned Servo",
              tags: ["summoned", "ally"],
              states: { health: 1, owner: "player1" }
            }
          },
          { type: "emit_event", event: "summon.unit", payload: { entityId: "wh40k-spawn-token" } }
        ]
      },
      {
        id: "wh40k_summon_echo",
        trigger: "summon.unit",
        priority: 5,
        appliesToSystems: ["wh40k"],
        conditions: [{ type: "entity_exists", entityId: "wh40k-spawn-token" }],
        actions: [{ type: "apply_status", target: "wh40k-spawn-token", status: "deep_strike" }]
      },
      {
        id: "wh40k_sim_tick_decay",
        trigger: "simulation.tick",
        priority: 1,
        appliesToSystems: ["wh40k"],
        conditions: [],
        actions: [{ type: "increment_state", target: "wh40k-obj-01", key: "cooldown", delta: -1 }]
      }
    ],
    lists: listFile("warhammer40k", "wh40k", "*", [
      {
        id: "wh40k-strike-stress",
        name: "Strike Force Stress",
        factionId: "space_marines",
        description: "Intercessors, captain, Rhino, objective — modifier stacks and nested emits.",
        units: [
          unit("wh40k-intercessor-01", "Intercessor Squad", ["unit", "infantry", "ally"]),
          unit("wh40k-captain-01", "Captain", ["character", "aura", "ally"]),
          unit("wh40k-rhino-01", "Rhino", ["vehicle", "transport", "ally"]),
          unit("wh40k-obj-01", "Primary Objective", ["objective"])
        ]
      }
    ])
  },
  age_of_sigmar: {
    manifest: {
      packageId: "age_of_sigmar",
      name: "Age of Sigmar",
      version: 1,
      supportsNFC: true,
      systemId: "aos",
      contentVersion: "1.0.0",
      entityTypes: ["hero", "unit", "endless_spell", "summon", "objective"]
    },
    rules: [
      {
        id: "aos_hero_phase_tick",
        trigger: "phase.advance",
        priority: 20,
        appliesToSystems: ["aos"],
        conditions: [{ type: "entity_has_tag", entityId: "aos-caster-01", tag: "wizard" }],
        actions: [{ type: "emit_event", event: "spell.cast", payload: { entityId: "aos-caster-01" } }]
      },
      {
        id: "aos_spell_cast_chain",
        trigger: "spell.cast",
        priority: 18,
        appliesToSystems: ["aos"],
        conditions: [],
        actions: [
          { type: "increment_state", target: "aos-caster-01", key: "resource", delta: -1 },
          { type: "emit_event", event: "ward.save", payload: { entityId: "aos-knight-01" } }
        ]
      },
      {
        id: "aos_spell_denied",
        trigger: "spell.denied",
        priority: 16,
        appliesToSystems: ["aos"],
        conditions: [],
        actions: [{ type: "apply_status", target: "triggering_entity", status: "denied_cast" }]
      },
      {
        id: "aos_ward_save",
        trigger: "ward.save",
        priority: 14,
        appliesToSystems: ["aos"],
        conditions: [],
        actions: [{ type: "emit_event", event: "summon.unit", payload: { entityId: "aos-endless-01" } }]
      },
      {
        id: "aos_summon_unit",
        trigger: "summon.unit",
        priority: 30,
        appliesToSystems: ["aos"],
        conditions: [],
        actions: [
          {
            type: "upsert_entity",
            entity: {
              id: "aos-summoned-skink",
              name: "Summoned Skink",
              tags: ["summon", "ally"],
              states: { health: 2, owner: "player1" }
            }
          },
          { type: "emit_event", event: "tactic.completed", payload: { entityId: "aos-hero-01" } }
        ]
      },
      {
        id: "aos_tactic_completed",
        trigger: "tactic.completed",
        priority: 10,
        appliesToSystems: ["aos"],
        conditions: [],
        actions: [{ type: "remove_status", target: "aos-hero-01", status: "tactic_slotted" }]
      },
      {
        id: "aos_command_issued",
        trigger: "command.issued",
        priority: 12,
        appliesToSystems: ["aos"],
        conditions: [],
        actions: [{ type: "apply_status", target: "aos-line-01", status: "all_out_attack" }]
      },
      {
        id: "aos_sim_tick",
        trigger: "simulation.tick",
        priority: 1,
        appliesToSystems: ["aos"],
        conditions: [],
        actions: [{ type: "increment_state", target: "aos-endless-01", key: "cooldown", delta: 1 }]
      }
    ],
    lists: listFile("age_of_sigmar", "aos", "*", [
      {
        id: "aos-host-stress",
        name: "Celestial Host Stress",
        factionId: "stormcast",
        description: "Hero, battleline, endless spell proxy — phases and summons.",
        units: [
          unit("aos-hero-01", "Knight-Incantor", ["hero", "wizard"]),
          unit("aos-caster-01", "Arcane Tome Bearer", ["wizard", "ally"]),
          unit("aos-line-01", "Vindicators", ["unit", "ally"]),
          unit("aos-knight-01", "Dracoline Knight", ["unit", "cavalry"]),
          unit("aos-endless-01", "Endless Spell: Comet", ["endless_spell"])
        ]
      }
    ])
  },
  kill_team: {
    manifest: {
      packageId: "kill_team",
      name: "Kill Team",
      version: 1,
      supportsNFC: true,
      systemId: "killteam",
      contentVersion: "1.0.0",
      entityTypes: ["operative", "equipment", "token"]
    },
    rules: [
      {
        id: "kt_operative_activated",
        trigger: "operative.activated",
        priority: 25,
        appliesToSystems: ["killteam"],
        conditions: [],
        actions: [
          { type: "toggle_state", target: "triggering_entity", key: "activated" },
          { type: "emit_event", event: "action.spent", payload: { entityId: "kt-veteran-01" } }
        ]
      },
      {
        id: "kt_action_spent_ap",
        trigger: "action.spent",
        priority: 20,
        appliesToSystems: ["killteam"],
        conditions: [],
        actions: [
          { type: "increment_state", target: "kt-veteran-01", key: "resource", delta: -1 },
          { type: "emit_event", event: "conceal.changed", payload: { entityId: "kt-veteran-01" } }
        ]
      },
      {
        id: "kt_conceal_changed",
        trigger: "conceal.changed",
        priority: 15,
        appliesToSystems: ["killteam"],
        conditions: [],
        actions: [{ type: "emit_event", event: "overwatch.fired", payload: { entityId: "kt-gunner-01" } }]
      },
      {
        id: "kt_overwatch",
        trigger: "overwatch.fired",
        priority: 18,
        appliesToSystems: ["killteam"],
        conditions: [],
        actions: [
          { type: "increment_state", target: "kt-enemy-01", key: "health", delta: -1 },
          { type: "emit_event", event: "unit.damaged", payload: { entityId: "kt-enemy-01" } }
        ]
      },
      {
        id: "kt_turn_end_churn",
        trigger: "turn.end",
        priority: 3,
        appliesToSystems: ["killteam"],
        conditions: [],
        actions: [
          { type: "emit_event", event: "operative.activated", payload: { entityId: "kt-gunner-01" } },
          { type: "emit_event", event: "operative.activated", payload: { entityId: "kt-veteran-01" } }
        ]
      },
      {
        id: "kt_sim_burst",
        trigger: "simulation.tick",
        priority: 1,
        appliesToSystems: ["killteam"],
        conditions: [],
        actions: [{ type: "increment_state", target: "kt-veteran-01", key: "cooldown", delta: 1 }]
      }
    ],
    lists: listFile("kill_team", "killteam", "*", [
      {
        id: "kt-veteran-stress",
        name: "Veteran Guard Stress",
        factionId: "veteran_guardsmen",
        description: "Alternating activations, overwatch, AP — rapid queue churn.",
        units: [
          unit("kt-veteran-01", "Trooper Veteran", ["operative", "ally"]),
          unit("kt-gunner-01", "Gunner", ["operative", "ally"]),
          unit("kt-enemy-01", "Brood Warrior", ["operative", "enemy"])
        ]
      }
    ])
  },
  crypt_assault: {
    manifest: {
      packageId: "crypt_assault",
      name: "Crypt Assault",
      version: 1,
      supportsNFC: true,
      systemId: "crypt_assault",
      contentVersion: "1.0.0",
      entityTypes: ["hero", "monster", "loot", "room", "trap", "chest"]
    },
    rules: [
      {
        id: "crypt_enter_room",
        trigger: "room.entered",
        priority: 20,
        appliesToSystems: ["crypt_assault"],
        conditions: [],
        actions: [
          { type: "set_state", target: "crypt-hero-01", key: "position", value: "room_2" },
          { type: "emit_event", event: "enemy.revealed", payload: { entityId: "crypt-skeleton-01" } }
        ]
      },
      {
        id: "crypt_enemy_revealed",
        trigger: "enemy.revealed",
        priority: 18,
        appliesToSystems: ["crypt_assault"],
        conditions: [],
        actions: [
          { type: "emit_event", event: "trap.triggered", payload: { entityId: "crypt-trap-01" } },
          { type: "emit_event", event: "monster.spawned", payload: { entityId: "crypt-skeleton-01" } }
        ]
      },
      {
        id: "crypt_trap_triggered",
        trigger: "trap.triggered",
        priority: 16,
        appliesToSystems: ["crypt_assault"],
        conditions: [],
        actions: [
          { type: "apply_status", target: "crypt-hero-01", status: "poisoned" },
          { type: "emit_event", event: "status.applied", payload: { entityId: "crypt-hero-01" } }
        ]
      },
      {
        id: "crypt_monster_spawned",
        trigger: "monster.spawned",
        priority: 14,
        appliesToSystems: ["crypt_assault"],
        conditions: [],
        actions: [{ type: "emit_event", event: "loot.found", payload: { entityId: "crypt-chest-01" } }]
      },
      {
        id: "crypt_loot_found",
        trigger: "loot.found",
        priority: 12,
        appliesToSystems: ["crypt_assault"],
        conditions: [],
        actions: [
          {
            type: "set_state",
            target: "crypt-hero-01",
            key: "inventory",
            value: ["rust_key", "healing_kit"]
          },
          { type: "emit_event", event: "chest.opened", payload: { entityId: "crypt-chest-01" } }
        ]
      },
      {
        id: "crypt_chest_opened",
        trigger: "chest.opened",
        priority: 10,
        appliesToSystems: ["crypt_assault"],
        conditions: [],
        actions: [{ type: "increment_state", target: "crypt-hero-01", key: "resource", delta: 5 }]
      },
      {
        id: "crypt_ai_tick",
        trigger: "ai.tick",
        priority: 8,
        appliesToSystems: ["crypt_assault"],
        conditions: [{ type: "entity_exists", entityId: "crypt-skeleton-01" }],
        actions: [
          { type: "increment_state", target: "crypt-hero-01", key: "health", delta: -1 },
          { type: "emit_event", event: "unit.damaged", payload: { entityId: "crypt-hero-01" } }
        ]
      },
      {
        id: "crypt_nfc_scan_door",
        trigger: "nfc.scan",
        priority: 5,
        appliesToSystems: ["crypt_assault"],
        conditions: [{ type: "entity_has_tag", tag: "door" }],
        actions: [{ type: "emit_event", event: "room.entered", payload: { entityId: "crypt-door-01" } }]
      },
      {
        id: "crypt_sim_persist",
        trigger: "simulation.tick",
        priority: 1,
        appliesToSystems: ["crypt_assault"],
        conditions: [],
        actions: [{ type: "increment_state", target: "crypt-hero-01", key: "cooldown", delta: -1 }]
      }
    ],
    lists: listFile("crypt_assault", "crypt_assault", "*", [
      {
        id: "crypt-run-stress",
        name: "Shattered Vault Run",
        factionId: "crypt_default",
        description: "Room graph, traps, AI poke — chained environmental events.",
        units: [
          unit("crypt-hero-01", "Gravebreaker", ["hero", "ally"]),
          unit("crypt-door-01", "Sealed Door", ["door", "room"]),
          unit("crypt-trap-01", "Glyph Trap", ["trap"]),
          unit("crypt-skeleton-01", "Rattlebone", ["monster", "enemy"]),
          unit("crypt-chest-01", "Iron Chest", ["chest", "loot"])
        ]
      }
    ])
  },
  legends_rpg: {
    manifest: {
      packageId: "legends_rpg",
      name: "Legends RPG",
      version: 1,
      supportsNFC: true,
      systemId: "legends_rpg",
      contentVersion: "1.0.0",
      entityTypes: ["pc", "npc", "quest", "faction", "item"]
    },
    rules: [
      {
        id: "rpg_quest_started",
        trigger: "quest.started",
        priority: 20,
        appliesToSystems: ["legends_rpg"],
        conditions: [],
        actions: [
          { type: "set_state", target: "rpg-pc-01", key: "objective", value: "find_relic" },
          { type: "apply_status", target: "rpg-pc-01", status: "quest_active" }
        ]
      },
      {
        id: "rpg_dialogue_choice",
        trigger: "dialogue.choice",
        priority: 18,
        appliesToSystems: ["legends_rpg"],
        conditions: [],
        actions: [{ type: "emit_event", event: "reputation.changed", payload: { entityId: "rpg-faction-01" } }]
      },
      {
        id: "rpg_reputation_changed",
        trigger: "reputation.changed",
        priority: 16,
        appliesToSystems: ["legends_rpg"],
        conditions: [],
        actions: [{ type: "increment_state", target: "rpg-faction-01", key: "resource", delta: 1 }]
      },
      {
        id: "rpg_xp_gained",
        trigger: "xp.gained",
        priority: 14,
        appliesToSystems: ["legends_rpg"],
        conditions: [],
        actions: [
          { type: "increment_state", target: "rpg-pc-01", key: "resource", delta: 2 },
          { type: "emit_event", event: "level.gained", payload: { entityId: "rpg-pc-01" } }
        ]
      },
      {
        id: "rpg_level_gained",
        trigger: "level.gained",
        priority: 12,
        appliesToSystems: ["legends_rpg"],
        conditions: [],
        actions: [{ type: "increment_state", target: "rpg-pc-01", key: "health", delta: 1 }]
      },
      {
        id: "rpg_item_equipped",
        trigger: "item.equipped",
        priority: 10,
        appliesToSystems: ["legends_rpg"],
        conditions: [],
        actions: [{ type: "apply_status", target: "rpg-pc-01", status: "iron_skin" }]
      },
      {
        id: "rpg_quest_completed",
        trigger: "quest.completed",
        priority: 22,
        appliesToSystems: ["legends_rpg"],
        conditions: [{ type: "status_present", target: "rpg-pc-01", status: "quest_active" }],
        actions: [
          { type: "remove_status", target: "rpg-pc-01", status: "quest_active" },
          { type: "emit_event", event: "xp.gained", payload: { entityId: "rpg-pc-01" } }
        ]
      },
      {
        id: "rpg_sim_campaign",
        trigger: "simulation.tick",
        priority: 1,
        appliesToSystems: ["legends_rpg"],
        conditions: [],
        actions: [{ type: "increment_state", target: "rpg-pc-01", key: "cooldown", delta: -1 }]
      }
    ],
    lists: listFile("legends_rpg", "legends_rpg", "*", [
      {
        id: "rpg-party-stress",
        name: "Ashfen Campaign Party",
        factionId: "rpg_default",
        description: "Quest graph, XP, equipment, factions — long-horizon persistence shape.",
        units: [
          unit("rpg-pc-01", "Kessa", ["pc", "ally"]),
          unit("rpg-npc-01", "Magistrate Vorn", ["npc"]),
          unit("rpg-quest-01", "Relic of Ashfen", ["quest"]),
          unit("rpg-faction-01", "Ashfen Concord", ["faction"])
        ]
      }
    ])
  }
}

for (const [dir, spec] of Object.entries(packages)) {
  const base = path.join(root, dir)
  write(path.join(base, "manifest.json"), {
    ...spec.manifest,
    capabilities: {
      spawnEntities: true,
      timers: true,
      persistentEffects: true,
      maxChainDepthOverride: 24
    },
    importAdapters: {
      jsonRoster: "imports/jsonRosterAdapter.json"
    }
  })
  const jsonRosterAdapter = {
    schemaVersion: 1,
    packageId: spec.manifest.packageId,
    kind: "jsonRoster",
    rootPath: "lists.0",
    listIdField: "id",
    listNameField: "name",
    factionIdField: "factionId",
    unitsPath: "units",
    unitIdField: "id",
    unitNameField: "name",
    unitTagsField: "tags",
    defaultEntityType: "unit"
  }
  write(path.join(base, "imports", "jsonRosterAdapter.json"), jsonRosterAdapter)
  write(path.join(base, "entities", "templates.json"), {
    schemaVersion: 1,
    packageId: spec.manifest.packageId,
    templates: spec.lists.lists[0].units
  })
  for (let i = 0; i < spec.rules.length; i++) {
    const rule = spec.rules[i]
    const fn = `${String(i + 1).padStart(2, "0")}_${rule.id}.json`
    write(path.join(base, "rules", fn), rule)
  }
  write(path.join(base, "actions", "library.json"), {
    schemaVersion: 1,
    description: "Reusable action snippets (copy into rules as needed).",
    snippets: {
      bumpObjective: [{ type: "increment_state", target: "wh40k-obj-01", key: "resource", delta: 1 }],
      applyPoison: [{ type: "apply_status", target: "crypt-hero-01", status: "poisoned" }]
    }
  })
  write(path.join(base, "conditions", "library.json"), {
    schemaVersion: 1,
    description: "Reusable condition snippets.",
    snippets: {
      heroExists: [{ type: "entity_exists", entityId: "crypt-hero-01" }]
    }
  })
  write(path.join(base, "sample_lists", `${dir}_default.json`), spec.lists)
  write(path.join(base, "assets", "README.txt"), "Placeholder assets — replace with art/audio for production.\n")
  const now = new Date().toISOString()
  write(path.join(base, "bindings", "nfc_sample_export.json"), {
    schemaVersion: 1,
    exportedAt: now,
    gameSystemId: spec.manifest.systemId,
    factionId: spec.lists.lists[0].factionId,
    listId: spec.lists.lists[0].id,
    assignments: spec.lists.lists[0].units.slice(0, 3).map((u, idx) => ({
      tagUid: `04${dir}${idx}FAKE${idx}TAG`.slice(0, 16),
      entityId: u.id,
      displayName: u.name,
      entityType: "entity",
      assignedAt: now,
      factionId: spec.lists.lists[0].factionId,
      gameSystemId: spec.manifest.systemId
    }))
  })
}

const pubPackagesRoot = path.join(__dirname, "..", "nfc-companion", "public", "packages")
for (const dir of Object.keys(packages)) {
  const src = path.join(root, dir)
  const dest = path.join(pubPackagesRoot, dir)
  fs.mkdirSync(dest, { recursive: true })
  fs.cpSync(src, dest, { recursive: true })
}

const companionContent = path.join(__dirname, "..", "nfc-companion", "public", "content")

function emitCompanionSystem(id, name, desc, factionsFile, listsFileName, listsPayload) {
  write(path.join(companionContent, "systems", `${id}.json`), {
    schemaVersion: 1,
    id,
    name,
    version: "1.0",
    description: desc,
    factionsPath: `factions/${factionsFile}.json`
  })
  write(path.join(companionContent, "factions", `${factionsFile}.json`), {
    schemaVersion: 1,
    package: {
      packageType: "faction-index",
      schemaVersion: 1,
      contentVersion: "1.0.0",
      systemId: id,
      factionId: "*"
    },
    factions: [
      {
        schemaVersion: 1,
        id: listsPayload.lists[0].factionId,
        systemId: id,
        name: `${name} (stress)`,
        listsPath: `lists/${listsFileName}.json`
      }
    ]
  })
  write(path.join(companionContent, "lists", `${listsFileName}.json`), listsPayload)
}

emitCompanionSystem(
  "crypt_assault",
  "Crypt Assault",
  "Event-driven dungeon crawl stand-in — rooms, traps, AI ticks.",
  "crypt_assault",
  "crypt_assault_stress",
  packages.crypt_assault.lists
)
emitCompanionSystem(
  "legends_rpg",
  "Legends RPG",
  "Campaign persistence stand-in — quests, XP, factions.",
  "legends_rpg",
  "legends_rpg_stress",
  packages.legends_rpg.lists
)
emitCompanionSystem(
  "age_of_sigmar",
  "Age of Sigmar (package)",
  "Parallel AoS catalog entry wired to generated stress list.",
  "age_of_sigmar",
  "age_of_sigmar_stress",
  packages.age_of_sigmar.lists
)

for (const sys of ["crypt_assault", "legends_rpg", "age_of_sigmar"]) {
  write(path.join(companionContent, "translations", `${sys}.json`), {
    systemId: sys,
    schemaVersion: 1,
    translations: {
      "unit.damaged": "Wound allocated",
      "simulation.tick": "Simulation tick"
    }
  })
}

const catalogPath = path.join(companionContent, "catalog.json")
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"))
const extra = [
  { path: "systems/crypt_assault.json" },
  { path: "systems/legends_rpg.json" },
  { path: "systems/age_of_sigmar.json" }
]
const have = new Set(catalog.systemRefs.map((r) => r.path))
for (const r of extra) {
  if (!have.has(r.path)) catalog.systemRefs.push(r)
}
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), "utf8")

console.log("Generated packages under", root)
console.log("Emitted companion content systems and updated catalog.json")
