/**
 * Generic JSON diagnostics for tooling (no UI). Built from engine ring buffers.
 */
export type RuntimeQueueVizV1 = {
  schemaVersion: 1
  queueOccupancyHistory: number[]
  chainDepthSampleHistory: number[]
  dispatchDurationMsHistory: number[]
  /** Synthetic flame rows: depth + duration per completed event step */
  dispatchFlameRows: { depth: number; durationMs: number }[]
}

export function emptyRuntimeQueueViz(): RuntimeQueueVizV1 {
  return {
    schemaVersion: 1,
    queueOccupancyHistory: [],
    chainDepthSampleHistory: [],
    dispatchDurationMsHistory: [],
    dispatchFlameRows: []
  }
}
