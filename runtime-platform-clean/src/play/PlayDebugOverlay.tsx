import { isDevToolsUnlocked } from "@/play/devMode"
import { usePlaySessionStore } from "@/play/playSessionStore"
import { useAppStore } from "@/store/useAppStore"

function scansPerMinute(metrics: { scanCount: number; sessionStartedAt: number }): string {
  const mins = Math.max(0.5, (Date.now() - metrics.sessionStartedAt) / 60_000)
  return (metrics.scanCount / mins).toFixed(1)
}

export function PlayDebugOverlay() {
  if (!isDevToolsUnlocked()) return null
  const metrics = usePlaySessionStore((s) => s.metrics)
  const nfcState = useAppStore((s) => s.nfcScanState)
  const screen = useAppStore((s) => s.screen)
  if (screen !== "play_table" && screen !== "play_assign") return null

  return (
    <div className="play-debug-overlay" aria-hidden>
      <span>scans {metrics.scanCount}</span>
      <span>{scansPerMinute(metrics)}/min</span>
      <span>dup {metrics.duplicateScanCount}</span>
      <span>recv {metrics.recoveryCount}</span>
      <span>nfc {nfcState}</span>
    </div>
  )
}
