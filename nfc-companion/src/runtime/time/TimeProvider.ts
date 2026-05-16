/** All runtime wall/virtual timestamps route through a TimeProvider (no scattered Date.now in engine core). */
export type TimeProvider = {
  nowMs(): number
  toIsoString(ms?: number): string
}

export function createWallTimeProvider(): TimeProvider {
  return {
    nowMs: () => Date.now(),
    toIsoString(ms) {
      return new Date(ms ?? Date.now()).toISOString()
    }
  }
}
