/**
 * Short soak: generate mock package, run simulation CLI, emit JSON metrics.
 * node stress-tests/soak/soak-simulation.mjs
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..", "..")
const companion = path.join(root, "nfc-companion")
const outDir = path.join(os.tmpdir(), `nfc-soak-${Date.now()}`)

fs.mkdirSync(outDir, { recursive: true })

const g = spawnSync(process.execPath, [path.join(root, "tools", "mock-package-generator", "generate.mjs"), "--rules", "40", "--emitRate", "0.05", "--seed", "soak", "--outDir", outDir], {
  cwd: root,
  encoding: "utf8"
})
if (g.status !== 0) {
  console.error(g.stderr)
  process.exit(1)
}

const rulesPath = path.join(outDir, "rules.json")
const manPath = path.join(outDir, "manifest.json")
const tsxCli = path.join(companion, "node_modules", "tsx", "dist", "cli.mjs")
const r = spawnSync(
  process.execPath,
  [tsxCli, "scripts/simulation-cli.ts", "--seed", "soak", "--steps", "40", "--checkpointInterval", "10", "--rules", rulesPath, "--manifest", manPath],
  {
    cwd: companion,
    encoding: "utf8"
  }
)
const metrics = (() => {
  try {
    const line = (r.stdout || "").trim().split("\n").pop()
    return line ? JSON.parse(line) : null
  } catch {
    return null
  }
})()
const report = { ok: r.status === 0, gen: g.stdout?.trim(), simMetrics: metrics, stderr: (r.stderr || "").slice(-500) }
fs.writeFileSync(path.join(outDir, "soak-report.json"), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report))
process.exit(report.ok ? 0 : 1)
