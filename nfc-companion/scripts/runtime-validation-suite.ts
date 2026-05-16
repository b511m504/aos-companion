/**
 * Integrated validation + stress harness for deterministic NFC runtime (Node + tsx).
 * Does not replace manual Runtime Lab UI checks; records machine-verifiable results in JSON.
 *
 *   npx tsx scripts/runtime-validation-suite.ts
 *   npx tsx scripts/runtime-validation-suite.ts --out ../runtime-validation-report.json --turns 400 --export-dir ./tmp/validation-exports
 *   npx tsx scripts/runtime-validation-suite.ts --soak-turns 5000
 */
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

import type { Action, Condition, EventRule, RuntimeEventName } from "../src/models/runtimeTypes"
import type { ArmyList, Assignment } from "../src/models/types"
import type { JsonRosterAdapterV1 } from "../src/content-import/ImportTypes"
import { ImportSessionManager } from "../src/content-import/ImportSessionManager"
import { validateJsonRosterAdapter } from "../src/content-import/validateImport"
import { EntityRelationshipGraph } from "../src/runtime/relationships/EntityRelationshipGraph"
import {
  exportAssignmentBundleJson,
  parseAssignmentBundleJson,
  previewAssignmentBundleImport,
  applyAssignmentImportPreview
} from "../src/services/AssignmentBundleService"
import { createIsolatedRuntimeEngine } from "../src/runtime/RuntimeEngine"
import { SimulationRunner } from "../src/runtime/SimulationRunner"
import { DeterministicTimeProvider } from "../src/runtime/time/DeterministicClock"
import { ReplayRunner } from "../src/runtime/replay/ReplayRunner"
import { ReplayRecorder } from "../src/runtime/replay/ReplayRecorder"
import { SnapshotManager } from "../src/runtime/snapshots/SnapshotManager"
import { RUNTIME_EVENT_NAMES } from "../src/runtime/runtimeConstants"
import { validateRuleDiagnostics } from "../src/runtime/ruleValidation"
import { runDifferentialReplay } from "../src/runtime/replay/DifferentialReplayRunner"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const COMPANION_ROOT = path.resolve(__dirname, "..")
const REPO_ROOT = path.resolve(COMPANION_ROOT, "..")

const EXPECTED_SKELETON_IDS = [
  "warhammer40k_skeleton",
  "age_of_sigmar_skeleton",
  "kill_team_skeleton",
  "crypt_assault_skeleton",
  "legends_rpg_skeleton",
  "boardgame_skeleton",
  "cardgame_skeleton",
  "dungeon_skeleton",
  "strategy_skeleton"
] as const

type Cli = {
  out: string
  exportDir: string | null
  turns: number
  checkpointEvery: number
  soakTurns: number
  skipMockGen: boolean
  skipSoak: boolean
}

function parseCli(argv: string[]): Cli {
  const o: Cli = {
    out: path.join(REPO_ROOT, "runtime-validation-report.json"),
    exportDir: null,
    turns: 350,
    checkpointEvery: 25,
    soakTurns: 0,
    skipMockGen: false,
    skipSoak: false
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--help" || a === "-h") {
      console.log(`runtime-validation-suite.ts
  --out <path>              default: <repo>/runtime-validation-report.json
  --export-dir <path>       write per-package canonical/relationship JSON + analytics CSV
  --turns <n>               SimulationRunner maxTurns per skeleton package (default 350)
  --checkpointEvery <n>     rolling snapshot interval (default 25)
  --soak-turns <n>          optional long single-engine soak after per-package checks
  --skip-mock-gen           skip tools/mock-package-generator scenarios
  --skip-soak               skip --soak-turns even if set`)
      process.exit(0)
    } else if (a === "--out") o.out = path.resolve(argv[++i] ?? o.out)
    else if (a === "--export-dir") o.exportDir = path.resolve(argv[++i] ?? "")
    else if (a === "--turns") o.turns = Math.max(1, parseInt(argv[++i] ?? "350", 10) || 350)
    else if (a === "--checkpointEvery") o.checkpointEvery = Math.max(0, parseInt(argv[++i] ?? "25", 10) || 0)
    else if (a === "--soak-turns") o.soakTurns = Math.max(0, parseInt(argv[++i] ?? "0", 10) || 0)
    else if (a === "--skip-mock-gen") o.skipMockGen = true
    else if (a === "--skip-soak") o.skipSoak = true
  }
  return o
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function packageIdsFromRegistry(registry: unknown): string[] {
  if (!isRecord(registry)) return []
  const refs = registry.eventRefs
  if (!Array.isArray(refs)) return []
  const ids = new Set<string>()
  for (const r of refs) {
    if (!isRecord(r) || typeof r.path !== "string") continue
    const m = r.path.match(/^packages\/([^/]+)\//)
    if (m?.[1]) ids.add(m[1])
  }
  return [...ids].sort((a, b) => a.localeCompare(b))
}

function normalizeActionRecord(raw: Record<string, unknown>): Record<string, unknown> {
  const next = { ...raw }
  if (next.type === "increment_state" && typeof next.amount === "number" && next.delta === undefined) {
    next.delta = next.amount
  }
  return next
}

function normalizeActions(raw: unknown): Action[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(isRecord)
    .map((a) => normalizeActionRecord(a) as Action)
}

function parseRuleFile(raw: unknown, file: string): { ok: true; value: EventRule } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: `${file}: rule must be object` }
  const id = raw.id
  const trigger = raw.trigger
  if (typeof id !== "string" || !id.trim()) return { ok: false, error: `${file}: id required` }
  if (typeof trigger !== "string" || !RUNTIME_EVENT_NAMES.has(trigger)) {
    return { ok: false, error: `${file}: unknown or disallowed trigger ${String(trigger)}` }
  }
  const conditions = Array.isArray(raw.conditions) ? (raw.conditions as Condition[]) : []
  const actions = normalizeActions(raw.actions)
  const appliesToSystems = Array.isArray(raw.appliesToSystems)
    ? (raw.appliesToSystems as unknown[]).filter((x): x is string => typeof x === "string")
    : null
  const priority = typeof raw.priority === "number" && Number.isFinite(raw.priority) ? raw.priority : 0
  return {
    ok: true,
    value: {
      id,
      trigger: trigger as RuntimeEventName,
      priority,
      appliesToSystems: appliesToSystems?.length ? appliesToSystems : null,
      conditions: conditions as EventRule["conditions"],
      actions
    }
  }
}

