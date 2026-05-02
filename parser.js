function toWarscrollText(warscroll) {
  if (typeof warscroll === "string") {
    return warscroll
  }
  if (Array.isArray(warscroll)) {
    return warscroll.filter(part => typeof part === "string").join("\n\n")
  }
  return ""
}

function sectionBetween(text, startAnchor, endAnchor) {
  const upper = text.toUpperCase()
  const start = upper.indexOf(startAnchor)
  if (start === -1) return ""

  const contentStart = start + startAnchor.length
  let contentEnd = text.length
  if (endAnchor) {
    const end = upper.indexOf(endAnchor, contentStart)
    if (end !== -1) contentEnd = end
  }
  return text.slice(contentStart, contentEnd).trim()
}

const ABILITY_MARKERS = [
  "Passive",
  "Once Per Battle",
  "Once Per Turn",
  "Your Hero Phase",
  "Your Shooting Phase",
  "Your Movement Phase",
  "Reaction:",
  "Start of Battle Round"
]

const ABILITY_TYPES = [
  { marker: "Passive", type: "Passive" },
  { marker: "Once Per Battle", type: "Once Per Battle" },
  { marker: "Once Per Turn", type: "Once Per Turn" },
  { marker: "Your Hero Phase", type: "Your Hero Phase" },
  { marker: "Your Shooting Phase", type: "Your Shooting Phase" },
  { marker: "Your Movement Phase", type: "Your Movement Phase" },
  { marker: "Reaction:", type: "Reaction" },
  { marker: "Start of Battle Round", type: "Start of Battle Round" }
]

const ALLOWED_ABILITY_TYPES = ["Passive", "Once Per Turn", "Once Per Battle", "Reaction"]

