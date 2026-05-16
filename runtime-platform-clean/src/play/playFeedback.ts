/** Short tactile + visual feedback for tabletop scans (no modal spam). */
export function playScanPulse(): void {
  try {
    void navigator.vibrate?.(12)
  } catch {
    /* ignore */
  }
  flashScanGlow()
}

export function playLinkSuccess(): void {
  try {
    void navigator.vibrate?.([8, 40, 12])
  } catch {
    /* ignore */
  }
  flashScanGlow()
}

function flashScanGlow(): void {
  let el = document.getElementById("play-scan-glow")
  if (!el) {
    el = document.createElement("div")
    el.id = "play-scan-glow"
    el.setAttribute(
      "style",
      [
        "position:fixed",
        "inset:0",
        "z-index:2147483640",
        "pointer-events:none",
        "background:radial-gradient(circle at 50% 80%, rgba(79,209,197,0.35), transparent 55%)",
        "opacity:0",
        "transition:opacity 80ms ease-out"
      ].join(";")
    )
    document.body.appendChild(el)
  }
  const node = el as HTMLElement
  node.style.opacity = "0"
  void node.offsetWidth
  node.style.opacity = "1"
  window.setTimeout(() => {
    node.style.opacity = "0"
  }, 120)
}
