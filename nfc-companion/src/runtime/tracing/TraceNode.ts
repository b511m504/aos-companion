export type TraceNodeKind = "event" | "rule" | "action" | "condition" | "emit"

export type TraceNode = {
  id: string
  parentId: string | null
  kind: TraceNodeKind
  label: string
  chainDepth: number
  queueDepth: number
  startedAtMs: number
  durationMs?: number
  meta?: Record<string, unknown>
}
