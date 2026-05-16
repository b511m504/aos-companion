/**
 * Deterministic simulation CLI (Node + tsx). Uses the same RuntimeEngine + SimulationRunner as the app.
 *
 * Examples:
 *   npx tsx scripts/simulation-cli.ts --seed demo --steps 200 --checkpointInterval 50 --replayOut replay.json
 *   npx tsx scripts/simulation-cli.ts --seed x --rules ./path/to/rules.json --manifest ./path/to/manifest.json --soak
 */
import fs from "node:fs"
import path from "node:path"

import type { ArmyList, Assignment } from "../src/models/types"
import type { EventRule } from "../src/models/runtimeTypes"
import { createIsolatedRuntimeEngine } from "../src/runtime/RuntimeEngine"
import { SimulationRunner } from "../src/runtime/SimulationRunner"
import { DeterministicTimeProvider } from "../src/runtime/time/DeterministicClock"

type CliConfig = {
  seed: string | number
  steps: number
  checkpointInterval: number
  replayOut: string | null
  rulesPath: string | null
  listPath: string | null
  manifestPath: string | null
  soak: boolean
  strict: boolean
  timeMode: "wall" | "logical"
  deterministicClock: boolean
  eventLedger: boolean
}

const DEFAULT_LIST: ArmyList = {
  id: "cli-list",
  name: "CLI list",
  factionId: "cli-faction",
  units: [
    { id: "u1", name: "Unit 1", tags: ["model"] },
    { id: "u2", name: "Unit 2", tags: ["model"] }
  ]
}

function parseArgs(argv: string[]): CliConfig {
  const out: CliConfig = {
    seed: "cli-default",
    steps: 100,
    checkpointInterval: 0,
    replayOut: null,
    rulesPath: null,
    listPath: null,
    manifestPath: null,
    soak: false,
    strict: false,
    timeMode: "logical",
    deterministicClock: false,
    eventLedger: false
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--help" || a === "-h") {
      console.log(`simulation-cli.ts
  --seed <string|number>
  --steps <n>              max simulation turns (default 100)
  --checkpointInterval <n> rolling snapshot every n turns (0 = off)
  --replayOut <path>       write replay JSON on completion
  --rules <path>           JSON array of EventRule (default: no rules)
  --list <path>            JSON ArmyList object
  --manifest <path>        JSON package manifest (capabilities / limits)
  --soak                   set steps very high for long runs
  --strict                 strict package/rules validation on bootstrap
  --wall                   wall-clock time mode (default: logical)
  --deterministicClock     virtual TimeProvider (no wall Date.now in engine paths)
  --eventLedger            append-only EventLedger enabled
`)
      process.exit(0)
    } else if (a === "--seed") out.seed = argv[++i] ?? out.seed
    else if (a === "--steps") out.steps = Math.max(1, parseInt(argv[++i] ?? "100", 10) || 100)
    else if (a === "--checkpointInterval") out.checkpointInterval = Math.max(0, parseInt(argv[++i] ?? "0", 10) || 0)
    else if (a === "--replayOut") out.replayOut = argv[++i] ?? "replay.json"
    else if (a === "--rules") out.rulesPath = argv[++i] ?? null
    else if (a === "--list") out.listPath = argv[++i] ?? null
    else if (a === "--manifest") out.manifestPath = argv[++i] ?? null
    else if (a === "--soak") out.soak = true
    else if (a === "--strict") out.strict = true
    else if (a === "--wall") out.timeMode = "wall"
    else if (a === "--deterministicClock") out.deterministicClock = true
    else if (a === "--eventLedger") out.eventLedger = true
  }
  if (out.soak) {
    out.steps = Math.max(out.steps, 5_000_000)
    if (out.checkpointInterval === 0) out.checkpointInterval = 1000
  }
  return out
}

function readJson<T>(filePath: string): T {
  const abs = path.resolve(filePath)
  const raw = fs.readFileSync(abs, "utf8")
  return JSON.parse(raw) as T
}

async function main() {
  const cfg = parseArgs(process.argv.slice(2))
  let list = DEFAULT_LIST
  if (cfg.listPath) {
    list = readJson<ArmyList>(cfg.listPath)
  }
  const rules: EventRule[] = cfg.rulesPath ? readJson<EventRule[]>(cfg.rulesPath) : []
  const packageManifests: unknown[] = []
  if (cfg.manifestPath) {
    packageManifests.push(readJson<unknown>(cfg.manifestPath))
  }

  const engine = createIsolatedRuntimeEngine()
  const runner = new SimulationRunner(engine)
  const assignments: Assignment[] = []
  const timeProvider = cfg.deterministicClock ? new DeterministicTimeProvider(0) : undefined
  const result = await runner.run({
    systemId: "cli",
    list,
    assignments,
    rules,
    strictValidation: cfg.strict,
    packageManifests,
    timeProvider,
    enableEventLedger: cfg.eventLedger,
    options: {
      maxTurns: cfg.steps,
      seed: cfg.seed,
      timeMode: cfg.timeMode,
      entityIds: list.units.map((u) => u.id),
      checkpointEvery: cfg.checkpointInterval || undefined,
      exportReplayOut: Boolean(cfg.replayOut)
    }
  })

  if (cfg.replayOut && result.replayJson) {
    fs.writeFileSync(path.resolve(cfg.replayOut), result.replayJson, "utf8")
  }

  console.log(
    JSON.stringify({
      ok: true,
      haltedReason: result.haltedReason,
      metrics: result.metrics,
      snapshotCheckpoints: result.snapshots?.length ?? 0,
      replayWritten: Boolean(cfg.replayOut && result.replayJson),
      diagnosticsSampleLengths: {
        queue: engine.exportRuntimeDiagnosticsViz().queueOccupancyHistory.length,
        ledgerEntries: engine.exportEventLedger().entries.length
      }
    })
  )
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
