/**
 * Copies workspace `packages/` into `nfc-companion/public/packages/` so Vite dev/build
 * serves rule JSON and manifests at `./packages/...`.
 * Also writes package_registry.json (all per-package rules/*.json paths).
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
const src = path.join(root, "packages")
const dst = path.join(root, "nfc-companion", "public", "packages")

function collectRuleRefs(dir) {
  /** @type {string[]} */
  const out = []
  if (!fs.existsSync(dir)) return out
  const names = fs.readdirSync(dir, { withFileTypes: true })
  for (const ent of names) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      const rulesDir = path.join(p, "rules")
      if (fs.existsSync(rulesDir)) {
        for (const f of fs.readdirSync(rulesDir)) {
          if (f.endsWith(".json")) {
            const rel = path.posix.join("packages", ent.name, "rules", f)
            out.push(rel)
          }
        }
      }
    }
  }
  out.sort()
  return out
}

if (!fs.existsSync(src)) {
  console.warn("[sync-packages] No workspace packages/ directory — skipping.")
  process.exit(0)
}

fs.mkdirSync(dst, { recursive: true })
fs.cpSync(src, dst, { recursive: true })

const refs = collectRuleRefs(dst).map((relPath) => ({ path: relPath }))
const registry = { schemaVersion: 1, eventRefs: refs }
fs.writeFileSync(path.join(dst, "package_registry.json"), JSON.stringify(registry, null, 2), "utf8")

console.log(`[sync-packages] Synced packages/ → nfc-companion/public/packages/ (${refs.length} rule files registered).`)
