import { RuntimeHealthMonitor } from "@/runtimeValidation/RuntimeHealthMonitor"
import { RuntimePerformanceTimeline } from "@/runtimeValidation/RuntimePerformanceTimeline"
import { RuntimeReplayRecorder } from "@/runtimeValidation/RuntimeReplayRecorder"
import { ValidationScenarioRunner } from "@/runtimeValidation/ValidationScenarioRunner"

/**
 * Facade for continuous validation: journal + perf + optional health sampling.
 * Does not alter NFC transport; scenarios use the same synthetic / window pipeline as the harness.
 */
export class RuntimeValidationEngine {
  readonly journal = new RuntimeReplayRecorder()
  readonly perf = new RuntimePerformanceTimeline()
  readonly scenarios = new ValidationScenarioRunner(this.journal)

  private health: RuntimeHealthMonitor | null = null
  private longTaskStop: (() => void) | null = null

  enableContinuousMode(): void {
    this.disableContinuousMode()
    this.health = new RuntimeHealthMonitor(2000, {
      onSample: () => {
        this.perf.mark("health_tick")
      }
    })
    this.health.start()
    this.longTaskStop = this.perf.startLongTaskObserver((durationMs) => {
      this.journal.record("perf.mark", "longtask", { durationMs })
    })
    this.journal.record("self_heal", "continuous_mode_enabled", {})
  }

  disableContinuousMode(): void {
    this.health?.stop()
    this.health = null
    this.longTaskStop?.()
    this.longTaskStop = null
    this.journal.record("self_heal", "continuous_mode_disabled", {})
  }

  isContinuousMode(): boolean {
    return this.health !== null
  }

  getHealthTail() {
    return this.health?.getTail() ?? []
  }
}

let singleton: RuntimeValidationEngine | null = null

export function getRuntimeValidationEngine(): RuntimeValidationEngine {
  if (!singleton) singleton = new RuntimeValidationEngine()
  return singleton
}
