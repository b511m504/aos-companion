import { useMemo } from "react"
import type { RuntimeStressMetrics } from "@/models/runtimeTypes"

function metricsToCsv(m: RuntimeStressMetrics): string {
  const keys = Object.keys(m) as (keyof RuntimeStressMetrics)[]
  const header = keys.join(",")
  const row = keys.map((k) => String(m[k])).join(",")
  return `${header}\n${row}\n`
}

export function QueueAnalyticsPanel(props: { metrics: RuntimeStressMetrics }) {
  const amp = useMemo(() => {
    const processed = Math.max(1, props.metrics.eventsProcessed)
    const emits = props.metrics.followUpsEnqueued
    return (emits / processed).toFixed(3)
  }, [props.metrics])

  const hot = useMemo(() => {
    const rules = props.metrics.rulesPassedAllConditions
    const actions = props.metrics.actionsExecuted
    const c = Math.max(1, props.metrics.conditionEvaluations)
    return {
      rulesPerEvent: (rules / Math.max(1, props.metrics.eventsProcessed)).toFixed(2),
      actionsPerEvent: (actions / Math.max(1, props.metrics.eventsProcessed)).toFixed(2),
      condPerRule: (c / Math.max(1, rules)).toFixed(2)
    }
  }, [props.metrics])

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify({ metrics: props.metrics, derived: { amp, hot } }, null, 2)], {
      type: "application/json"
    })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `runtime-analytics-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const downloadCsv = () => {
    const blob = new Blob([metricsToCsv(props.metrics)], { type: "text/csv" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `runtime-metrics-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="panel panel-tight">
        <p className="mono" style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
          eventsProcessed={props.metrics.eventsProcessed} · actionsExecuted={props.metrics.actionsExecuted} ·
          followUpsEnqueued={props.metrics.followUpsEnqueued}
          <br />
          maxQueueDepth={props.metrics.maxQueueDepthObserved} · maxChainDepth={props.metrics.maxChainDepthReached} ·
          dedupeSkips={props.metrics.dedupeSkips}
          <br />
          avgQueueDepth=
          {(props.metrics.queueDepthSum / Math.max(1, props.metrics.queueDepthSamples)).toFixed(2)} · amplification≈{amp}
          <br />
          rules/eval heuristic: rules/event {hot.rulesPerEvent} · actions/event {hot.actionsPerEvent}
        </p>
      </div>
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <button type="button" className="btn" onClick={downloadJson}>
          Export analytics JSON
        </button>
        <button type="button" className="btn btn-ghost" onClick={downloadCsv}>
          Export metrics CSV
        </button>
      </div>
    </div>
  )
}
