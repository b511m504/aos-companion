import type { InvariantViolation } from "@/runtime/invariants/RuntimeInvariants"

export type HarnessEventKind =
  | "nfc.synthetic"
  | "nfc.window"
  | "lifecycle.chaos"
  | "runtime.dispatch"
  | "invariant.fail"
  | "self_heal"
  | "scenario.start"
  | "scenario.end"
  | "perf.mark"

export type HarnessJournalEntry = {
  id: string
  tWall: number
  tPerf: number
  kind: HarnessEventKind
  label: string
  detail?: Record<string, unknown>
}

export type ScenarioRunStatus = "idle" | "running" | "passed" | "failed"

export type ScenarioResult = {
  id: string
  status: ScenarioRunStatus
  durationMs: number
  invariantFailures: InvariantViolation[]
  journalTail: HarnessJournalEntry[]
  error?: string
}

export type RuntimeHealthSnapshot = {
  t: number
  nfcSessionActive: boolean
  nfcScanState: string
  nfcHandlerApprox: number
  runtimeEnabled: boolean
  runtimePaused: boolean
  queueDepth: number
  entityCount: number
  hidden: boolean
}

export type ForensicReportV1 = {
  schema: "runtime-validation-forensic/v1"
  createdAt: string
  userAgent: string
  screen: string
  invariantFailures: InvariantViolation[]
  journal: HarnessJournalEntry[]
  healthTail: RuntimeHealthSnapshot[]
  perfMarks: { name: string; tPerf: number }[]
}
