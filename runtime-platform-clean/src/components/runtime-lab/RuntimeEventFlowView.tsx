import { useMemo, useState } from "react"
import type { RuntimeDebugEntry } from "@/models/runtimeTypes"

function formatEntry(e: RuntimeDebugEntry): string {
  switch (e.kind) {
    case "event_in":
      return `→ ${e.event.type}`
    case "execution":
      return `${e.currentEventType} depth=${e.depth}`
    case "rule":
      return `rule ${e.ruleId}`
    case "action":
      return `action ${e.action.type}`
    default:
      return e.kind
  }
}

export function RuntimeEventFlowView(props: { entries: readonly RuntimeDebugEntry[] }) {
  const [mode, setMode] = useState<"timeline" | "tree">("timeline")
  const blocks = useMemo(() => {
    const out: { root: RuntimeDebugEntry; children: RuntimeDebugEntry[] }[] = []
    let cur: { root: RuntimeDebugEntry; children: RuntimeDebugEntry[] } | null = null
    for (const e of props.entries) {
      if (e.kind === "event_in") {
        if (cur) out.push(cur)
        cur = { root: e, children: [] }
      } else if (cur) {
        cur.children.push(e)
      }
    }
    if (cur) out.push(cur)
    return out
  }, [props.entries])

  const tail = props.entries.slice(-400)

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className={mode === "timeline" ? "btn btn-primary" : "btn"} onClick={() => setMode("timeline")}>
          Timeline
        </button>
        <button type="button" className={mode === "tree" ? "btn btn-primary" : "btn"} onClick={() => setMode("tree")}>
          Tree (by root dispatch)
        </button>
      </div>
      {mode === "timeline" ? (
        <pre className="mono" style={{ fontSize: 10, maxHeight: 420, overflow: "auto", margin: 0 }}>
          {tail.map((e, i) => `${i}\t${formatEntry(e)}\n`).join("")}
        </pre>
      ) : (
        <div className="stack" style={{ gap: 10, maxHeight: 480, overflow: "auto" }}>
          {blocks.slice(-80).map((b, i) => (
            <details key={i} className="panel panel-tight" open={i === blocks.length - 1}>
              <summary className="mono" style={{ fontSize: 11 }}>
                {b.root.kind === "event_in" ? b.root.event.type : "—"} · {b.children.length} steps
              </summary>
              <pre className="mono" style={{ fontSize: 10, margin: "8px 0 0", whiteSpace: "pre-wrap" }}>
                {b.children.slice(0, 200).map((c, j) => `${j}\t${formatEntry(c)}\n`).join("")}
                {b.children.length > 200 ? `\n… ${b.children.length - 200} more` : ""}
              </pre>
            </details>
          ))}
        </div>
      )}
    </div>
  )
}