function loadMergedRulesFromRegistry(publicRoot: string, registryPath: string): {
  rules: EventRule[]
  loadWarnings: string[]
  ruleFilesLoaded: number
} {
  const root = readJson<unknown>(registryPath)
  if (!isRecord(root) || root.schemaVersion !== 1 || !Array.isArray(root.eventRefs)) {
    throw new Error("package_registry.json: invalid root")
  }
  const rules: EventRule[] = []
  const loadWarnings: string[] = []
  let ruleFilesLoaded = 0
  for (const ref of root.eventRefs) {
    if (!isRecord(ref) || typeof ref.path !== "string") continue
    const abs = path.join(publicRoot, ref.path)
    if (!fs.existsSync(abs)) {
      loadWarnings.push(`missing file: ${ref.path}`)
      continue
    }
    ruleFilesLoaded++
    const raw = readJson<unknown>(abs)
    const pr = parseRuleFile(raw, ref.path)
    if (!pr.ok) {
      loadWarnings.push(pr.error)
      continue
    }
    const diag = validateRuleDiagnostics(pr.value, ref.path)
    loadWarnings.push(...diag.map((d) => `${ref.path}: ${d}`))
    rules.push(pr.value)
  }
  return { rules, loadWarnings, ruleFilesLoaded }
}

function manifestPathForPackage(publicRoot: string, packageId: string): string {
  return path.join(publicRoot, "packages", packageId, "manifest.json")
}

function loadManifestRecord(publicRoot: string, packageId: string): Record<string, unknown> | null {
  const p = manifestPathForPackage(publicRoot, packageId)
  if (!fs.existsSync(p)) return null
  const v = readJson<unknown>(p)
  return isRecord(v) ? v : null
}

function buildMockAssignments(list: ArmyList, gameSystemId: string, count: number): Assignment[] {
  const now = new Date().toISOString()
  const out: Assignment[] = []
  for (let i = 0; i < Math.min(count, list.units.length); i++) {
    const u = list.units[i]!
    out.push({
      tagUid: `04E1F2A3B4C5D6E7F8${String(i).padStart(2, "0")}`,
      entityId: u.id,
      entityType: u.entityType ?? "unit",
      displayName: u.name,
      factionId: list.factionId,
      gameSystemId,
      assignedAt: now,
      packageId: u.packageId,
      templateId: u.templateId
    })
  }
  return out
}

function containmentHits(log: ReturnType<ReturnType<typeof createIsolatedRuntimeEngine>["getDebugLog"]>): number {
  let n = 0
  for (const e of log) {
    if (e.kind === "warning" && typeof e.text === "string") {
      const t = e.text.toLowerCase()
      if (t.includes("sandbox") || t.includes("containment") || t.includes("cap exceeded")) n++
    }
  }
  return n
}

function queueFifoSanity(q: ReturnType<ReturnType<typeof createIsolatedRuntimeEngine>["getQueueSnapshot"]>): {
  ok: boolean
  detail?: string
} {
  for (let i = 1; i < q.length; i++) {
    const a = q[i - 1]!.logicalEnqueuedAt
    const b = q[i]!.logicalEnqueuedAt
    if (b < a) return { ok: false, detail: `logicalEnqueuedAt decreased at index ${i}` }
  }
  return { ok: true }
}

