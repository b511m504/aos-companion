/**
 * Canonical import certification (Node + tsx). Validates normalization + graph before StateStore.
 *
 *   npx tsx scripts/import-cert-cli.ts --adapter ./tmp/mock-pkg/imports/jsonRosterAdapter.json --raw ./tmp/mock-pkg/sample_canonical_roster.json
 *   npx tsx scripts/import-cert-cli.ts --adapter ... --raw ... --out ./tmp/import-report.json
 */
import fs from "node:fs"
import path from "node:path"

import { ImportSessionManager } from "../src/content-import/ImportSessionManager"
import type { JsonRosterAdapterV1 } from "../src/content-import/ImportTypes"
import { validateJsonRosterAdapter } from "../src/content-import/validateImport"
import { EntityRelationshipGraph } from "../src/runtime/relationships/EntityRelationshipGraph"

type Opts = { adapter: string | null; raw: string | null; out: string | null }

function parseArgs(argv: string[]): Opts {
  const o: Opts = { adapter: null, raw: null, out: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--help" || a === "-h") {
      console.log(`import-cert-cli.ts
  --adapter <path>   jsonRosterAdapter.json
  --raw <path>       raw lists JSON (see mock-package-generator sample_canonical_roster.json)
  --out <path>       optional: write full integrity report JSON`)
      process.exit(0)
    } else if (a === "--adapter") o.adapter = argv[++i] ?? null
    else if (a === "--raw") o.raw = argv[++i] ?? null
    else if (a === "--out") o.out = argv[++i] ?? null
  }
  return o
}

function readJson<T>(filePath: string): T {
  const abs = path.resolve(filePath)
  const raw = fs.readFileSync(abs, "utf8")
  return JSON.parse(raw) as T
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (!opts.adapter || !opts.raw) {
    console.error("Requires --adapter and --raw")
    process.exit(2)
  }
  const adapterRaw = readJson<unknown>(opts.adapter)
  if (!validateJsonRosterAdapter(adapterRaw)) {
    console.error(JSON.stringify({ ok: false, phase: "adapter_schema", errors: ["validateJsonRosterAdapter failed"] }, null, 2))
    process.exit(1)
  }
  const adapter = adapterRaw as JsonRosterAdapterV1
  const raw = readJson<unknown>(opts.raw)
  const t0 = performance.now()
  const session = ImportSessionManager.runJsonRoster({ raw, adapter })
  const wallMs = performance.now() - t0

  if (!session.ok) {
    const report = {
      ok: false,
      packageId: session.packageId,
      adapterKind: session.adapterKind,
      errors: session.errors,
      wallMs
    }
    console.error(JSON.stringify(report, null, 2))
    process.exit(1)
  }

  const ids = new Set(session.list.units.map((u) => u.id))
  const rg = EntityRelationshipGraph.fromImportGraph(session.graph)
  const orphanEndpoints = rg.listOrphans(ids)
  const entityTypes = new Map<string, number>()
  for (const u of session.list.units) {
    const k = u.entityType?.trim() || "unit"
    entityTypes.set(k, (entityTypes.get(k) ?? 0) + 1)
  }

  const report = {
    ok: true,
    packageId: session.packageId,
    adapterKind: session.adapterKind,
    listId: session.list.id,
    wallMs,
    metrics: session.metrics,
    relationshipGraph: {
      edgeCount: rg.getEdgeCount(),
      orphanEndpointMarkers: orphanEndpoints.length,
      orphanEndpoints: orphanEndpoints.slice(0, 50)
    },
    bindingSurface: {
      unitCount: session.list.units.length,
      entityTypeHistogram: Object.fromEntries([...entityTypes.entries()].sort((a, b) => a[0].localeCompare(b[0])))
    },
    importIntegrity: {
      normalizationSucceeded: true,
      graphValidationPassed: true,
      orphanRelationshipEndpointsVsList: orphanEndpoints.length
    }
  }

  if (opts.out) {
    fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true })
    fs.writeFileSync(path.resolve(opts.out), JSON.stringify(report, null, 2), "utf8")
  }
  console.log(JSON.stringify(report, null, 2))
}

main()