/** Trim trailing junk from the KEYWORDS slice (after the label) before parseKeywords. */
function trimKeywordsSectionBody(body) {
  if (!body || typeof body !== "string") return ""
  const rest = body.trim()
  const abilityCut = rest.search(
    /Passive|Once Per Turn|Once Per Battle|Reaction:|Your\s+.+?\s+Phase|Start of Battle Round/i
  )
  const cutDouble = rest.search(/\n\n+[A-Z][^\n]{2,}/)
  const cutStat = rest.search(/\n\d{1,2}["']\s*\n/)
  let end = rest.length
  if (abilityCut >= 0) end = Math.min(end, abilityCut)
  if (cutDouble >= 0) end = Math.min(end, cutDouble)
  if (cutStat >= 0) end = Math.min(end, cutStat)
  return rest.slice(0, end).trim()
}

function splitBattleAndAbilities(block) {
  if (!block) {
    return { battle_profile_text: "", abilities_text: "" }
  }

  const markerIndexes = ABILITY_MARKERS
    .map(marker => block.indexOf(marker))
    .filter(index => index >= 0)
  const firstMarkerIndex = markerIndexes.length > 0 ? Math.min(...markerIndexes) : -1

  if (firstMarkerIndex === -1) {
    return {
      battle_profile_text: block.trim(),
      abilities_text: ""
    }
  }

  return {
    battle_profile_text: block.slice(0, firstMarkerIndex).trim(),
    abilities_text: block.slice(firstMarkerIndex).trim()
  }
}

function extractField(text, pattern) {
  const match = text.match(pattern)
  if (!match || !match[1]) return ""
  return match[1].trim()
}

function extractStats(battleProfileText) {
  if (!battleProfileText) return {}

  const stats = {}

  const unitSize = extractField(
    battleProfileText,
    /Unit Size:\s*(.+?)(?=\s*(?:Points:|Base\s*size:|Can be reinforced:|Regiment Options:|Notes:|Passive|Once Per Turn|Your Hero Phase|Your Movement Phase|Reaction:|Start of Battle Round|$))/i
  )
  const points = extractField(
    battleProfileText,
    /Points:\s*(.+?)(?=\s*(?:Base\s*size:|Can be reinforced:|Regiment Options:|Notes:|Passive|Once Per Turn|Your Hero Phase|Your Movement Phase|Reaction:|Start of Battle Round|$))/i
  )
  const baseSize = extractField(
    battleProfileText,
    /Base\s*size:\s*(.+?)(?=\s*(?:Can be reinforced:|Regiment Options:|Notes:|Passive|Once Per Turn|Your Hero Phase|Your Movement Phase|Reaction:|Start of Battle Round|$))/i
  )
  const reinforced = extractField(
    battleProfileText,
    /Can be reinforced:\s*(.+?)(?=\s*(?:Regiment Options:|Notes:|Passive|Once Per Turn|Your Hero Phase|Your Movement Phase|Reaction:|Start of Battle Round|$))/i
  )
  const regimentOptions = extractField(
    battleProfileText,
    /Regiment Options:\s*(.+?)(?=\s*(?:Notes:|Passive|Once Per Turn|Your Hero Phase|Your Movement Phase|Reaction:|Start of Battle Round|$))/i
  )
  const notes = extractField(
    battleProfileText,
    /Notes:\s*(.+?)(?=\s*(?:Passive|Once Per Turn|Your Hero Phase|Your Movement Phase|Reaction:|Start of Battle Round|$))/i
  )

  if (unitSize) stats.unit_size = unitSize
  if (points) stats.points = points
  if (baseSize) stats.base_size = baseSize
  if (reinforced) stats.reinforced = reinforced
  if (regimentOptions) stats.regiment_options = regimentOptions
  if (notes) stats.notes = notes

  return stats
}

/** Merges timing clauses like "Once Per Turn (Army), Your Hero Phase NAME:" into one block (drops phase so splitters do not fire twice). */
function normalizeCombinedAbilityMarkers(text) {
  return text.replace(
    /(Once\s+Per\s+(?:Turn|Battle)(?:\s*\([^)]*\))?)\s*,\s*Your\s+[A-Za-z]+\s+Phase/gi,
    "$1"
  )
}

function splitAbilityBlocks(abilitiesText) {
  if (!abilitiesText || typeof abilitiesText !== "string") return []

  let text = abilitiesText.replace(/\n+/g, "\n").trim()
  if (!text) return []

  text = normalizeCombinedAbilityMarkers(text)

  // Global strict marker lookahead split.
  const splitRegex =
    /(?=Passive|Once Per Battle|Once Per Turn|Your Hero Phase|Your Shooting Phase|Your Movement Phase|Reaction:|Start of Battle Round)/g

  const markerStartRegex =
    /^(Passive|Once Per Battle|Once Per Turn|Your Hero Phase|Your Shooting Phase|Your Movement Phase|Reaction:|Start of Battle Round)/

  const blocks = text
    .split(splitRegex)
    .map(block => block.trim())
    .filter(Boolean)
    .filter(block => markerStartRegex.test(block))

  if (blocks.length > 0) return blocks
  return [text]
}

function detectAbilityType(block) {
  const trimmed = block.trim()
  for (const { marker, type } of ABILITY_TYPES) {
    if (trimmed.startsWith(marker)) return type
  }
  return "Unknown"
}

function normalizeAbilityType(raw) {
  if (!raw) return "Other"
  if (raw.includes("Passive")) return "Passive"
  if (raw.includes("Once Per Turn")) return "Once Per Turn"
  if (raw.includes("Once Per Battle")) return "Once Per Battle"
  if (raw.includes("Reaction")) return "Reaction"
  return "Other"
}

function phaseFromRawType(rawType) {
  if (rawType === "Your Hero Phase") return "Hero Phase"
  if (rawType === "Your Movement Phase") return "Movement Phase"
  if (rawType === "Your Shooting Phase") return "Shooting Phase"
  return null
}

/** Reaction: … 'NAME': desc or … SHOUTY NAME: desc */
function extractReactionNameAndDescription(cleanedBlock) {
  const body = cleanedBlock.replace(/^Reaction:\s*/i, "").trim()
  const sq = body.match(/'([^']{3,})'\s*:\s*/)
  if (sq) {
    return {
      name: sq[1].trim(),
      description: body.slice(sq.index + sq[0].length).trim()
    }
  }
  const dq = body.match(/"([^"]{3,})"\s*:\s*/)
  if (dq) {
    return {
      name: dq[1].trim(),
      description: body.slice(dq.index + dq[0].length).trim()
    }
  }
  const smart = body.match(/\u2018([^\u2019]{3,})\u2019\s*:\s*/)
  if (smart) {
    return {
      name: smart[1].trim(),
      description: body.slice(smart.index + smart[0].length).trim()
    }
  }
  const caps = body.match(/\b([A-Z0-9 \-!',]{5,})\s*:\s*/)
  if (caps) {
    const cand = caps[1].trim()
    const compact = cand.replace(/[^A-Za-z]/g, "")
    if (compact.length >= 4 && cand === cand.toUpperCase()) {
      return {
        name: cand,
        description: body.slice(caps.index + caps[0].length).trim()
      }
    }
  }
  return null
}

function cleanAbilityName(namePart, type) {
  let cleaned = namePart.trim()

  if (type === "Passive") {
    cleaned = cleaned.replace(/^Passive\s*/i, "")
  } else if (type === "Once Per Battle") {
    cleaned = cleaned.replace(/^Once Per Battle(?:\s*\([^)]*\))?\s*,?\s*/i, "")
  } else if (type === "Once Per Turn") {
    cleaned = cleaned.replace(/^Once Per Turn(?:\s*\([^)]*\))?\s*,?\s*/i, "")
  } else if (type === "Your Hero Phase") {
    cleaned = cleaned.replace(/^Your Hero Phase\s*/i, "")
  } else if (type === "Your Shooting Phase") {
    cleaned = cleaned.replace(/^Your Shooting Phase\s*/i, "")
  } else if (type === "Your Movement Phase") {
    cleaned = cleaned.replace(/^Your Movement Phase\s*/i, "")
  } else if (type === "Reaction") {
    cleaned = cleaned.replace(/^Reaction:\s*/i, "")
  } else if (type === "Start of Battle Round") {
    cleaned = cleaned.replace(/^Start of Battle Round\s*/i, "")
  }

  cleaned = cleaned
    .replace(/\bYour Hero Phase\b/gi, "")
    .replace(/\bAny Hero Phase\b/gi, "")
    .replace(/\bAny Combat Phase\b/gi, "")
    .replace(/\bDeployment Phase\b/gi, "")
    .replace(/\bYour Movement Phase\b/gi, "")
    .replace(/\bYour Shooting Phase\b/gi, "")
    .replace(/\bStart of Battle Round\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[,:\-\s]+/, "")
    .trim()

  cleaned = cleaned
    .replace(/Your\s+.+?\s+Phase/gi, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim()

  return cleaned
}

function polishAbilityName(name) {
  if (!name || typeof name !== "string") return ""
  return name
    .replace(/Your\s+.+?\s+Phase/gi, "")
    .replace(/Enemy\s+.+?\s+Phase/gi, "")
    .replace(/\bDeclare\b.*$/i, "")
    .replace(/^[^A-Z]*([A-Z][A-Z'’\s!:-]+)$/, "$1")
    .replace(/\s+/g, " ")
    .trim()
}

function hasVowelLike(s) {
  return /[aeiouyAEIOUY]/.test(s)
}

/** Longest run of title-case / all-caps words (e.g. EXECUTIONER'S ENTOURAGE). */
function extractFullUppercasePhraseFromNamePart(namePart) {
  if (!namePart || typeof namePart !== "string") return ""
  const segment = namePart.split(":")[0].trim()
  const re = /(?:[A-Z]+(?:'[A-Z]+)?)(?:\s+[A-Z]+(?:'[A-Z]+)?)+/g
  let best = ""
  let m
  while ((m = re.exec(segment)) !== null) {
    if (m[0].length > best.length) best = m[0]
  }
  return best.trim()
}

function shouldFallbackAbilityName(name) {
  if (!name || name.length < 5) return true
  if (!hasVowelLike(name)) return true
  return false
}

function parseAbilityBlock(block) {
  const cleanedBlock = block.trim()
  if (!cleanedBlock) return null

  const rawType = detectAbilityType(cleanedBlock)
  let type = normalizeAbilityType(rawType)
  if (!ALLOWED_ABILITY_TYPES.includes(type)) {
    type = "Other"
  }

  const phase = phaseFromRawType(rawType)

  let namePart
  let description

  if (rawType === "Reaction") {
    const extracted = extractReactionNameAndDescription(cleanedBlock)
    if (extracted) {
      namePart = extracted.name
      description = extracted.description
    } else {
      const colonIndex = cleanedBlock.indexOf(":")
      if (colonIndex === -1) return null
      namePart = cleanedBlock.slice(0, colonIndex).trim()
      description = (cleanedBlock.slice(colonIndex + 1).trim() || "").trim()
    }
  } else {
    const colonIndex = cleanedBlock.indexOf(":")
    if (colonIndex === -1) return null
    namePart = cleanedBlock.slice(0, colonIndex).trim()
    description = (cleanedBlock.slice(colonIndex + 1).trim() || "").trim()
  }

  let name = cleanAbilityName(namePart, rawType)
  name = polishAbilityName(name)
  if (shouldFallbackAbilityName(name)) {
    const fb = extractFullUppercasePhraseFromNamePart(namePart)
    if (fb && fb.length >= 3) name = fb
  }
  if (!name || name.length < 3) return null
  if (!description || description.length < 10) return null

  const out = { name, type, description }
  if (phase) out.phase = phase
  return out
}

function parseAbilities(abilitiesText) {
  const blocks = splitAbilityBlocks(abilitiesText)
  return blocks.map(parseAbilityBlock).filter(Boolean)
}

function normalizeWeaponSectionText(sectionText) {
  if (typeof sectionText !== "string") return ""
  return sectionText
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim()
}

function extractBracketAbility(headerText) {
  const match = headerText.match(/\[([^\]]+)\]/)
  return match ? match[1].trim() : null
}

/** Finds rule phrases (e.g. Anti-HERO (+1 Rend), Crit (Mortal)) anywhere in header + post-stat tail. */
function collectInlineWeaponRulePhrases(text) {
  if (!text || typeof text !== "string") return []
  const phrases = []
  const anti = /\bAnti-[\w]+\s*\([^)]*\)/gi
  for (const x of text.match(anti) || []) {
    phrases.push(x.trim())
  }
  const crit = /\bCrit\s*\([^)]*\)/gi
  for (const x of text.match(crit) || []) {
    phrases.push(x.trim())
  }
  return [...new Set(phrases)]
}

/** After multiline name is collapsed to one line (see cleanWeaponName): strip stat table tokens and leading header runs. */
function stripWeaponStatHeaders(name) {
  if (!name || typeof name !== "string") return ""
  let n = name
    .replace(/\n/g, " ")
    .replace(/\b(Rng|Atk|Hit|Wnd|Rnd|Dmg)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
  n = n.replace(/^((?:Rng|Atk|Hit|Wnd|Rnd|Dmg)\s*)+/gi, "")
  n = n.replace(/\b(Shoot in Combat|Companion)\b/gi, "")
  return n.replace(/\s+/g, " ").trim()
}

function cleanWeaponName(headerText, weaponType) {
  if (!headerText) return ""

  let cleaned = String(headerText)
    .replace(/\n/g, " ")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\bRANGED WEAPONS\b/gi, " ")
    .replace(/\bMELEE WEAPONS\b/gi, " ")
    .replace(/\bRngAtkHitWndRndDmg\b/gi, " ")
    .replace(/\bAtkHitWndRndDmg\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()

  // If the block still looks sentence-like, keep only the trailing short phrase.
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length > 8) {
    cleaned = words.slice(-8).join(" ")
  }

  cleaned = cleaned.replace(/^[,;:\-]+|[,;:\-]+$/g, "").trim()

  if (!cleaned) return weaponType === "ranged" ? "Unknown Ranged Weapon" : "Unknown Melee Weapon"
  return cleaned
}

function splitWeaponEntries(sectionText) {
  const normalized = normalizeWeaponSectionText(sectionText)
  if (!normalized) return []

  const statRegex =
    /(?:\b(\d{1,2}")\s+)?\b(\d+|D\d+)\s+(\d\+)\s+(\d\+)\s+([-+]?\d+|-)\s+(\d+|D\d+)\b/gi
  const entries = []

  let match = statRegex.exec(normalized)
  let previousEnd = 0
  while (match) {
    const start = match.index
    const end = statRegex.lastIndex
    const header = normalized.slice(previousEnd, start).trim()
    entries.push({ header, statMatch: match, statStart: start, statEnd: end })
    previousEnd = end
    match = statRegex.exec(normalized)
  }

  if (entries.length === 0) {
    return [{ header: normalized, statMatch: null, statStart: -1, statEnd: -1 }]
  }

  return entries
}

function parseWeaponsFromSection(sectionText, weaponType) {
  const normalized = normalizeWeaponSectionText(sectionText)
  const entries = splitWeaponEntries(sectionText)
  const parsed = []

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]
    const nextStatStart =
      i + 1 < entries.length && entries[i + 1].statStart >= 0
        ? entries[i + 1].statStart
        : normalized.length
    const tail =
      entry.statEnd >= 0 ? normalized.slice(entry.statEnd, nextStatStart).trim() : ""

    const pool = [entry.header, tail].filter(Boolean).join(" ")
    const bracketAbil = extractBracketAbility(entry.header)
    const phrases = collectInlineWeaponRulePhrases(pool)
    const abilityParts = [bracketAbil, ...phrases].filter(Boolean)
    const abilities = abilityParts.length ? abilityParts.join(", ") : null

    const name = stripWeaponStatHeaders(cleanWeaponName(entry.header, weaponType))

    let range = null
    let attacks = null
    let hit = null
    let wound = null
    let rend = null
    let damage = null

    if (entry.statMatch) {
      range = entry.statMatch[1] ? entry.statMatch[1].trim() : null
      attacks = entry.statMatch[2] ? entry.statMatch[2].trim() : null
      hit = entry.statMatch[3] ? entry.statMatch[3].trim() : null
      wound = entry.statMatch[4] ? entry.statMatch[4].trim() : null
      rend = entry.statMatch[5] ? entry.statMatch[5].trim() : null
      damage = entry.statMatch[6] ? entry.statMatch[6].trim() : null
    }

    const weapon = {
      name: name || "",
      type: weaponType,
      range,
      attacks,
      hit,
      wound,
      rend,
      damage,
      abilities: abilities || null
    }

    if (weapon.name) parsed.push(weapon)
  }

  const unique = []
  const seen = new Set()
  for (const weapon of parsed) {
    const key = [
      weapon.name,
      weapon.type,
      weapon.range || "",
      weapon.attacks || "",
      weapon.hit || "",
      weapon.wound || "",
      weapon.rend || "",
      weapon.damage || "",
      weapon.abilities || ""
    ].join("|")
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(weapon)
  }

  return unique
}

const KEYWORD_LOWERCASE_RATIO_MAX = 0.12

function keywordLowercaseRatio(part) {
  const letters = part.replace(/[^a-zA-Z]/g, "")
  if (!letters.length) return 0
  const lower = (part.match(/[a-z]/g) || []).length
  return lower / letters.length
}

/** Bleed from ability prose: function words + verb-like ending. */
function keywordLooksLikeAbilityPhrase(part) {
  if (!part || typeof part !== "string") return false
  if (/\b(?:OF THE|TO THE|IN THE|ON THE)\b/i.test(part)) return true
  if (/\b(?:THE|OF|TO)\s+[A-Za-z]{3,}(?:ing|ed|es)\b/i.test(part)) return true
  if (/\b(?:OF|THE|TO)\s+[a-z]{3,}ing\b/i.test(part)) return true
  return false
}

function parseKeywords(keywordsText) {
  if (!keywordsText || typeof keywordsText !== "string") return []

  const withoutLabel = keywordsText.replace(/^KEYWORDS\s*/i, "").trim()
  if (!withoutLabel) return []

  const disallowedFragments = ["Effect", "Declare", "Pick", "Roll"]
  const allowedCharsPattern = /^[A-Z0-9 ()+-]+$/

  const cleaned = withoutLabel
    .split(/[,\r\n]+/)
    .map(part => part.trim())
    .filter(Boolean)
    .filter(part => part.length >= 2 && part.length <= 30)
    .filter(part => !part.includes(":"))
    .filter(part => !part.includes("."))
    .filter(part => !disallowedFragments.some(fragment => part.includes(fragment)))
    .filter(part => part.split(/\s+/).filter(Boolean).length <= 4)
    .filter(part => keywordLowercaseRatio(part) <= KEYWORD_LOWERCASE_RATIO_MAX)
    .filter(part => !keywordLooksLikeAbilityPhrase(part))
    .filter(part => allowedCharsPattern.test(part))
    .filter(part => {
      const preferredChars = (part.match(/[A-Z ()+\-]/g) || []).length
      return preferredChars / part.length >= 0.7
    })

  return [...new Set(cleaned)]
}

const FACTION_KEYWORD_PATTERNS = [
  "ORDER",
  "CHAOS",
  "DEATH",
  "DESTRUCTION",
  "CITIES OF SIGMAR",
  "STORMCAST ETERNALS",
  "SKAVEN",
  "GLOOMSPITE GITZ",
  "FYRESLAYERS",
  "IDONETH DEEPKIN",
  "KHARADRON OVERLORDS",
  "LUMINETH REALM-LORDS",
  "LUMINETH REALM LORDS",
  "SYLVANETH",
  "OSSIARCH BONEREAPERS",
  "DAUGHTERS OF KHAINE",
  "FLESH-EATER COURTS",
  "FLESH EATER COURTS",
  "MAGGOTKIN OF NURGLE",
  "DISCIPLES OF TZEENTCH",
  "SONS OF BEHEMAT",
  "SLAVES TO DARKNESS",
  "NIGHTHAUNT",
  "SOULBLIGHT GRAVELORDS",
  "OGOR MAWTRIBES",
  "ORRUK WARCLANS",
  "SERAPHON"
]

function splitCoreAndFactionKeywords(keywords) {
  const coreKeywords = []
  const factionKeywords = []

  for (const keyword of keywords) {
    const isFactionKeyword = FACTION_KEYWORD_PATTERNS.some(pattern => keyword.includes(pattern))
    if (isFactionKeyword) {
      factionKeywords.push(keyword)
    } else {
      coreKeywords.push(keyword)
    }
  }

  return {
    keywords: [...new Set(coreKeywords)],
    faction_keywords: [...new Set(factionKeywords)]
  }
}

function parseUnit(u) {
  const warscrollText = toWarscrollText(u.warscroll)
  const battleAndAbilitiesBlock = sectionBetween(warscrollText, "BATTLE PROFILE", "KEYWORDS")
  const { battle_profile_text, abilities_text } = splitBattleAndAbilities(battleAndAbilitiesBlock)

  let keywords_text = sectionBetween(warscrollText, "KEYWORDS", null)
  keywords_text = trimKeywordsSectionBody(keywords_text)
  const parsedKeywords = parseKeywords(keywords_text)
  const { keywords, faction_keywords } = splitCoreAndFactionKeywords(parsedKeywords)
  const abilities = parseAbilities(abilities_text)
  const ranged_weapons_text = sectionBetween(warscrollText, "RANGED WEAPONS", "MELEE WEAPONS")
  const melee_weapons_text = sectionBetween(warscrollText, "MELEE WEAPONS", "BATTLE PROFILE")
  const rangedWeapons = parseWeaponsFromSection(ranged_weapons_text, "ranged")
  const meleeWeapons = parseWeaponsFromSection(melee_weapons_text, "melee")
  const weapons = [...rangedWeapons, ...meleeWeapons]

  return {
    name: u.name || "",
    faction: u.faction || "",
    warscroll: u.warscroll,
    ranged_weapons_text,
    melee_weapons_text,
    battle_profile_text,
    stats: extractStats(battle_profile_text),
    abilities_text,
    abilities,
    weapons,
    keywords_text,
    keywords,
    faction_keywords
  }
}

function logParseValidation(units) {
  if (!Array.isArray(units) || units.length === 0) return

  const names = units.map(u => (u.name || "").trim()).filter(n => n.length >= 4)
  let longKw = 0
  const badReaction = []
  const bleed = []
  const shortAbilityNames = []
  const kwSpaceLowerSamples = []
  let manyKeywordUnits = 0

  for (const u of units) {
    const kt = typeof u.keywords_text === "string" ? u.keywords_text : ""
    if (kt.length > 300) longKw += 1

    const kws = Array.isArray(u.keywords) ? u.keywords : []
    const fk = Array.isArray(u.faction_keywords) ? u.faction_keywords : []
    const allK = [...kws, ...fk]
    if (allK.length > 15) manyKeywordUnits += 1

    for (const kw of allK) {
      if (typeof kw === "string" && /\s/.test(kw) && /[a-z]/.test(kw)) {
        if (kwSpaceLowerSamples.length < 20) kwSpaceLowerSamples.push(`${u.name}: ${kw}`)
      }
    }

    for (const a of u.abilities || []) {
      if (!a || typeof a.name !== "string") continue
      const an = a.name.trim()
      if (an === "Reaction") {
        badReaction.push(u.name)
        break
      }
      if (an.length > 0 && an.length < 5) {
        shortAbilityNames.push(`${u.name}: "${an}"`)
      }
    }

    const selfName = (u.name || "").trim().toLowerCase()
    const hay = toWarscrollText(u.warscroll).toLowerCase()
    for (const otherName of names) {
      const on = otherName.toLowerCase()
      if (!on || on === selfName) continue
      if (hay.includes(on)) {
        bleed.push(`${u.name} ← contains other unit name: ${otherName}`)
        break
      }
    }
  }

  console.log(`[parse validation] keywords_text length > 300 chars: ${longKw} units`)
  if (badReaction.length) {
    console.log(
      `[parse validation] ability name === "Reaction": ${badReaction.length} units (sample):`,
      badReaction.slice(0, 12)
    )
  } else {
    console.log(`[parse validation] ability name === "Reaction": 0 units`)
  }
  console.log(
    `[parse validation] warscroll may contain another unit name (substring match): ${bleed.length} units`
  )
  bleed.slice(0, 15).forEach(line => console.log("  ", line))

  console.log(`[parse validation] abilities with name length < 5: ${shortAbilityNames.length}`)
  shortAbilityNames.slice(0, 25).forEach(line => console.log("  ", line))
  console.log(
    `[parse validation] keywords with spaces + lowercase (sample ${Math.min(20, kwSpaceLowerSamples.length)}):`
  )
  kwSpaceLowerSamples.forEach(line => console.log("  ", line))
  console.log(`[parse validation] units with >15 keywords (core+faction): ${manyKeywordUnits}`)
}

module.exports = { parseUnit, logParseValidation }