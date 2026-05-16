/**
 * Validates package manifests expose generic capabilities block.
 * Run: node stress-tests/manifest-capabilities.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..", "packages")
let err = 0
for (const name of fs.readdirSync(root, { withFileTypes: true })) {
  if (!name.isDirectory()) continue
  const p = path.join(root, name.name, "manifest.json")
  if (!fs.existsSync(p)) continue
  const m = JSON.parse(fs.readFileSync(p, "utf8"))
  if (!m.capabilities || typeof m.capabilities !== "object") {
    console.error(`Missing capabilities: ${p}`)
    err++
    continue
  }
  const c = m.capabilities
  if (c.maxChainDepthOverride != null && typeof c.maxChainDepthOverride !== "number") {
    console.error(`Bad maxChainDepthOverride in ${p}`)
    err++
  }
}
if (err) process.exit(1)
console.log("manifest-capabilities: OK")
