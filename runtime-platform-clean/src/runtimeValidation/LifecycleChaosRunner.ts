/**
 * Simulates lifecycle-ish signals available in the browser / Capacitor webview.
 * Does not replace real Activity rotation (use device / Robolectric for that).
 */
export class LifecycleChaosRunner {
  async fireVisibilityHidden(durationMs: number): Promise<void> {
    try {
      window.dispatchEvent(new Event("pagehide"))
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, Math.max(0, durationMs)))
    try {
      window.dispatchEvent(new Event("pageshow"))
    } catch {
      /* ignore */
    }
  }

  async fireVisibilityToggleBurst(count: number, gapMs: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      try {
        document.dispatchEvent(new Event("visibilitychange"))
      } catch {
        /* ignore */
      }
      if (gapMs > 0) await new Promise((r) => setTimeout(r, gapMs))
    }
  }

  /** Yields main thread without changing lifecycle (scheduling chaos). */
  async yieldFrames(n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    }
  }
}
