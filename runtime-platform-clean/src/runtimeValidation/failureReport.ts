import type { InvariantViolation } from "@/runtime/invariants/RuntimeInvariants"
import type { ForensicReportV1, HarnessJournalEntry, RuntimeHealthSnapshot } from "@/runtimeValidation/types"

export function buildForensicReport(params: {
  screen: string
  invariantFailures: InvariantViolation[]
  journal: HarnessJournalEntry[]
  healthTail: RuntimeHealthSnapshot[]
  perfMarks: { name: string; tPerf: number; tWall: number }[]
}): ForensicReportV1 {
  return {
    schema: "runtime-validation-forensic/v1",
    createdAt: new Date().toISOString(),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    screen: params.screen,
    invariantFailures: params.invariantFailures,
    journal: params.journal,
    healthTail: params.healthTail,
    perfMarks: params.perfMarks.map((m) => ({ name: m.name, tPerf: m.tPerf }))
  }
}

export function downloadRuntimeForensicReport(report: ForensicReportV1): void {
  const safeIso = report.createdAt.replaceAll(":", "-")
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `runtime-validation-report-${safeIso}.json`
  a.click()
  URL.revokeObjectURL(url)
}
