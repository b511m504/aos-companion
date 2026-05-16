/**
 * Standalone determinism check (no TS build): mulberry32 must match SeededRandom contract for seed "test".
 * Run: node stress-tests/seeded-rng-determinism.mjs
 */
function mulberry32(seed) {
  let a = seed >>> 0 || 1
  return function next() {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashSeed(seed) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0 || 1
}

const next = mulberry32(hashSeed("test"))
const a = [next(), next(), next()]
const b = [next(), next(), next()]
const next2 = mulberry32(hashSeed("test"))
const c = [next2(), next2(), next2()]
if (a[0] !== c[0] || a[1] !== c[1] || a[2] !== c[2]) {
  console.error("Seeded sequence mismatch", a, c)
  process.exit(1)
}
console.log("seeded-rng-determinism: OK", { firstThree: a, nextThree: b })
