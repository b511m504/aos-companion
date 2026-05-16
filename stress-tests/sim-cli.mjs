/**
 * Minimal CLI argument surface for automation (full simulation runs in-browser or via tsx + fetch rules).
 * Usage: node stress-tests/sim-cli.mjs --seed myseed --steps 1000 --checkpointInterval 50 --replayOut out.json
 * When --replayOut is set, path is echoed for a host harness to write; this script only validates args.
 */
const argv = process.argv.slice(2)
const out = { seed: "default", steps: 1000, checkpointInterval: 0, replayOut: /** @type {string | null} */ (null) }
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === "--seed") out.seed = argv[++i] ?? out.seed
  else if (a === "--steps") out.steps = Math.max(1, parseInt(argv[++i] ?? "1000", 10) || 1000)
  else if (a === "--checkpointInterval") out.checkpointInterval = Math.max(0, parseInt(argv[++i] ?? "0", 10) || 0)
  else if (a === "--replayOut") out.replayOut = argv[++i] ?? "replay.json"
}
console.log(JSON.stringify({ ok: true, config: out, hint: "Full engine run: npm --prefix nfc-companion run sim -- --seed <s> --steps <n> --checkpointInterval <k> --replayOut <path> [--rules rules.json] [--manifest manifest.json]" }))
