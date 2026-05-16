/**
 * Optional bounded replay compaction preserving deterministic reconstruction.
 */

export function compressReplayEvents(events) {
  const list = Array.isArray(events) ? events : []
  const out = []
  for (const ev of list) {
    const prev = out[out.length - 1]
    if (
      prev &&
      prev.type === ev?.type &&
      prev.uid === ev?.uid &&
      prev.runtimeEpoch === ev?.runtimeEpoch &&
      prev.actionSequence + 1 === ev?.actionSequence
    ) {
      prev._compressedCount = (prev._compressedCount || 1) + 1
      prev._compressedToSequence = ev.actionSequence
      prev.actionSequence = ev.actionSequence
      continue
    }
    out.push({ ...ev })
  }
  return out
}

export function expandReplayEvents(events) {
  const list = Array.isArray(events) ? events : []
  const out = []
  for (const ev of list) {
    const count = Number(ev?._compressedCount || 1)
    if (count <= 1) {
      out.push({ ...ev })
      continue
    }
    const startSeq = Number(ev.actionSequence) - (count - 1)
    for (let i = 0; i < count; i += 1) {
      out.push({
        ...ev,
        actionSequence: startSeq + i,
        _compressedCount: undefined,
        _compressedToSequence: undefined,
      })
    }
  }
  return out
}

