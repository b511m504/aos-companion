const fs = require("fs")
const path = require("path")
const { extractAll } = require("./extractor")
const { normalizeUnit } = require("./normalizer")
const { parseUnit, logParseValidation } = require("./parser")

function slugify(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function groupUnitsByFaction(units) {
  const factions = {}
  for (const unit of units) {
    const faction = unit.faction || "Unknown"
    if (!factions[faction]) factions[faction] = []
    factions[faction].push(unit)
  }
  return factions
}

function writeFactionPacks(factionsByName) {
  const factionsDir = path.join("structured", "factions")
  fs.mkdirSync(factionsDir, { recursive: true })

  const usedSlugs = new Set()
  const writtenPaths = []

  for (const [factionName, factionUnits] of Object.entries(factionsByName)) {
    let slug = slugify(factionName) || "unknown"
    let uniqueSlug = slug
    let n = 2
    while (usedSlugs.has(uniqueSlug)) {
      uniqueSlug = `${slug}-${n}`
      n += 1
    }
    usedSlugs.add(uniqueSlug)

    const pack = {
      faction: factionName,
      rules: [],
      detachments: [],
      units: factionUnits
    }

    const filePath = path.join(factionsDir, `${uniqueSlug}.json`)
    fs.writeFileSync(filePath, JSON.stringify(pack, null, 2))
    writtenPaths.push(filePath)
  }

  return writtenPaths
}

function writeCoreRules() {
  const core = {
    version: "1.0",
    phases: [
      "Hero Phase",
      "Movement Phase",
      "Shooting Phase",
      "Charge Phase",
      "Combat Phase"
    ]
  }
  const filePath = path.join("structured", "core_rules.json")
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(core, null, 2))
  return filePath
}

