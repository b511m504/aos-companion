/**
 * Validates workspace packages: every rules JSON trigger is in RUNTIME_EVENT_NAMES_ARR.
 * Run from repo root: node stress-tests/validate-package-rules.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
const constantsPath = path.join(root, "nfc-companion", "src", "runtime", "runtimeConstants.ts")
const packagesRoot = path.join(root, "packages")

function parseEventNames(ts) {
  const m = ts.match(/RUNTIME_EVENT_NAMES_ARR\s*=\s*\[([\s\S]*?)\]\s*as\s*const/)
  if (!m) throw new Error("Could not find RUNTIME_EVENT_NAMES_ARR in runtimeConstants.ts")
  const body = m[1]
  const names = []
  const re = /"([^"]+)"/g
  let x
  while ((x = re.exec(body))) names.push(x[1])
  return new Set(names)
}

function walkRules(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const pkg of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue
    const rulesDir = path.join(dir, pkg.name, "rules")
    if (!fs.existsSync(rulesDir)) continue
    for (const f of fs.readdirSync(rulesDir)) {
      if (!f.endsWith(".json")) continue
      out.push(path.join(rulesDir, f))
    }
  }
  return out
}

const allow = parseEventNames(fs.readFileSync(constantsPath, "utf8"))
const files = walkRules(packagesRoot)
let errors = 0
for (const f of files) {
  const rule = JSON.parse(fs.readFileSync(f, "utf8"))
  const t = rule.trigger
  if (typeof t !== "string" || !allow.has(t)) {
    console.error(`INVALID trigger in ${path.relative(root, f)}: ${JSON.stringify(t)}`)
    errors++
  }
}
if (errors) {
  console.error(`validate-package-rules: ${errors} error(s)`)
  process.exit(1)
}
console.log(`validate-package-rules: OK (${files.length} rule files, ${allow.size} allowed event names)`)
