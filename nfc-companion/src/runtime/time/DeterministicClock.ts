import type { TimeProvider } from "@/runtime/time/TimeProvider"

/**
 * Fixed-step virtual clock for deterministic simulation / replay-friendly timestamps.
 * `toIsoString` maps virtual ms to epoch strings (monotonic with advance).
 */
export class DeterministicTimeProvider implements TimeProvider {
  private virtualMs: number

  constructor(initialMs = 0) {
    this.virtualMs = initialMs
  }

  nowMs(): number {
    return this.virtualMs
  }

  /** Advance virtual clock by a fixed delta (e.g. per dispatch or per dequeue). */
  advance(ms: number) {
    if (Number.isFinite(ms) && ms > 0) this.virtualMs += ms
  }

  toIsoString(ms?: number): string {
    return new Date(ms ?? this.virtualMs).toISOString()
  }

  getVirtualMs(): number {
    return this.virtualMs
  }

  setVirtualMs(ms: number) {
    this.virtualMs = ms
  }
}
