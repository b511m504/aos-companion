import { useState } from "react"

export function MockPackageWorkbench() {
  const [rules, setRules] = useState("200")
  const [listEntities, setListEntities] = useState("0")
  const [rel, setRel] = useState("0.02")
  const [orphan, setOrphan] = useState("0")
  const [circular, setCircular] = useState("0")
  const [inv, setInv] = useState("0")
  const [transport, setTransport] = useState("0")

  const cmd = () => {
    const parts = [
      "node tools/mock-package-generator/generate.mjs",
      `--rules ${rules}`,
      `--listEntities ${listEntities}`,
      `--relationshipDensity ${rel}`,
      `--orphanChance ${orphan}`,
      `--circularChance ${circular}`,
      `--inventoryDepth ${inv}`,
      `--transportChains ${transport}`,
      `--outDir ./tmp/mock-pkg-workbench`
    ]
    return parts.join(" ")
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd())
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
        Generates mock rules + optional stress roster at repo root. After generation, sync into <span className="mono">public/packages</span>{" "}
        manually or extend your pipeline.
      </p>
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <label className="muted" style={{ fontSize: 12 }}>
          rules
          <input className="entity-search" value={rules} onChange={(e) => setRules(e.target.value)} style={{ marginLeft: 6, width: 72 }} />
        </label>
        <label className="muted" style={{ fontSize: 12 }}>
          listEntities
          <input
            className="entity-search"
            value={listEntities}
            onChange={(e) => setListEntities(e.target.value)}
            style={{ marginLeft: 6, width: 72 }}
          />
        </label>
        <label className="muted" style={{ fontSize: 12 }}>
          relationshipDensity
          <input className="entity-search" value={rel} onChange={(e) => setRel(e.target.value)} style={{ marginLeft: 6, width: 56 }} />
        </label>
        <label className="muted" style={{ fontSize: 12 }}>
          orphanChance
          <input className="entity-search" value={orphan} onChange={(e) => setOrphan(e.target.value)} style={{ marginLeft: 6, width: 56 }} />
        </label>
        <label className="muted" style={{ fontSize: 12 }}>
          circularChance
          <input
            className="entity-search"
            value={circular}
            onChange={(e) => setCircular(e.target.value)}
            style={{ marginLeft: 6, width: 56 }}
          />
        </label>
        <label className="muted" style={{ fontSize: 12 }}>
          inventoryDepth
          <input className="entity-search" value={inv} onChange={(e) => setInv(e.target.value)} style={{ marginLeft: 6, width: 56 }} />
        </label>
        <label className="muted" style={{ fontSize: 12 }}>
          transportChains
          <input
            className="entity-search"
            value={transport}
            onChange={(e) => setTransport(e.target.value)}
            style={{ marginLeft: 6, width: 56 }}
          />
        </label>
      </div>
      <pre className="mono panel panel-tight" style={{ fontSize: 11, whiteSpace: "pre-wrap", margin: 0 }}>
        {cmd()}
      </pre>
      <button type="button" className="btn" onClick={() => void copy()}>
        Copy command
      </button>
    </div>
  )
}
