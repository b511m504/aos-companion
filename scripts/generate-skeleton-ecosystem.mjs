/**
 * Generates packages-skeleton/* and syncs into nfc-companion/public/packages/*.
 * Merges rule paths into public/packages/package_registry.json (no duplicates).
 * Adds skeleton_lab game system + factions for catalog navigation.
 *
 * Run from repo root: node scripts/generate-skeleton-ecosystem.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
const skeletonRoot = path.join(root, "packages-skeleton")
const publicPackages = path.join(root, "nfc-companion", "public", "packages")
const registryPath = path.join(publicPackages, "package_registry.json")
const catalogPath = path.join(root, "nfc-companion", "public", "content", "catalog.json")
const systemsDir = path.join(root, "nfc-companion", "public", "content", "systems")
const factionsDir = path.join(root, "nfc-companion", "public", "content", "factions")

const LAB_SYSTEM_ID = "skeleton_lab"

const PACKAGES = [
  {
    id: "warhammer40k_skeleton",
    short: "w40ks",
    name: "Skeleton: Warhammer 40k",
    n: 40,
    types: ["unit", "objective", "character", "transport"],
    theme: { trigger: "morale.tested", id: "theme_morale", actions: [{ type: "emit_event", event: "timer.fire", payload: {} }] }
  },
  {
    id: "age_of_sigmar_skeleton",
    short: "aoss",
    name: "Skeleton: Age of Sigmar",
    n: 36,
    types: ["unit", "spell", "ward", "summon"],
    theme: { trigger: "spell.cast", id: "theme_spell", actions: [{ type: "emit_event", event: "summon.unit", payload: {} }] }
  },
  {
    id: "kill_team_skeleton",
    short: "kts",
    name: "Skeleton: Kill Team",
    n: 32,
    types: ["operative", "conceal", "grenade"],
    theme: { trigger: "operative.activated", id: "theme_kt", actions: [{ type: "emit_event", event: "action.spent", payload: {} }] }
  },
  {
    id: "crypt_assault_skeleton",
    short: "cryp",
    name: "Skeleton: Crypt Assault",
    n: 34,
    types: ["room", "monster", "loot", "door", "trap"],
    theme: { trigger: "room.entered", id: "theme_crypt", actions: [{ type: "emit_event", event: "trap.triggered", payload: {} }] }
  },
  {
    id: "legends_rpg_skeleton",
    short: "rpgs",
    name: "Skeleton: Legends RPG",
    n: 38,
    types: ["pc", "npc", "quest", "item", "faction"],
    theme: { trigger: "quest.started", id: "theme_rpg", actions: [{ type: "emit_event", event: "xp.gained", payload: {} }] }
  },
  {
    id: "boardgame_skeleton",
    short: "brd",
    name: "Skeleton: Boardgame",
    n: 28,
    types: ["player", "token", "score"],
    theme: { trigger: "phase.advance", id: "theme_board", actions: [{ type: "emit_event", event: "objective.scored", payload: {} }] }
  },
  {
    id: "cardgame_skeleton",
    short: "crd",
    name: "Skeleton: Cardgame",
    n: 30,
    types: ["deck", "hand", "discard"],
    theme: { trigger: "rng.table", id: "theme_card", actions: [{ type: "emit_event", event: "action.spent", payload: {} }] }
  },
  {
    id: "dungeon_skeleton",
    short: "dng",
    name: "Skeleton: Dungeon",
    n: 35,
    types: ["room", "hazard", "encounter", "chest"],
    theme: { trigger: "enemy.revealed", id: "theme_dungeon", actions: [{ type: "emit_event", event: "monster.spawned", payload: {} }] }
  },
  {
    id: "strategy_skeleton",
    short: "stg",
    name: "Skeleton: Strategy",
    n: 32,
    types: ["territory", "resource", "unit"],
    theme: { trigger: "ai.tick", id: "theme_strategy", actions: [{ type: "emit_event", event: "simulation.tick", payload: {} }] }
  }
]

function write(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8")
}

function listFile(pkgId, n, short, types) {
  const itemId = `sk_${short}_item_hub`
  const units = []
  for (let i = 0; i < n; i++) {
    const id = `sk_${short}_${String(i).padStart(2, "0")}`
    const et = types[i % types.length]
    const rels = []
    if (i > 0 && i % 4 === 0) {
      rels.push({ id: `rel_${short}_party_${i}`, kind: "party_member", toInstanceId: `sk_${short}_${String(i - 1).padStart(2, "0")}` })
    }
    if (i % 6 === 0) {
      rels.push({ id: `rel_${short}_inv_${i}`, kind: "inventory_item", toInstanceId: itemId })
    }
    if (i > 1 && i % 7 === 0) {
      rels.push({
        id: `rel_${short}_tr_${i}`,
        kind: "transport_passenger",
        toInstanceId: `sk_${short}_${String(i - 2).padStart(2, "0")}`
      })
    }
    units.push({
      id,
      name: `${et} ${i}`,
      tags: ["skeleton", et],
      entityType: et,
      packageId: pkgId,
      templateId: `basic_template`,
      runtime: {
        health: 3 + (i % 5),
        resource: i % 4,
        activated: i % 11 === 0,
        statuses: i % 13 === 0 ? ["stub"] : [],
        owner: i % 2 === 0 ? "player1" : "player2",
        cooldown: 0,
        position: "",
        inventory: [],
        objective: null
      },
      canonicalRelationships: rels
    })
  }
  units.push({
    id: itemId,
    name: "Hub item",
    tags: ["skeleton", "loot"],
    entityType: "generic",
    packageId: pkgId,
    templateId: "basic_template",
    runtime: { health: 1, resource: 0, activated: false, statuses: [], owner: "player1", cooldown: 0, position: "", inventory: [], objective: null },
    canonicalRelationships: []
  })

  const listId = `${short}-default`
  return {
    schemaVersion: 1,
    package: {
      packageType: "lists",
      schemaVersion: 1,
      contentVersion: "1.0.0-skeleton",
      systemId: LAB_SYSTEM_ID,
      factionId: "*"
    },
    lists: [
      {
        id: listId,
        name: `${pkgId} default roster`,
        factionId: `${short}_faction`,
        description: "Lightweight skeleton content for runtime / UI coverage.",
        units
      }
    ]
  }
}

function rulesForPackage(pkgId, short, theme) {
  const p = `${pkgId.replace(/[^a-z0-9]+/gi, "_")}`
  const leader = `sk_${short}_00`
  const baseRules = [
    {
      id: `${p}_01_lifecycle_turnstart`,
      trigger: "turn.start",
      priority: 95,
      appliesToSystems: [LAB_SYSTEM_ID],
      conditions: [],
      actions: [
        { type: "emit_event", event: "start_game", payload: {} },
        { type: "emit_event", event: "start_round", payload: {} },
        { type: "emit_event", event: "start_turn", payload: {} },
        { type: "emit_event", event: "timer_tick", payload: {} },
        { type: "emit_event", event: "simulation.tick", payload: {} }
      ]
    },
    {
      id: `${p}_02_turn_end`,
      trigger: "turn.end",
      priority: 40,
      appliesToSystems: [LAB_SYSTEM_ID],
      conditions: [],
      actions: [
        { type: "emit_event", event: "end_turn", payload: {} },
        { type: "emit_event", event: "end_round", payload: {} },
        { type: "emit_event", event: "end_game", payload: {} }
      ]
    },
    {
      id: `${p}_03_damage_stub`,
      trigger: "unit.damaged",
      priority: 60,
      appliesToSystems: [LAB_SYSTEM_ID],
      conditions: [],
      actions: [
        { type: "increment_state", target: "triggering_entity", key: "health", delta: -1 },
        { type: "emit_event", event: "entity_damaged", payload: {} },
        { type: "emit_event", event: "entity_healed", payload: {} }
      ]
    },
    {
      id: `${p}_04_objective_stub`,
      trigger: "objective.scored",
      priority: 55,
      appliesToSystems: [LAB_SYSTEM_ID],
      conditions: [],
      actions: [
        { type: "increment_state", target: leader, key: "resource", delta: 1 },
        { type: "emit_event", event: "objective_scored", payload: {} }
      ]
    },
    {
      id: `${p}_05_status_chain`,
      trigger: "status.applied",
      priority: 30,
      appliesToSystems: [LAB_SYSTEM_ID],
      conditions: [],
      actions: [
        { type: "emit_event", event: "status_applied", payload: {} },
        { type: "emit_event", event: "status_removed", payload: {} }
      ]
    },
    {
      id: `${p}_06_spawn_stub`,
      trigger: "simulation.tick",
      priority: 20,
      appliesToSystems: [LAB_SYSTEM_ID],
      conditions: [{ type: "random_below", threshold: 1 }],
      actions: [{ type: "emit_event", event: "entity_spawned", payload: {} }]
    },
    {
      id: `${p}_07_destroy_cleanup`,
      trigger: "unit.destroyed",
      priority: 70,
      appliesToSystems: [LAB_SYSTEM_ID],
      conditions: [],
      actions: [
        { type: "emit_event", event: "entity_removed", payload: {} },
        { type: "show_message", text: `${pkgId}: entity_removed` }
      ]
    },
    {
      id: `${p}_08_timer_bridge`,
      trigger: "timer.fire",
      priority: 25,
      appliesToSystems: [LAB_SYSTEM_ID],
      conditions: [],
      actions: [{ type: "emit_event", event: "timer_tick", payload: {} }]
    },
    {
      id: `${p}_09_nfc_scan_pulse`,
      trigger: "nfc.scan",
      priority: 15,
      appliesToSystems: [LAB_SYSTEM_ID],
      conditions: [],
      actions: [{ type: "increment_state", target: "triggering_entity", key: "resource", delta: 1 }]
    },
    {
      id: `${p}_10_ai_tick`,
      trigger: "ai.tick",
      priority: 10,
      appliesToSystems: [LAB_SYSTEM_ID],
      conditions: [],
      actions: [{ type: "emit_event", event: "simulation.tick", payload: {} }]
    }
  ]
  const themeRule = {
    id: `${p}_11_${theme.id}`,
    trigger: theme.trigger,
    priority: 18,
    appliesToSystems: [LAB_SYSTEM_ID],
    conditions: [],
    actions: theme.actions
  }
  return [...baseRules, themeRule]
}

function emitPackage(pkg) {
  const base = path.join(skeletonRoot, pkg.id)
  const listsPayload = listFile(pkg.id, pkg.n, pkg.short, pkg.types)
  const list0 = listsPayload.lists[0]
  const adapter = {
    schemaVersion: 1,
    packageId: pkg.id,
    kind: "jsonRoster",
    rootPath: "lists.0",
    listIdField: "id",
    listNameField: "name",
    factionIdField: "factionId",
    unitsPath: "units",
    unitIdField: "id",
    unitNameField: "name",
    unitTagsField: "tags",
    unitTemplateField: "templateId",
    unitTypeField: "entityType",
    unitStateField: "runtime",
    defaultEntityType: "generic",
    unitRelationshipsField: "canonicalRelationships"
  }
  const now = new Date().toISOString()
  const pkgIdx = PACKAGES.indexOf(pkg)
  const hex = (n) => n.toString(16).toUpperCase().padStart(2, "0")
  const assignments = list0.units.slice(0, 5).map((u, idx) => ({
    tagUid: ["04", "00", hex(((pkgIdx + 1) << 4) | (idx & 0x0f)), hex(0x20 + idx * 3), hex(0x40 + pkgIdx), hex(0x50 + idx), hex(0x60 + pkgIdx + idx)].join(":"),
    entityId: u.id,
    displayName: u.name,
    entityType: u.entityType ?? "generic",
    assignedAt: now,
    factionId: list0.factionId,
    gameSystemId: LAB_SYSTEM_ID,
    packageId: pkg.id,
    templateId: u.templateId
  }))

  write(path.join(base, "manifest.json"), {
    packageId: pkg.id,
    name: pkg.name,
    version: 1,
    supportsNFC: true,
    systemId: LAB_SYSTEM_ID,
    contentVersion: "1.0.0-skeleton",
    entityTypes: [...new Set(pkg.types)],
    capabilities: {
      spawnEntities: true,
      timers: true,
      persistentEffects: true,
      maxChainDepthOverride: 28,
      maxEmitsPerRootDispatch: 8000,
      maxSpawnedEntitiesPerTick: 400,
      maxQueueLength: 20000
    },
    importAdapters: {
      jsonRoster: "imports/jsonRosterAdapter.json"
    }
  })

  write(path.join(base, "entities", "templates.json"), {
    schemaVersion: 1,
    packageId: pkg.id,
    templates: list0.units.slice(0, 12).map((u) => ({ id: u.id, name: u.name, tags: u.tags ?? [] }))
  })

  const rules = rulesForPackage(pkg.id, pkg.short, pkg.theme)
  rules.forEach((r, i) => {
    const fn = `${String(i + 1).padStart(2, "0")}_${r.id}.json`
    write(path.join(base, "rules", fn), r)
  })

  write(path.join(base, "actions", "library.json"), {
    schemaVersion: 1,
    description: "Skeleton snippets (not used directly by engine).",
    snippets: {
      bumpResource: [{ type: "increment_state", target: `sk_${pkg.short}_00`, key: "resource", delta: 1 }]
    }
  })

  write(path.join(base, "conditions", "library.json"), {
    schemaVersion: 1,
    description: "Skeleton condition snippets.",
    snippets: {
      always: [{ type: "random_below", threshold: 1 }]
    }
  })

  write(path.join(base, "sample_lists", "default.json"), listsPayload)
  write(path.join(base, "imports", "jsonRosterAdapter.json"), adapter)
  write(path.join(base, "bindings", "nfc_sample_export.json"), {
    schemaVersion: 1,
    exportedAt: now,
    gameSystemId: LAB_SYSTEM_ID,
    factionId: list0.factionId,
    listId: list0.id,
    assignments: assignments.map((a) => ({
      tagUid: a.tagUid,
      entityId: a.entityId,
      displayName: a.displayName,
      entityType: a.entityType,
      assignedAt: a.assignedAt,
      factionId: a.factionId,
      gameSystemId: a.gameSystemId,
      packageId: a.packageId,
      templateId: a.templateId
    }))
  })
  write(path.join(base, "assets", "README.txt"), "Skeleton assets placeholder — replace with art/audio as needed.\n")

  return rules.map((r, i) => ({
    path: `packages/${pkg.id}/rules/${String(i + 1).padStart(2, "0")}_${r.id}.json`
  }))
}

function syncToPublic() {
  for (const pkg of PACKAGES) {
    const src = path.join(skeletonRoot, pkg.id)
    const dest = path.join(publicPackages, pkg.id)
    fs.mkdirSync(dest, { recursive: true })
    fs.cpSync(src, dest, { recursive: true })
  }
}

function mergeRegistry(newRefs) {
  const raw = JSON.parse(fs.readFileSync(registryPath, "utf8"))
  const existing = new Set((raw.eventRefs ?? []).map((r) => r.path))
  let added = 0
  for (const r of newRefs) {
    if (!existing.has(r.path)) {
      raw.eventRefs.push(r)
      existing.add(r.path)
      added++
    }
  }
  raw.eventRefs.sort((a, b) => a.path.localeCompare(b.path))
  fs.writeFileSync(registryPath, JSON.stringify(raw, null, 2), "utf8")
  return added
}

function patchCatalogAndContent() {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"))
  const ref = { path: "systems/skeleton_lab.json" }
  const has = (catalog.systemRefs ?? []).some((r) => r.path === ref.path)
  if (!has) {
    catalog.systemRefs.push(ref)
    fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), "utf8")
  }

  write(path.join(systemsDir, "skeleton_lab.json"), {
    schemaVersion: 1,
    id: LAB_SYSTEM_ID,
    name: "Skeleton lab (mock packages)",
    version: "1.0",
    description: "Lightweight deterministic packages for import, NFC, replay, and simulation coverage — not gameplay-accurate.",
    factionsPath: "factions/skeleton_lab.json"
  })

  write(path.join(factionsDir, "skeleton_lab.json"), {
    schemaVersion: 1,
    package: {
      packageType: "faction-index",
      schemaVersion: 1,
      contentVersion: "1.0.0-skeleton",
      systemId: LAB_SYSTEM_ID,
      factionId: "*"
    },
    factions: PACKAGES.map((p) => ({
      id: `${p.short}_faction`,
      systemId: LAB_SYSTEM_ID,
      name: p.name,
      listsPath: `packages/${p.id}/sample_lists/default.json`
    }))
  })
}

function main() {
  const allRefs = []
  fs.mkdirSync(skeletonRoot, { recursive: true })
  for (const pkg of PACKAGES) {
    allRefs.push(...emitPackage(pkg))
  }
  syncToPublic()
  const registryAdded = mergeRegistry(allRefs)
  patchCatalogAndContent()
  console.log(
    JSON.stringify({
      ok: true,
      packages: PACKAGES.map((p) => p.id),
      skeletonRoot,
      publicPackages,
      ruleRefCandidates: allRefs.length,
      packageRegistryPathsAdded: registryAdded
    })
  )
}

main()
