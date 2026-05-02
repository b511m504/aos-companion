const fs = require("fs")
const path = require("path")
const { chromium, request } = require("playwright")

const START_URL =
  process.env.AOS_START_URL || "https://wahapedia.ru/aos4/factions/cities-of-sigmar/warscrolls.html"
const OUTPUT_PATH = path.join("extracted", "raw_units.json")
const MAX_LINKS = Number(process.env.AOS_MAX_LINKS || 500)
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

function cleanText(value) {
  return (value || "").replace(/\s+/g, " ").trim()
}

function extractFactionFromBreadcrumbs(parts) {
  for (const part of parts) {
    if (!part) continue
    if (/factions?/i.test(part)) continue
    if (/warscrolls?|units?/i.test(part)) continue
    return part
  }
  return ""
}

async function collectUnitLinks(page, startUrl) {
  await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 90000 })

  const links = await page.$$eval("a[href]", anchors =>
    anchors
      .map(a => a.href)
      .filter(Boolean)
      .map(href => href.split("#")[0])
  )

  const startHost = new URL(startUrl).host
  const filtered = links.filter(link => {
    try {
      const url = new URL(link)
      if (url.host !== startHost) return false
      const text = url.href.toLowerCase()
      return /warscroll|unit/.test(text)
    } catch {
      return false
    }
  })

  return [...new Set(filtered)].slice(0, MAX_LINKS)
}

function extractLinksFromHtml(html, baseUrl) {
  const regex = /href=["']([^"']*(?:warscroll|unit)[^"']*)["']/gi
  const links = new Set()
  let match = regex.exec(html)
  while (match) {
    const raw = match[1]
    try {
      const resolved = new URL(raw, baseUrl).href
      links.add(resolved.split("#")[0])
    } catch {
      // skip invalid URL
    }
    match = regex.exec(html)
  }
  return [...links]
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
}

