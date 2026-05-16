/**
 * Stress-test NFC assignment bundle export → parse → preview (no hardware).
 *
 *   npx tsx scripts/nfc-binding-stress.ts --entities 5000 --roundtrips 3
 */
import type { ArmyList, Assignment } from "../src/models/types"
import { exportAssignmentBundleJson, parseAssignmentBundleJson, previewAssignmentBundleImport } from "../src/services/AssignmentBundleService"

function parseArgs(argv: string[]) {
  let entities = 2000
  let roundtrips = 2
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--help" || a === "-h") {
      console.log(`nfc-binding-stress.ts
  --entities <n>     units in synthetic list (default 2000)
  --roundtrips <n>   export/parse/preview cycles (default 2)`)
      process.exit(0)
    } else if (a === "--entities") entities = Math.max(1, parseInt(argv[++i] ?? "2000", 10) || 2000)
    else if (a === "--roundtrips") roundtrips = Math.max(1, parseInt(argv[++i] ?? "2", 10) || 2)
  }
  return { entities, roundtrips }
}

/** Deterministic 7-byte colon UID for stress (passes isValidUid). */
function stressUid(i: number): string {
  const b0 = (i >>> 24) & 0xff
  const b1 = (i >>> 16) & 0xff
  const b2 = (i >>> 8) & 0xff
  const b3 = i & 0xff
  return ["04", "00", hex(b0), hex(b1), hex(b2), hex(b3), "0A"].join(":")
}

function hex(n: number): string {
  return n.toString(16).toUpperCase().padStart(2, "0")
}

function buildList(n: number): ArmyList {
  const units = []
  for (let i = 0; i < n; i++) {
    const et = i % 5 === 0 ? "room" : i % 7 === 0 ? "quest_item" : "unit"
    units.push({
      id: `stress_e_${i}`,
      name: `Entity ${i}`,
      tags: ["stress"],
      entityType: et,
      packageId: "stress_pkg",
      templateId: `tpl_${et}`
    })
  }
  return {
    id: "stress-list",
    name: "Stress list",
    factionId: "stress_f",
    description: "synthetic",
    units
  }
}

function buildAssignments(list: ArmyList): Assignment[] {
  const now = new Date().toISOString()
  const out: Assignment[] = []
  let i = 0
  for (const u of list.units) {
    out.push({
      tagUid: stressUid(i),
      entityId: u.id,
      entityType: u.entityType ?? "unit",
      displayName: u.name,
      factionId: list.factionId,
      gameSystemId: "stress_sys",
      assignedAt: now,
      packageId: u.packageId,
      templateId: u.templateId
    })
    i++
  }
  return out
}

function main() {
  const { entities, roundtrips } = parseArgs(process.argv.slice(2))
  const list = buildList(entities)
  const assignments = buildAssignments(list)
  const t0 = performance.now()
  let lastPreview = 0
  for (let r = 0; r < roundtrips; r++) {
    const json = exportAssignmentBundleJson({
      assignments,
      listId: list.id,
      factionId: list.factionId,
      gameSystemId: "stress_sys"
    })
    const parsed = parseAssignmentBundleJson(json)
    if (!parsed.ok) {
      console.error(JSON.stringify({ ok: false, phase: "parse", round: r, errors: parsed.errors }, null, 2))
      process.exit(1)
    }
    const preview = previewAssignmentBundleImport({
      bundle: parsed.bundle,
      currentAssignments: [],
      list,
      factionId: list.factionId,
      gameSystemId: "stress_sys"
    })
    lastPreview = preview.applicable.length
    if (!preview.canApplyStrict) {
      console.error(
        JSON.stringify(
          {
            ok: false,
            phase: "preview",
            round: r,
            rejected: preview.rejected.slice(0, 20)
          },
          null,
          2
        )
      )
      process.exit(1)
    }
  }
  const wallMs = performance.now() - t0
  console.log(
    JSON.stringify(
      {
        ok: true,
        entities,
        assignments: assignments.length,
        roundtrips,
        lastApplicableCount: lastPreview,
        wallMs
      },
      null,
      2
    )
  )
}

main()
