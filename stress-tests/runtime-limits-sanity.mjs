/**
 * Static checks for stress-oriented runtime limits (no TS runtime import).
 * Run: node stress-tests/runtime-limits-sanity.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
const p = path.join(root, "nfc-companion", "src", "runtime", "runtimeConstants.ts")
const s = fs.readFileSync(p, "utf8")
const maxChain = /MAX_CHAIN_DEPTH:\s*(\d+)/.exec(s)
const maxSteps = /MAX_QUEUE_STEPS:\s*([\d_]+)/.exec(s)
if (!maxChain || Number(maxChain[1]) < 5) throw new Error("MAX_CHAIN_DEPTH parse fail")
if (!maxSteps) throw new Error("MAX_QUEUE_STEPS parse fail")
const steps = Number(maxSteps[1].replace(/_/g, ""))
if (steps < 1000) throw new Error("MAX_QUEUE_STEPS unexpectedly low")
console.log("runtime-limits-sanity: OK", { MAX_CHAIN_DEPTH: maxChain[1], MAX_QUEUE_STEPS: steps })
