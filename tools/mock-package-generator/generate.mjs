/**
 * Generate a large mock rules JSON + manifest for soak / certification tests.
 * Run from repo root: node tools/mock-package-generator/generate.mjs --rules 2000 --seed 1 --outDir ./tmp/mock-pkg
 *
 * Optional canonical roster stress payload (for import-cert-cli / graph validation):
 *   --listEntities 2000 --inventoryDepth 3 --relationshipDensity 0.02 --transportChains 5 --orphanChance 0.001 --circularChance 0.001
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..", "..")

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)] ?? arr[0]
}

const TRIGGERS = [
  "simulation.tick",
  "turn.start",
  "turn.end",
  "ai.tick",
  "rng.table",
  "action.spent",
  "unit.damaged",
  "timer.fire"
]

function parseArgs() {
  const a = process.argv.slice(2)
  const o = {
    rules: 500,
    entities: 20,
    depth: 4,
    emitRate: 0.15,
    timers: 0,
    malformedChance: 0,
    seed: "mock",
    outDir: path.join(root, "tmp", "mock-pkg"),
    listEntities: 0,
    inventoryDepth: 0,
    relationshipDensity: 0,
    transportChains: 0,
    orphanChance: 0,
    circularChance: 0
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--rules") o.rules = parseInt(a[++i] ?? "500", 10) || 500
    else if (a[i] === "--entities") o.entities = parseInt(a[++i] ?? "20", 10) || 20
    else if (a[i] === "--depth") o.depth = parseInt(a[++i] ?? "4", 10) || 4
    else if (a[i] === "--emitRate") o.emitRate = parseFloat(a[++i] ?? "0.15") || 0
    else if (a[i] === "--timers") o.timers = parseInt(a[++i] ?? "0", 10) || 0
    else if (a[i] === "--malformedChance") o.malformedChance = parseFloat(a[++i] ?? "0") || 0
    else if (a[i] === "--seed") o.seed = a[++i] ?? o.seed
    else if (a[i] === "--outDir") o.outDir = a[++i] ?? o.outDir
    else if (a[i] === "--listEntities") o.listEntities = parseInt(a[++i] ?? "0", 10) || 0
    else if (a[i] === "--inventoryDepth") o.inventoryDepth = parseInt(a[++i] ?? "0", 10) || 0
    else if (a[i] === "--relationshipDensity") o.relationshipDensity = parseFloat(a[++i] ?? "0") || 0
    else if (a[i] === "--transportChains") o.transportChains = parseInt(a[++i] ?? "0", 10) || 0
    else if (a[i] === "--orphanChance") o.orphanChance = parseFloat(a[++i] ?? "0") || 0
    else if (a[i] === "--circularChance") o.circularChance = parseFloat(a[++i] ?? "0") || 0
  }
  return o
}

function buildInventoryTree(rng, depth, prefix, leafIdx) {
  if (depth <= 0) return []
  const n = 1 + Math.floor(rng() * 3)
  const out = []
  for (let k = 0; k < n; k++) {
    const id = `${prefix}_inv_${leafIdx}_${depth}_${k}`
    const row = { itemId: id, qty: 1 + Math.floor(rng() * 4) }
    if (depth > 1) row.children = buildInventoryTree(rng, depth - 1, prefix, leafIdx * 10 + k)
    out.push(row)
  }
  return out
}

function writeCanonicalRosterStress(cfg, outDir, rng) {
  if (cfg.listEntities <= 0) return
  const pkgId = `mock_${cfg.seed}`
  const listId = `mock-roster-${cfg.listEntities}-${cfg.seed}`
  const entityTypes = ["hero", "monster", "room", "chest", "spell", "quest_item", "npc", "transport", "door", "objective"]

  const units = []
  for (let i = 0; i < cfg.listEntities; i++) {
    const id = `mock_ent_${i}`
    const et = entityTypes[i % entityTypes.length]
    const runtime = {}
    if (cfg.inventoryDepth > 0) {
      runtime.inventory = buildInventoryTree(rng, cfg.inventoryDepth, id, i)
    }
    const canonicalRelationships = []

    if (i < cfg.listEntities - 1 && cfg.transportChains > 0 && i % Math.max(1, Math.floor(cfg.listEntities / cfg.transportChains)) === 0) {
      canonicalRelationships.push({
        id: `tr_${i}`,
        kind: "transport_passenger",
        toInstanceId: `mock_ent_${i + 1}`
      })
    }

    if (rng() < cfg.relationshipDensity && cfg.listEntities > 2) {
      const tgt = (i + 1 + Math.floor(rng() * (cfg.listEntities - 2))) % cfg.listEntities
      canonicalRelationships.push({
        id: `rel_${i}_party`,
        kind: "party_member",
        toInstanceId: `mock_ent_${tgt}`
      })
    }

    if (rng() < cfg.orphanChance) {
      canonicalRelationships.push({
        id: `orph_${i}`,
        kind: "equipment_on",
        toInstanceId: `nonexistent_orphan_${i}`
      })
    }

    if (rng() < cfg.circularChance && i < cfg.listEntities - 1) {
      canonicalRelationships.push({
        id: `circ_a_${i}`,
        kind: "transport_passenger",
        toInstanceId: `mock_ent_${i + 1}`
      })
      // second edge added on next unit pass — handled below
    }

    units.push({
      id,
      name: `Stress ${et} ${i}`,
      tags: ["stress", et],
      entityType: et,
      templateId: `tpl_${et}`,
      runtime,
      canonicalRelationships
    })
  }

  for (let i = 0; i < units.length - 1; i++) {
    if (rng() < cfg.circularChance) {
      units[i + 1].canonicalRelationships.push({
        id: `circ_b_${i}`,
        kind: "transport_passenger",
        toInstanceId: `mock_ent_${i}`
      })
    }
  }

  const listsFile = {
    schemaVersion: 1,
    package: {
      packageType: "lists",
      schemaVersion: 1,
      contentVersion: "1.0.0",
      systemId: pkgId,
      factionId: "mock_faction"
    },
    lists: [
      {
        id: listId,
        name: `Mock canonical roster (${cfg.listEntities})`,
        factionId: "mock_faction",
        description: "Generated by tools/mock-package-generator for import stress",
        units
      }
    ]
  }

  const adapter = {
    schemaVersion: 1,
    packageId: pkgId,
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
    defaultEntityType: "unit",
    unitRelationshipsField: "canonicalRelationships"
  }

  const impDir = path.join(outDir, "imports")
  fs.mkdirSync(impDir, { recursive: true })
  fs.writeFileSync(path.join(impDir, "jsonRosterAdapter.json"), JSON.stringify(adapter, null, 2))
  fs.writeFileSync(path.join(outDir, "sample_canonical_roster.json"), JSON.stringify(listsFile, null, 2))
}

function main() {
  const cfg = parseArgs()
  const rng = mulberry32(hashSeed(cfg.seed))
  fs.mkdirSync(cfg.outDir, { recursive: true })
  const rules = []
  for (let i = 0; i < cfg.rules; i++) {
    const trig = pick(rng, TRIGGERS)
    const id = `mock_rule_${i}`
    const actions = []
    if (rng() < cfg.emitRate && cfg.depth > 0) {
      const next = pick(rng, TRIGGERS)
      actions.push({ type: "emit_event", event: next, payload: { mockDepth: (i % cfg.depth) + 1, seq: i } })
    }
    if (cfg.timers > 0 && i % Math.max(1, Math.floor(cfg.rules / cfg.timers)) === 0) {
      actions.push({ type: "emit_event", event: "timer.fire", payload: { mockTimer: i } })
    }
    if (rng() < cfg.malformedChance) {
      actions.push({ type: "emit_event", event: "not_a_real_event", payload: {} })
    }
    if (actions.length === 0) {
      actions.push({ type: "show_message", text: `mock ${i}` })
    }
    rules.push({
      id,
      trigger: trig,
      priority: Math.floor(rng() * 10),
      conditions: [{ type: "random_below", threshold: 1 }],
      actions
    })
  }
  const manifest = {
    packageId: `mock_${cfg.seed}`,
    schemaVersion: 1,
    capabilities: {
      spawnEntities: true,
      timers: true,
      persistentEffects: true,
      maxChainDepthOverride: cfg.depth + 8,
      maxEmitsPerRootDispatch: 50_000,
      maxSpawnedEntitiesPerTick: 2000,
      maxQueueLength: 100_000
    }
  }
  fs.writeFileSync(path.join(cfg.outDir, "rules.json"), JSON.stringify(rules, null, 2))
  fs.writeFileSync(path.join(cfg.outDir, "manifest.json"), JSON.stringify(manifest, null, 2))
  const summary = { ok: true, outDir: cfg.outDir, ruleCount: rules.length }
  writeCanonicalRosterStress(cfg, cfg.outDir, rng)
  if (cfg.listEntities > 0) {
    Object.assign(summary, {
      rosterSample: path.join(cfg.outDir, "sample_canonical_roster.json"),
      rosterAdapter: path.join(cfg.outDir, "imports", "jsonRosterAdapter.json")
    })
  }
  console.log(JSON.stringify(summary))
}

function hashSeed(s) {
  let h = 0
  for (let i = 0; i < String(s).length; i++) h = Math.imul(31, h) + String(s).charCodeAt(i)
  return h >>> 0
}

main()