async function run() {
  const rawUnits = await extractAll()

  const structured = rawUnits.map(u =>
    parseUnit(normalizeUnit(u))
  )

  const sectionCounts = {
    ranged_weapons_text: 0,
    melee_weapons_text: 0,
    battle_profile_text: 0,
    abilities_text: 0,
    keywords_text: 0
  }
  let abilitiesSeparatedCount = 0
  const statCounts = {
    unit_size: 0,
    points: 0,
    base_size: 0,
    reinforced: 0,
    regiment_options: 0,
    notes: 0
  }
  let unitsWithKeywordsCount = 0
  let totalKeywordsCount = 0
  let maxKeywordsInUnit = 0
  let unitsWithFactionKeywordsCount = 0
  let totalFactionKeywordsCount = 0
  let unitsWithParsedAbilitiesCount = 0
  let totalParsedAbilitiesCount = 0
  let unitsWithWeaponsCount = 0
  let totalWeaponsCount = 0
  let unitsFailedWeaponParse = 0

  for (const unit of structured) {
    for (const key of Object.keys(sectionCounts)) {
      if (typeof unit[key] === "string" && unit[key].trim()) {
        sectionCounts[key] += 1
      }
    }
    if (
      typeof unit.battle_profile_text === "string" &&
      typeof unit.abilities_text === "string" &&
      unit.battle_profile_text.trim() &&
      unit.abilities_text.trim()
    ) {
      abilitiesSeparatedCount += 1
    }
    if (unit.stats && typeof unit.stats === "object") {
      for (const key of Object.keys(statCounts)) {
        if (typeof unit.stats[key] === "string" && unit.stats[key].trim()) {
          statCounts[key] += 1
        }
      }
    }
    if (Array.isArray(unit.keywords) && unit.keywords.length > 0) {
      unitsWithKeywordsCount += 1
      totalKeywordsCount += unit.keywords.length
      if (unit.keywords.length > maxKeywordsInUnit) {
        maxKeywordsInUnit = unit.keywords.length
      }
    }
    if (Array.isArray(unit.faction_keywords) && unit.faction_keywords.length > 0) {
      unitsWithFactionKeywordsCount += 1
      totalFactionKeywordsCount += unit.faction_keywords.length
    }
    if (Array.isArray(unit.abilities) && unit.abilities.length > 0) {
      unitsWithParsedAbilitiesCount += 1
      totalParsedAbilitiesCount += unit.abilities.length
    }
    const hasWeaponText =
      (typeof unit.ranged_weapons_text === "string" && unit.ranged_weapons_text.trim()) ||
      (typeof unit.melee_weapons_text === "string" && unit.melee_weapons_text.trim())
    const weaponCount = Array.isArray(unit.weapons) ? unit.weapons.length : 0
    if (weaponCount > 0) {
      unitsWithWeaponsCount += 1
      totalWeaponsCount += weaponCount
    } else if (hasWeaponText) {
      unitsFailedWeaponParse += 1
    }
  }

  logParseValidation(structured)

  fs.mkdirSync("structured", { recursive: true })
  fs.writeFileSync("structured/output.json", JSON.stringify(structured, null, 2))
  console.log("Wrote structured/output.json")

  const factionsByName = groupUnitsByFaction(structured)
  const factionNames = Object.keys(factionsByName)
  const factionPackPaths = writeFactionPacks(factionsByName)
  const manifest = Object.entries(factionsByName).map(([name, units]) => ({
    name,
    slug: slugify(name),
    units: units.length
  }))
  const manifestPath = path.join("structured", "factions", "manifest.json")
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  const coreRulesPath = writeCoreRules()

  console.log("")
  console.log("Faction packs:")
  console.log(`  factions: ${factionNames.length}`)
  for (const name of factionNames.sort((a, b) => a.localeCompare(b))) {
    console.log(`  - ${name}: ${factionsByName[name].length} units`)
  }
  console.log("  files written:")
  for (const p of factionPackPaths.sort()) {
    console.log(`    ${p}`)
  }
  console.log(`    ${manifestPath}`)
  console.log(`    ${coreRulesPath}`)
  console.log("")

  console.log("Section detection counts:")
  for (const [section, count] of Object.entries(sectionCounts)) {
    console.log(`${section}: ${count}`)
  }
  console.log(`abilities_separated_count: ${abilitiesSeparatedCount}`)
  console.log("Stats extraction counts:")
  for (const [statKey, count] of Object.entries(statCounts)) {
    console.log(`${statKey}: ${count}`)
  }
  const averageKeywordsPerUnit =
    unitsWithKeywordsCount === 0 ? 0 : totalKeywordsCount / unitsWithKeywordsCount
  const averageFactionKeywordsPerUnit =
    unitsWithFactionKeywordsCount === 0
      ? 0
      : totalFactionKeywordsCount / unitsWithFactionKeywordsCount
  const averageAbilitiesPerUnit =
    unitsWithParsedAbilitiesCount === 0
      ? 0
      : totalParsedAbilitiesCount / unitsWithParsedAbilitiesCount
  const averageWeaponsPerUnit =
    unitsWithWeaponsCount === 0 ? 0 : totalWeaponsCount / unitsWithWeaponsCount
  console.log(`units_with_keywords: ${unitsWithKeywordsCount}`)
  console.log(`avg_keywords_per_unit: ${averageKeywordsPerUnit.toFixed(2)}`)
  console.log(`avg_faction_keywords_per_unit: ${averageFactionKeywordsPerUnit.toFixed(2)}`)
  console.log(`max_keywords_in_unit: ${maxKeywordsInUnit}`)
  console.log(`units_with_parsed_abilities: ${unitsWithParsedAbilitiesCount}`)
  console.log(`avg_abilities_per_unit: ${averageAbilitiesPerUnit.toFixed(2)}`)
  console.log(`units_with_weapons: ${unitsWithWeaponsCount}`)
  console.log(`avg_weapons_per_unit: ${averageWeaponsPerUnit.toFixed(2)}`)
  console.log(`units_failed_weapon_parse: ${unitsFailedWeaponParse}`)
  console.log("Pipeline complete.")
}

run()