// Warscroll section starts at a marker like: • ... WARSCROLL • (spacing may vary)
const WARSCROLL_MARKER_REGEX = /•\s*[A-Z0-9 '&\-]+\s+WARSCROLL\s*•/g

function splitWarscrollChunks(fullText) {
  if (!fullText || typeof fullText !== "string") return []

  const markers = []
  let match = WARSCROLL_MARKER_REGEX.exec(fullText)
  while (match) {
    markers.push({ index: match.index, text: match[0] })
    match = WARSCROLL_MARKER_REGEX.exec(fullText)
  }
  if (markers.length === 0) return []

  const chunks = []
  for (let i = 0; i < markers.length; i += 1) {
    const start = markers[i].index
    const end = i + 1 < markers.length ? markers[i + 1].index : fullText.length
    let chunk = fullText.slice(start, end).trim()
    chunk = trimWarscrollChunkTail(chunk)
    if (chunk) chunks.push(chunk)
  }
  return chunks
}

// Hard stop at the next warscroll header so one chunk = one unit (no KEYWORDS/category heuristics).
function trimWarscrollChunkTail(chunk) {
  if (!chunk || typeof chunk !== "string") return chunk

  let cut = chunk.length

  const cosRe = /CITIES OF SIGMAR WARSCROLL/i
  const cosIdx = chunk.slice(1).search(cosRe)
  if (cosIdx >= 0) {
    cut = Math.min(cut, cosIdx + 1)
  }

  const re = /•\s*[A-Z0-9 '&\-]+\s+WARSCROLL\s*•/g
  let seen = 0
  let m
  while ((m = re.exec(chunk)) !== null) {
    seen += 1
    if (seen >= 2) {
      cut = Math.min(cut, m.index)
      break
    }
  }

  return chunk.slice(0, cut).trimEnd().trim()
}

function extractUnitNameFromChunk(chunkText) {
  if (!chunkText) return ""

  const withoutMarker = chunkText
    .replace(/^•\s*[A-Z0-9 '&\-]+\s+WARSCROLL\s*•\s*/i, "")
    .trim()
  const lines = withoutMarker.split(/\n+/).map(l => l.trim()).filter(Boolean)
  // Name is usually on the line after WARSCROLL, often prefixed with •
  const nameLine = lines.find(l => /^•/.test(l)) || lines[0] || ""
  let name = nameLine.replace(/^•\s*/, "").trim()
  name = cleanText(name).replace(/\[[^\]]*]/g, "").trim()

  // Remove trailing compacted stat tokens if present.
  name = name.replace(/\d.*$/, "").trim()
  name = name.replace(/[:;,.\-]+$/, "").trim()

  return name
}

async function collectUnitLinksFallback(api, startUrl) {
  const response = await api.get(startUrl)
  if (!response.ok()) return []
  const html = await response.text()
  let links = extractLinksFromHtml(html, startUrl)

  // If we only found faction/list pages, follow them once to gather deeper unit links.
  const maybeFactionPages = links.filter(link => /\/factions\//i.test(link)).slice(0, 60)
  for (const factionUrl of maybeFactionPages) {
    try {
      const factionResponse = await api.get(factionUrl)
      if (!factionResponse.ok()) continue
      const factionHtml = await factionResponse.text()
      links.push(...extractLinksFromHtml(factionHtml, factionUrl))
    } catch {
      // continue on failure
    }
  }

  return [...new Set(links)].slice(0, MAX_LINKS)
}

async function extractUnitFromPage(page, url) {
  console.log(`Visiting: ${url}`)
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })

  const payload = await page.evaluate(() => {
    const pageTitle =
      (document.querySelector("h1, main h1, .page-title, [itemprop='name']")?.textContent || "").trim()
    const breadcrumbParts = Array.from(
      document.querySelectorAll("nav a, .breadcrumb a, .breadcrumbs a")
    )
      .map(a => (a.textContent || "").trim())
      .filter(Boolean)
    const faction = breadcrumbParts.find(x => /sigmar|chaos|death|order|destruction/i.test(x)) || ""
    const fullText = (document.body?.innerText || "").trim()
    return { pageTitle, faction, breadcrumbParts, fullText }
  })

  const pageTitle = cleanText(payload.pageTitle)
  const breadcrumbFaction = extractFactionFromBreadcrumbs(payload.breadcrumbParts || [])
  const urlFaction = cleanText(
    (url.match(/\/factions\/([^/]+)/i)?.[1] || "").replace(/-/g, " ")
  )
  const faction = cleanText(payload.faction || breadcrumbFaction || urlFaction) || "Unknown"
  const chunks = splitWarscrollChunks(payload.fullText || "")
  if (chunks.length === 0) return []

  const units = []
  for (const chunk of chunks) {
    const name = extractUnitNameFromChunk(chunk)
    if (!name) continue
    units.push({
      name,
      faction,
      warscroll: chunk,
      source_url: url
    })
  }

  if (units.length > 0) return units
  if (!pageTitle) return []
  return [{ name: pageTitle, faction, warscroll: chunks[0], source_url: url }]
}

async function extractAll() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    locale: "en-US",
    extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" }
  })
  const page = await context.newPage()
  const api = await request.newContext({
    userAgent: USER_AGENT,
    extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" }
  })

  let unitLinks = []
  try {
    unitLinks = await collectUnitLinks(page, START_URL)
  } catch (error) {
    console.error(`Failed to collect links from ${START_URL}: ${error.message}`)
  }

  if (unitLinks.length === 0) {
    console.warn("Browser link discovery returned 0; trying request fallback...")
    try {
      unitLinks = await collectUnitLinksFallback(api, START_URL)
    } catch (error) {
      console.warn(`Fallback link discovery failed: ${error.message}`)
    }
  }

  console.log(`Links found: ${unitLinks.length}`)
  if (unitLinks.length === 0) {
    console.error("ERROR: No unit links found — selector likely broken")
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
    fs.writeFileSync(OUTPUT_PATH, "[]")
    await api.dispose()
    await browser.close()
    return []
  }

  const units = []
  for (const link of unitLinks) {
    try {
      const pageUnits = await extractUnitFromPage(page, link)
      if (pageUnits.length === 0) {
        console.warn(`Warning: no usable data found on ${link}`)
        continue
      }
      units.push(...pageUnits)
    } catch (error) {
      console.warn(`Warning: failed to extract ${link}: ${error.message}`)
    }
  }

  const deduped = []
  const seen = new Set()
  for (const unit of units) {
    const key = `${unit.faction.toLowerCase()}::${unit.name.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(unit)
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(deduped, null, 2))

  console.log(`Total units extracted: ${deduped.length}`)
  const firstWarscroll = deduped[0]?.warscroll
  console.log(`warscroll type: ${typeof firstWarscroll}`)
  console.log("First 3 unit names:")
  console.log(JSON.stringify(deduped.slice(0, 3).map(unit => unit.name), null, 2))

  await api.dispose()
  await browser.close()
  return deduped
}

module.exports = { extractAll }

if (require.main === module) {
  extractAll().catch(error => {
    console.error(`Extractor failed: ${error.message}`)
    process.exitCode = 1
  })
}