function vizToAnalyticsCsv(viz: ReturnType<ReturnType<typeof createIsolatedRuntimeEngine>["exportRuntimeDiagnosticsViz"]>): string {
  const lines = ["index,queueDepth,chainDepth"]
  const n = Math.max(viz.queueOccupancyHistory.length, viz.chainDepthSampleHistory.length)
  for (let i = 0; i < n; i++) {
    lines.push(`${i},${viz.queueOccupancyHistory[i] ?? ""},${viz.chainDepthSampleHistory[i] ?? ""}`)
  }
  return lines.join("\n")
}

function summarizeViz(viz: ReturnType<ReturnType<typeof createIsolatedRuntimeEngine>["exportRuntimeDiagnosticsViz"]>, metrics: {
  eventsProcessed: number
  followUpsEnqueued: number
}): Record<string, number | string> {
  const q = viz.queueOccupancyHistory
  const c = viz.chainDepthSampleHistory
  const maxQ = q.length ? Math.max(...q) : 0
  const maxC = c.length ? Math.max(...c) : 0
  const amp = metrics.eventsProcessed > 0 ? metrics.followUpsEnqueued / metrics.eventsProcessed : 0
  return {
    samples: q.length,
    maxQueueDepthSampled: maxQ,
    maxChainDepthSampled: maxC,
    eventAmplificationFactor: Math.round(amp * 1000) / 1000,
    emitsPerDispatchEstimate: amp
  }
}

async function runPackageSimulation(params: {
  list: ArmyList
  assignments: Assignment[]
  rules: EventRule[]
  manifest: Record<string, unknown> | null
  systemId: string
  turns: number
  checkpointEvery: number
  seed: string
}): Promise<{
  haltedReason: string
  metrics: Record<string, number>
  snapshotCheckpoints: number
  replayJson?: string
  integrityEnd: ReturnType<ReturnType<typeof createIsolatedRuntimeEngine>["getSnapshotIntegrity"]>
  diagnostics: ReturnType<ReturnType<typeof createIsolatedRuntimeEngine>["exportRuntimeDiagnosticsViz"]>
  containmentTrips: number
  fifoOk: boolean
  fifoDetail?: string
  debugTail: string[]
}> {
  const engine = createIsolatedRuntimeEngine()
  const runner = new SimulationRunner(engine)
  const timeProvider = new DeterministicTimeProvider(0)
  const result = await runner.run({
    systemId: params.systemId,
    list: params.list,
    assignments: params.assignments,
    rules: params.rules,
    strictValidation: false,
    packageManifests: params.manifest ? [params.manifest] : [],
    timeProvider,
    enableEventLedger: true,
    options: {
      maxTurns: params.turns,
      seed: params.seed,
      timeMode: "logical",
      entityIds: params.list.units.map((u) => u.id),
      checkpointEvery: params.checkpointEvery > 0 ? params.checkpointEvery : undefined,
      exportReplayOut: true
    }
  })
  const fifo = queueFifoSanity(engine.getQueueSnapshot())
  return {
    haltedReason: result.haltedReason,
    metrics: result.metrics as unknown as Record<string, number>,
    snapshotCheckpoints: result.snapshots?.length ?? 0,
    replayJson: result.replayJson,
    integrityEnd: engine.getSnapshotIntegrity(),
    diagnostics: engine.exportRuntimeDiagnosticsViz(),
    containmentTrips: containmentHits(engine.getDebugLog()),
    fifoOk: fifo.ok,
    fifoDetail: fifo.detail,
    debugTail: engine
      .getDebugLog()
      .slice(-8)
      .map((e) => `${e.kind}:${"text" in e && typeof e.text === "string" ? e.text : e.at}`)
  }
}

