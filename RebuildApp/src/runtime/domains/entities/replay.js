export function entityReplayExpectation(result) {
  return {
    handled: Boolean(result?.handled),
    outcome: String(result?.outcome || ''),
    reason: String(result?.reason || ''),
  }
}