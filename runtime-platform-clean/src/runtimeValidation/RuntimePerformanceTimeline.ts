/**
 * High-resolution marks + optional long-task sampling (Chromium).
 */
export class RuntimePerformanceTimeline {
  private marks: { name: string; tPerf: number; tWall: number }[] = []
  private longTaskOff: (() => void) | null = null
  private readonly maxMarks = 500

  mark(name: string): void {
    this.marks.push({ name, tPerf: performance.now(), tWall: Date.now() })
    if (this.marks.length > this.maxMarks) this.marks.splice(0, this.marks.length - this.maxMarks)
  }

  snapshot(): { name: string; tPerf: number; tWall: number }[] {
    return [...this.marks]
  }

  clear(): void {
    this.marks = []
  }

  /** Best-effort long task observer; no-op where unsupported. */
  startLongTaskObserver(onLongTask: (durationMs: number) => void): () => void {
    this.stopLongTaskObserver()
    if (typeof PerformanceObserver === "undefined") return () => {}
    try {
      const obs = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.duration >= 50) onLongTask(e.duration)
        }
      })
      obs.observe({ entryTypes: ["longtask"] })
      this.longTaskOff = () => {
        try {
          obs.disconnect()
        } catch {
          /* ignore */
        }
        this.longTaskOff = null
      }
      return () => this.stopLongTaskObserver()
    } catch {
      return () => {}
    }
  }

  stopLongTaskObserver(): void {
    this.longTaskOff?.()
  }
}