async function snapshotRoundTrip(params: {
  list: ArmyList
  assignments: Assignment[]
  rules: EventRule[]
  manifest: Record<string, unknown> | null
  systemId: string
  seed: string
}): Promise<{ ok: boolean; detail?: string; hashBefore: string; hashAfter: string }> {
  const t0 = new DeterministicTimeProvider(0)
  const engine = createIsolatedRuntimeEngine()
  const b = await engine.bootstrap({
    systemId: params.systemId,
    list: params.list,
    assignments: params.assignments,
    rules: params.rules,
    rngSeed: params.seed,
    timeMode: "logical",
    packageManifests: params.manifest ? [params.manifest] : [],
    timeProvider: t0,
    enableEventLedger: true
  })
  if (!b.ok) return { ok: false, detail: b.error, hashBefore: "", hashAfter: "" }
  engine.dispatch({ type: "simulation.tick", payload: { entityId: params.list.units[0]?.id ?? "x", probe: "snap" } }, params.assignments)
  engine.flushQueue(null)
  const snap = engine.exportRuntimeSnapshot({ assignments: params.assignments, simulationMeta: { probe: true } })
  const hashBefore = engine.getSnapshotIntegrity().fullStateHash
  const integSnap = snap.integrityHashes?.fullStateHash
  const engine2 = createIsolatedRuntimeEngine()
  const b2 = await engine2.bootstrap({
    systemId: params.systemId,
    list: params.list,
    assignments: params.assignments,
    rules: params.rules,
    rngSeed: params.seed,
    timeMode: "logical",
    packageManifests: params.manifest ? [params.manifest] : [],
    timeProvider: new DeterministicTimeProvider(0),
    enableEventLedger: true
  })
  if (!b2.ok) return { ok: false, detail: `re-bootstrap: ${b2.error}`, hashBefore, hashAfter: "" }
  engine2.importRuntimeSnapshot(SnapshotManager.parse(snap as unknown))
  const hashAfter = engine2.getSnapshotIntegrity().fullStateHash
  const match =
    hashBefore === hashAfter &&
    (integSnap === undefined || integSnap === hashBefore) &&
    JSON.stringify(snap.assignments) === JSON.stringify(params.assignments)
  return {
    ok: match,
    detail: match ? undefined : "fullStateHash mismatch after importRuntimeSnapshot",
    hashBefore,
    hashAfter
  }
}

