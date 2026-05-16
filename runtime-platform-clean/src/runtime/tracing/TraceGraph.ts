import type { TraceEdge } from "@/runtime/tracing/TraceEdge"
import type { TraceNode } from "@/runtime/tracing/TraceNode"

export type { TraceNode, TraceNodeKind } from "@/runtime/tracing/TraceNode"
export type { TraceEdge } from "@/runtime/tracing/TraceEdge"

/**
 * Append-only causal graph for one runtime session (package-agnostic).
 */
export class TraceGraph {
  private nodes: TraceNode[] = []
  private edges: TraceEdge[] = []
  private seq = 0

  clear() {
    this.nodes = []
    this.edges = []
    this.seq = 0
  }

  private nextId(): string {
    this.seq++
    return `trace-${this.seq}`
  }

  beginEvent(params: {
    parentId: string | null
    eventType: string
    chainDepth: number
    queueDepth: number
    payload?: Record<string, unknown>
  }): string {
    const id = this.nextId()
    this.nodes.push({
      id,
      parentId: params.parentId,
      kind: "event",
      label: params.eventType,
      chainDepth: params.chainDepth,
      queueDepth: params.queueDepth,
      startedAtMs: performance.now(),
      meta: params.payload ? { payload: params.payload } : undefined
    })
    if (params.parentId) this.edges.push({ from: params.parentId, to: id, label: "emit" })
    return id
  }

  closeEvent(id: string) {
    const n = this.nodes.find((x) => x.id === id)
    if (n) n.durationMs = Math.max(0, performance.now() - n.startedAtMs)
  }

  addRuleNode(parentId: string, ruleId: string, chainDepth: number, queueDepth: number, passed: boolean): string {
    const id = this.nextId()
    this.nodes.push({
      id,
      parentId,
      kind: "rule",
      label: ruleId,
      chainDepth,
      queueDepth,
      startedAtMs: performance.now(),
      meta: { passed }
    })
    this.edges.push({ from: parentId, to: id, label: "rule" })
    return id
  }

  addConditionNodes(parentId: string, details: string[], chainDepth: number, queueDepth: number) {
    for (const d of details) {
      const id = this.nextId()
      this.nodes.push({
        id,
        parentId,
        kind: "condition",
        label: d,
        chainDepth,
        queueDepth,
        startedAtMs: performance.now()
      })
      this.edges.push({ from: parentId, to: id, label: "cond" })
    }
  }

  addActionNode(parentId: string, actionLabel: string, chainDepth: number, queueDepth: number): string {
    const id = this.nextId()
    this.nodes.push({
      id,
      parentId,
      kind: "action",
      label: actionLabel,
      chainDepth,
      queueDepth,
      startedAtMs: performance.now()
    })
    this.edges.push({ from: parentId, to: id, label: "action" })
    return id
  }

  linkEmit(fromId: string, toEventNodeId: string) {
    this.edges.push({ from: fromId, to: toEventNodeId, label: "emit" })
  }

  toJSON() {
    return { schemaVersion: 1 as const, nodes: this.nodes, edges: this.edges }
  }

  /** Generic graph for external visualization (e.g. force-graph JSON). */
  toVizNodesLinks() {
    return {
      nodes: this.nodes.map((n) => ({ id: n.id, label: `${n.kind}:${n.label}`, group: n.kind })),
      links: this.edges.map((e) => ({ source: e.from, target: e.to, name: e.label ?? "" }))
    }
  }
}
