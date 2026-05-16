/**
 * Package certification (structural + short deterministic sim via nfc-companion CLI).
 * Run from repo root: node tools/package-certification/certify.mjs --rules path/to/rules.json --manifest path/to/manifest.json
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..", "..")

function parseArgs() {
  const a = process.argv.slice(2)
  const o = { rules: null, manifest: null, steps: 50 }
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--rules") o.rules = a[++i] ?? null
    else if (a[i] === "--manifest") o.manifest = a[++i] ?? null
    else if (a[i] === "--steps") o.steps = parseInt(a[++i] ?? "50", 10) || 50
  }
  return o
}

function main() {
  const cfg = parseArgs()
  if (!cfg.rules || !fs.existsSync(cfg.rules)) {
    console.error(JSON.stringify({ ok: false, error: "missing --rules path" }))
    process.exit(1)
  }
  const rulesTxt = fs.readFileSync(cfg.rules, "utf8")
  let rules
  try {
    rules = JSON.parse(rulesTxt)
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: "rules JSON parse failed", detail: String(e) }))
    process.exit(1)
  }
  if (!Array.isArray(rules)) {
    console.error(JSON.stringify({ ok: false, error: "rules file must be a JSON array" }))
    process.exit(1)
  }
  const companion = path.join(root, "nfc-companion")
  const tsxCli = path.join(companion, "node_modules", "tsx", "dist", "cli.mjs")
  const r = spawnSync(
    process.execPath,
    [tsxCli, "scripts/simulation-cli.ts", "--seed", "certify", "--steps", String(cfg.steps), "--rules", path.resolve(cfg.rules), ...(cfg.manifest && fs.existsSync(cfg.manifest) ? ["--manifest", path.resolve(cfg.manifest)] : [])],
    {
      cwd: companion,
      encoding: "utf8"
    }
  )
  const simOk = r.status === 0
  const report = {
    ok: simOk,
    schemaVersion: 1,
    ruleCount: rules.length,
    simExitCode: r.status,
    stderrTail: (r.stderr || "").slice(-2000),
    stdoutTail: (r.stdout || "").slice(-2000)
  }
  fs.mkdirSync(path.join(root, "tmp"), { recursive: true })
  fs.writeFileSync(path.join(root, "tmp", "certification-report.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
  process.exit(simOk ? 0 : 1)
}

main()