async function main() {
  const cli = parseCli(process.argv.slice(2))
  const publicRoot = path.join(COMPANION_ROOT, "public")
  const registryPath = path.join(publicRoot, "packages", "package_registry.json")

  const failures: string[] = []
  const startedAt = new Date().toISOString()

  if (!fs.existsSync(registryPath)) {
    failures.push(`Missing registry: ${registryPath}`)
    console.error(JSON.stringify({ ok: false, failures }, null, 2))
    process.exit(1)
  }

  const discoveredIds = packageIdsFromRegistry(readJson(registryPath))
  const missingSkeleton = EXPECTED_SKELETON_IDS.filter((id) => !discoveredIds.includes(id))
  if (missingSkeleton.length) failures.push(`Missing skeleton package ids in registry: ${missingSkeleton.join(", ")}`)

  const manifestLoads: Record<string, boolean> = {}
  for (const id of EXPECTED_SKELETON_IDS) {
    manifestLoads[id] = fs.existsSync(manifestPathForPackage(publicRoot, id))
  }

  const phase1 = {
    registryPath: path.relative(REPO_ROOT, registryPath),
    discoveredPackageCount: discoveredIds.length,
    expectedSkeletonPresent: missingSkeleton.length === 0,
    missingSkeleton,
    manifestLoads,
    dynamicDiscoveryNote:
      "Runtime Lab uses buildPackageIndex() against packages/package_registry.json (no hardcoded package list in that service)."
  }

  let merged: { rules: EventRule[]; loadWarnings: string[]; ruleFilesLoaded: number }
  try {
    merged = loadMergedRulesFromRegistry(publicRoot, registryPath)
  } catch (e) {
    failures.push(e instanceof Error ? e.message : String(e))
    merged = { rules: [], loadWarnings: [], ruleFilesLoaded: 0 }
  }

  type PkgReport = Record<string, unknown>
  const perPackage: PkgReport[] = []
  const soakCandidates: {
    packageId: string
    list: ArmyList
    manifest: Record<string, unknown> | null
    systemId: string
  }[] = []

  for (const packageId of EXPECTED_SKELETON_IDS) {
    const adapterFile = path.join(publicRoot, "packages", packageId, "imports", "jsonRosterAdapter.json")
    const sampleFile = path.join(publicRoot, "packages", packageId, "sample_lists", "default.json")
    const row: PkgReport = { packageId, adapterFile: path.relative(REPO_ROOT, adapterFile), sampleFile: path.relative(REPO_ROOT, sampleFile) }

    if (!fs.existsSync(adapterFile) || !fs.existsSync(sampleFile)) {
      row.import = { ok: false, error: "missing adapter or sample_lists/default.json" }
      failures.push(`${packageId}: missing import files`)
      perPackage.push(row)
      continue
    }

    const adapterRaw = readJson<unknown>(adapterFile)
    if (!validateJsonRosterAdapter(adapterRaw)) {
      row.import = { ok: false, error: "validateJsonRosterAdapter failed" }
      failures.push(`${packageId}: invalid adapter`)
      perPackage.push(row)
      continue
    }
    const adapter = adapterRaw as JsonRosterAdapterV1
    const rawList = readJson<unknown>(sampleFile)
    const sessionA = ImportSessionManager.runJsonRoster({ raw: rawList, adapter })
    const sessionB = ImportSessionManager.runJsonRoster({ raw: rawList, adapter })
    let deterministicImport = false
    if (sessionA.ok && sessionB.ok) {
      const idsA = sessionA.graph.entities.map((e) => e.instanceId).join("\n")
      const idsB = sessionB.graph.entities.map((e) => e.instanceId).join("\n")
      deterministicImport = idsA === idsB
    }
    if (!sessionA.ok) {
      row.import = { ok: false, errors: sessionA.errors }
      failures.push(`${packageId}: import ${sessionA.errors.join("; ")}`)
      perPackage.push(row)
      continue
    }

    const session = sessionA
    const rg = EntityRelationshipGraph.fromImportGraph(session.graph)
    const listIds = new Set(session.list.units.map((u) => u.id))
    const orphans = rg.listOrphans(listIds)
    const entityHistogram: Record<string, number> = {}
    for (const u of session.list.units) {
      const k = u.entityType?.trim() || "unit"
      entityHistogram[k] = (entityHistogram[k] ?? 0) + 1
    }

    row.import = {
      ok: true,
      entityCount: session.graph.entities.length,
      edgeCount: rg.getEdgeCount(),
      orphanReferenceMarkers: orphans.length,
      orphanSample: orphans.slice(0, 12),
      deterministicDuplicateRun: deterministicImport,
      entityHistogram
    }

    if (cli.exportDir) {
      fs.mkdirSync(cli.exportDir, { recursive: true })
      fs.writeFileSync(path.join(cli.exportDir, `canonical-graph-${packageId}.json`), JSON.stringify(session.graph, null, 2), "utf8")
      fs.writeFileSync(path.join(cli.exportDir, `relationship-graph-${packageId}.json`), rg.toJson(), "utf8")
    }

    const manifest = loadManifestRecord(publicRoot, packageId)
    const systemId = typeof manifest?.systemId === "string" ? manifest.systemId : "skeleton_lab"
    const gameSystemId = systemId
    soakCandidates.push({ packageId, list: session.list, manifest, systemId })

    const mockAssignments = buildMockAssignments(session.list, gameSystemId, 3)
    const bundleJson = exportAssignmentBundleJson({
      assignments: mockAssignments,
      listId: session.list.id,
      factionId: session.list.factionId,
      gameSystemId
    })
    const parsed = parseAssignmentBundleJson(bundleJson)
    let nfc: Record<string, unknown> = { roundtripParseOk: parsed.ok }
    if (parsed.ok) {
      const preview = previewAssignmentBundleImport({
        bundle: parsed.bundle,
        currentAssignments: [],
        list: session.list,
        factionId: session.list.factionId,
        gameSystemId
      })
      const applied = applyAssignmentImportPreview({
        preview,
        strategy: "strict",
        currentAssignments: []
      })
      void previewAssignmentBundleImport({
        bundle: parsed.bundle,
        currentAssignments: applied.next,
        list: session.list,
        factionId: session.list.factionId,
        gameSystemId
      })
      const reassigned = mockAssignments.map((a, i) => ({ ...a, tagUid: `04E1F2A3B4C5D6E7F8${String(i + 10).padStart(2, "0")}` }))
      const bundleRe = exportAssignmentBundleJson({
        assignments: reassigned,
        listId: session.list.id,
        factionId: session.list.factionId,
        gameSystemId
      })
      const parsedRe = parseAssignmentBundleJson(bundleRe)
      let reassignmentStrictOk = false
      if (parsedRe.ok) {
        const pRe = previewAssignmentBundleImport({
          bundle: parsedRe.bundle,
          currentAssignments: applied.next,
          list: session.list,
          factionId: session.list.factionId,
          gameSystemId
        })
        const appRe = applyAssignmentImportPreview({ preview: pRe, strategy: "strict", currentAssignments: applied.next })
        reassignmentStrictOk = !appRe.error && appRe.applied === reassigned.length
      }
      nfc = {
        ...nfc,
        strictPreviewOk: preview.canApplyStrict,
        strictApplyOk: !applied.error,
        reassignmentStrictOk,
        duplicateBindingErrors: parsed.ok ? 0 : "n/a"
      }
    } else {
      failures.push(`${packageId}: assignment bundle parse failed`)
      nfc = { ...nfc, errors: parsed.ok ? [] : parsed.errors }
    }

    row.nfc = nfc

    const sim = await runPackageSimulation({
      list: session.list,
      assignments: mockAssignments,
      rules: merged.rules,
      manifest,
      systemId,
      turns: cli.turns,
      checkpointEvery: cli.checkpointEvery,
      seed: `val-${packageId}`
    })

    row.simulation = {
      haltedReason: sim.haltedReason,
      maxQueueDepthObserved: sim.metrics.maxQueueDepthObserved,
      maxChainDepthReached: sim.metrics.maxChainDepthReached,
      actionsExecuted: sim.metrics.actionsExecuted,
      eventsProcessed: sim.metrics.eventsProcessed,
      warningsGenerated: sim.metrics.warningsGenerated,
      snapshotCheckpoints: sim.snapshotCheckpoints,
      containmentTrips: sim.containmentTrips,
      fifoQueueSanity: sim.fifoOk,
      fifoDetail: sim.fifoDetail,
      integrityEnd: sim.integrityEnd
    }

    if (cli.exportDir) {
      fs.writeFileSync(
        path.join(cli.exportDir, `queue-analytics-${packageId}.json`),
        JSON.stringify(
          {
            metrics: sim.metrics,
            vizSummary: summarizeViz(sim.diagnostics, {
              eventsProcessed: sim.metrics.eventsProcessed ?? 0,
              followUpsEnqueued: sim.metrics.followUpsEnqueued ?? 0
            }),
            fifo: { ok: sim.fifoOk, detail: sim.fifoDetail }
          },
          null,
          2
        ),
        "utf8"
      )
      fs.writeFileSync(path.join(cli.exportDir, `queue-analytics-${packageId}.csv`), vizToAnalyticsCsv(sim.diagnostics), "utf8")
    }

    let replayDivergenceCount = 0
    let replayIntegrityOk = false
    if (sim.replayJson) {
      const replay = ReplayRecorder.importReplay(JSON.parse(sim.replayJson) as unknown)
      const diff = await runDifferentialReplay(replay, [
        { label: "run-a", build: () => createIsolatedRuntimeEngine(), params: { rules: merged.rules } },
        { label: "run-b", build: () => createIsolatedRuntimeEngine(), params: { rules: merged.rules } }
      ])
      replayIntegrityOk = diff.allMatch
      if (!diff.allMatch) {
        replayDivergenceCount = 1
        failures.push(`${packageId}: differential replay mismatch`)
      }
      const runner = new ReplayRunner()
      const once = await runner.replayFromJson(createIsolatedRuntimeEngine(), sim.replayJson, { rules: merged.rules })
      if (once.ok !== true) {
        replayDivergenceCount++
        failures.push(`${packageId}: replay runner ${once.ok === false ? `${once.field}: ${once.detail}` : ""}`)
      }
    }

    row.replay = { differentialReplayOk: replayIntegrityOk, replayDivergenceCount }

    const snapRt = await snapshotRoundTrip({
      list: session.list,
      assignments: mockAssignments,
      rules: merged.rules,
      manifest,
      systemId,
      seed: `snap-${packageId}`
    })
    row.snapshot = snapRt
    if (!snapRt.ok) failures.push(`${packageId}: snapshot round-trip ${snapRt.detail ?? ""}`)

    perPackage.push(row)
  }

  let crossPackageNfc: Record<string, unknown> = { skipped: true, reason: "need two successful imports" }
  if (soakCandidates.length >= 2) {
    const a = soakCandidates[0]!
    const b = soakCandidates[1]!
    const idsB = new Set(b.list.units.map((u) => u.id))
    const foreignUnit = a.list.units.find((u) => !idsB.has(u.id))
    const foreignId = foreignUnit?.id ?? "___synthetic_nonexistent_entity___"
    const ghostBundle = {
      schemaVersion: 1 as const,
      exportedAt: new Date().toISOString(),
      gameSystemId: b.systemId,
      factionId: b.list.factionId,
      listId: b.list.id,
      assignments: [
        {
          tagUid: "04EEEEEEEEEEEEEEEEEE01",
          entityId: foreignId,
          displayName: "foreign-entity-from-other-package-list"
        }
      ]
    }
    const parsedGhost = parseAssignmentBundleJson(JSON.stringify(ghostBundle))
    if (parsedGhost.ok) {
      const prev = previewAssignmentBundleImport({
        bundle: parsedGhost.bundle,
        currentAssignments: [],
        list: b.list,
        factionId: b.list.factionId,
        gameSystemId: b.systemId
      })
      crossPackageNfc = {
        skipped: false,
        fromPackageId: a.packageId,
        toPackageId: b.packageId,
        foreignEntityId: foreignId,
        rejectedRows: prev.rejected.length,
        canApplyStrict: prev.canApplyStrict
      }
      if (prev.canApplyStrict) {
        failures.push(`crossPackageNfc: expected strict rejection for foreign entity ${foreignId} on ${b.packageId}`)
      }
    } else {
      crossPackageNfc = { skipped: false, error: "ghost bundle parse failed", errors: parsedGhost.errors }
    }
  }

  let mockWorkbench: Record<string, unknown> = { skipped: cli.skipMockGen }
  if (!cli.skipMockGen) {
    const tmp = path.join(COMPANION_ROOT, "tmp", `mock-bench-${Date.now()}`)
    fs.mkdirSync(tmp, { recursive: true })
    const genStress = spawnSync(
      process.execPath,
      [
        path.join(REPO_ROOT, "tools", "mock-package-generator", "generate.mjs"),
        "--rules",
        "80",
        "--emitRate",
        "0.12",
        "--timers",
        "6",
        "--listEntities",
        "120",
        "--inventoryDepth",
        "2",
        "--relationshipDensity",
        "0.08",
        "--transportChains",
        "4",
        "--orphanChance",
        "0.001",
        "--circularChance",
        "0.001",
        "--seed",
        "bench",
        "--outDir",
        tmp
      ],
      { cwd: REPO_ROOT, encoding: "utf8" }
    )
    const genBad = spawnSync(
      process.execPath,
      [
        path.join(REPO_ROOT, "tools", "mock-package-generator", "generate.mjs"),
        "--rules",
        "20",
        "--malformedChance",
        "0.55",
        "--seed",
        "bad",
        "--outDir",
        path.join(tmp, "bad")
      ],
      { cwd: REPO_ROOT, encoding: "utf8" }
    )
    const stressOk = genStress.status === 0
    const badOk = genBad.status === 0
    let importStress: Record<string, unknown> = { skipped: true }
    let mockSim: Record<string, unknown> = { skipped: true }
    if (stressOk) {
      const adapterPath = path.join(tmp, "imports", "jsonRosterAdapter.json")
      const rosterPath = path.join(tmp, "sample_canonical_roster.json")
      if (fs.existsSync(adapterPath) && fs.existsSync(rosterPath)) {
        const aRaw = readJson<unknown>(adapterPath)
        const importOk = validateJsonRosterAdapter(aRaw)
        if (importOk) {
          const sess = ImportSessionManager.runJsonRoster({ raw: readJson(rosterPath), adapter: aRaw as JsonRosterAdapterV1 })
          importStress = { ok: sess.ok, entityCount: sess.ok ? sess.graph.entities.length : 0, errors: sess.ok ? [] : sess.errors }
          if (sess.ok) {
            const rulesPath = path.join(tmp, "rules.json")
            const manPath = path.join(tmp, "manifest.json")
            const rulesMock = readJson<EventRule[]>(rulesPath)
            const man = readJson<Record<string, unknown>>(manPath)
            const ms = await runPackageSimulation({
              list: sess.list,
              assignments: buildMockAssignments(sess.list, "mock_bench", 2),
              rules: rulesMock,
              manifest: man,
              systemId: "mock_bench",
              turns: 80,
              checkpointEvery: 20,
              seed: "mock-bench-sim"
            })
            mockSim = {
              skipped: false,
              haltedReason: ms.haltedReason,
              eventsProcessed: ms.metrics.eventsProcessed,
              maxQueueDepthObserved: ms.metrics.maxQueueDepthObserved,
              fifoQueueSanity: ms.fifoOk
            }
          }
        } else importStress = { ok: false, phase: "adapter_invalid" }
      }
    }
    mockWorkbench = {
      tmpDir: path.relative(REPO_ROOT, tmp),
      generateStressExitCode: genStress.status,
      generateMalformedExitCode: genBad.status,
      stressRulesWritten: stressOk,
      malformedRulesWritten: badOk,
      importStress,
      mockSim,
      note: "Malformed generator output may still emit parseable rules; engine strictValidation=false in this suite."
    }
  }

  let soak: Record<string, unknown> = { skipped: cli.skipSoak || cli.soakTurns <= 0 }
  if (!cli.skipSoak && cli.soakTurns > 0) {
    const seed = soakCandidates[0]
    if (!seed) {
      soak = { skipped: true, reason: "no successful imports" }
    } else {
      const asg = buildMockAssignments(seed.list, seed.systemId, 2)
      const long = await runPackageSimulation({
        list: seed.list,
        assignments: asg,
        rules: merged.rules,
        manifest: seed.manifest,
        systemId: seed.systemId,
        turns: cli.soakTurns,
        checkpointEvery: Math.max(500, Math.floor(cli.soakTurns / 50)),
        seed: "soak-long"
      })
      soak = {
        packageId: seed.packageId,
        turnsRequested: cli.soakTurns,
        haltedReason: long.haltedReason,
        eventsProcessed: long.metrics.eventsProcessed,
        actionsExecuted: long.metrics.actionsExecuted,
        maxQueueDepthObserved: long.metrics.maxQueueDepthObserved,
        maxChainDepthReached: long.metrics.maxChainDepthReached,
        warningsGenerated: long.metrics.warningsGenerated,
        containmentTrips: long.containmentTrips,
        fifoQueueSanity: long.fifoOk
      }
    }
  }

  const certification = {
    skeletonPackages: EXPECTED_SKELETON_IDS.length,
    perPackage: perPackage.map((p) => ({
      packageId: p.packageId,
      importOk: Boolean((p.import as { ok?: boolean })?.ok),
      graphOk: Boolean(
        (p.import as { ok?: boolean })?.ok && (p.import as { orphanReferenceMarkers?: number }).orphanReferenceMarkers === 0
      ),
      nfcOk: Boolean((p.nfc as { strictPreviewOk?: boolean })?.strictPreviewOk),
      simOk: typeof (p.simulation as { haltedReason?: string })?.haltedReason === "string",
      snapshotOk: Boolean((p.snapshot as { ok?: boolean })?.ok),
      replayOk: Boolean((p.replay as { differentialReplayOk?: boolean })?.differentialReplayOk)
    })),
    mockWorkbench: mockWorkbench as Record<string, unknown>
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    suiteStartedAt: startedAt,
    companionRoot: path.relative(REPO_ROOT, COMPANION_ROOT),
    cli: {
      turns: cli.turns,
      checkpointEvery: cli.checkpointEvery,
      soakTurns: cli.soakTurns,
      exportDir: cli.exportDir ? path.relative(REPO_ROOT, cli.exportDir) : null
    },
    phases: {
      packageDiscovery: phase1,
      ruleIndex: {
        ruleFilesLoaded: merged.ruleFilesLoaded,
        rulesParsed: merged.rules.length,
        loadWarningsCount: merged.loadWarnings.length,
        loadWarningsSample: merged.loadWarnings.slice(0, 40)
      },
      perPackageValidation: { packages: perPackage, crossPackageNfc },
      eventFlowUi: {
        automated: false,
        manualChecklist: [
          "RuntimeEventFlowView: tree + timeline modes show FIFO-ordered roots",
          "Emitted child events nest under correct root grouping",
          "Chain depth matches engine maxChainDepthReached for heavy packages"
        ]
      },
      queueAnalytics: {
        automatedExports: Boolean(cli.exportDir),
        exportNote: cli.exportDir ? `JSON+CSV written under ${cli.exportDir}` : "pass --export-dir for analytics JSON/CSV files",
        metricsDescription:
          "Per-package JSON includes metrics + vizSummary (amplification, max sampled queue/chain) derived from SimulationRunner diagnostics."
      },
      mockPackageWorkbench: mockWorkbench,
      certificationPipeline: certification,
      longSoak: soak,
      frontendUx: {
        automated: false,
        manualChecklist: [
          "Exercise boardgame_skeleton, cardgame_skeleton, legends_rpg_skeleton, dungeon_skeleton in Runtime Lab",
          "Confirm copy is entity/simulation oriented (no army-only assumptions in empty states)"
        ]
      }
    },
    mergedRuleLoadWarnings: merged.loadWarnings,
    failures,
    successCriteria: {
      allSkeletonsInRegistry: missingSkeleton.length === 0,
      allImportsOk: perPackage.every((p) => (p.import as { ok?: boolean })?.ok === true),
      replayDeterminism: perPackage.every((p) => (p.replay as { differentialReplayOk?: boolean })?.differentialReplayOk === true),
      snapshotDeterminism: perPackage.every((p) => (p.snapshot as { ok?: boolean })?.ok === true),
      crossPackageRejectsForeignAssignments:
        (crossPackageNfc as { skipped?: boolean }).skipped === true ||
        (crossPackageNfc as { canApplyStrict?: boolean }).canApplyStrict === false,
      mockImportCanonicalOk:
        cli.skipMockGen ||
        Boolean((mockWorkbench as { importStress?: { ok?: boolean } }).importStress?.ok),
      overallPass: failures.length === 0
    },
    performanceSummaries: {
      perPackageMaxQueue: Object.fromEntries(
        perPackage.map((p) => [String(p.packageId), (p.simulation as { maxQueueDepthObserved?: number })?.maxQueueDepthObserved ?? null])
      )
    }
  }

  fs.mkdirSync(path.dirname(path.resolve(cli.out)), { recursive: true })
  fs.writeFileSync(path.resolve(cli.out), JSON.stringify(report, null, 2), "utf8")
  const certOut = path.join(path.dirname(path.resolve(cli.out)), "certification-report.json")
  fs.writeFileSync(certOut, JSON.stringify({ schemaVersion: 1, generatedAt: report.generatedAt, certification, failures }, null, 2), "utf8")

  console.log(JSON.stringify({ ok: failures.length === 0, out: path.resolve(cli.out), certificationOut: certOut, failureCount: failures.length }, null, 2))
  process.exit(failures.length ? 1 : 0)
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
