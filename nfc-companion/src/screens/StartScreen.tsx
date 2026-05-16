import { useAppStore } from "@/store/useAppStore"

export function StartScreen() {
  const goSystems = useAppStore((s) => s.goSystems)
  const goSettings = useAppStore((s) => s.goSettings)
  const goRuntimeLab = useAppStore((s) => s.goRuntimeLab)
  const nativeNfcAvailable = useAppStore((s) => s.nativeNfcAvailable)
  const contentLoading = useAppStore((s) => s.contentLoading)

  const nfcLabel = nativeNfcAvailable ? "NFC ready on this device" : "NFC: practice mode (no reader)"

  return (
    <div className="landing">
      <div className="landing-inner">
        {/* TEMP QA entry — remove when Runtime Lab is the default operator path */}
        <div className="landing-dev-mode" role="region" aria-label="Developer test entry">
          <p className="landing-dev-mode-label">Dev mode</p>
          <button type="button" className="btn btn-primary landing-cta" disabled={contentLoading} onClick={() => goRuntimeLab()}>
            Open Runtime Lab
          </button>
        </div>

        <h1 className="landing-title">Package runtime</h1>
        <p className="landing-subtitle">
          <strong>Skeleton packages</strong> and package-driven systems are best explored in{" "}
          <strong>Runtime Lab</strong> (import, graph, simulation, replay). Use the legacy flow only when you need the
          classic faction → roster → NFC binding wizard.
        </p>

        <p className={`landing-nfc ${nativeNfcAvailable ? "landing-nfc-ok" : ""}`} role="status">
          {contentLoading ? "Preparing…" : nfcLabel}
        </p>

        <button
          type="button"
          className="btn btn-primary landing-cta"
          disabled={contentLoading}
          onClick={() => goRuntimeLab()}
        >
          Runtime Lab
        </button>
        <p className="landing-path-hint muted" style={{ margin: 0, fontSize: 14 }}>
          Recommended for <span className="mono">skeleton_*</span> packages and deterministic tooling.
        </p>

        <button
          type="button"
          className="btn landing-cta landing-legacy-cta"
          disabled={contentLoading}
          onClick={() => goSystems()}
        >
          Legacy: start session → NFC
        </button>

        <button type="button" className="btn btn-ghost landing-secondary" onClick={() => goSettings()}>
          Settings
        </button>
      </div>
    </div>
  )
}
