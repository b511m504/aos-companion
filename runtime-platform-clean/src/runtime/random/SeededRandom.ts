/**
 * Deterministic PRNG (mulberry32). No Math.random — all runtime randomness should use this.
 */
export type SeededRandomState = {
  /** Internal 32-bit state */
  s: number
}

function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0 || 1
}

export class SeededRandom {
  private s: number

  constructor(seed: string | number) {
    if (typeof seed === "number" && Number.isFinite(seed)) {
      this.s = (seed >>> 0) || 1
    } else {
      this.s = hashSeed(String(seed))
    }
  }

  static fromState(state: SeededRandomState): SeededRandom {
    const r = new SeededRandom(1)
    r.s = (state.s >>> 0) || 1
    return r
  }

  clone(): SeededRandom {
    return SeededRandom.fromState(this.getState())
  }

  getState(): SeededRandomState {
    return { s: this.s >>> 0 }
  }

  setState(state: SeededRandomState): void {
    this.s = (state.s >>> 0) || 1
  }

  /** [0, 1) */
  nextFloat(): number {
    let t = (this.s += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Inclusive min, inclusive max (integers). */
  nextInt(min: number, max: number): number {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
      throw new Error("SeededRandom.nextInt: invalid range")
    }
    const lo = Math.ceil(min)
    const hi = Math.floor(max)
    if (hi <= lo) return lo
    return lo + Math.floor(this.nextFloat() * (hi - lo + 1))
  }

  pick<T>(arr: readonly T[]): T {
    if (!arr.length) throw new Error("SeededRandom.pick: empty array")
    return arr[this.nextInt(0, arr.length - 1)]!
  }

  /**
   * Weights must be non-negative; zero-weight items are never chosen.
   * If all weights zero, throws.
   */
  weightedPick<T>(items: readonly T[], weights: readonly number[]): T {
    if (items.length !== weights.length || !items.length) {
      throw new Error("SeededRandom.weightedPick: items and weights same non-zero length required")
    }
    let sum = 0
    for (const w of weights) {
      if (!Number.isFinite(w) || w < 0) throw new Error("SeededRandom.weightedPick: invalid weight")
      sum += w
    }
    if (sum <= 0) throw new Error("SeededRandom.weightedPick: total weight must be positive")
    let r = this.nextFloat() * sum
    for (let i = 0; i < items.length; i++) {
      r -= weights[i]!
      if (r <= 0) return items[i]!
    }
    return items[items.length - 1]!
  }

  /** In-place Fisher–Yates shuffle (returns same array reference). */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i)
      ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
    }
    return arr
  }
}
