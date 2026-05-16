export function GenericPrimitivesPanel() {
  return (
    <div className="stack" style={{ gap: 14 }}>
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
        Generic UI primitives for future campaign-style packages — no rules, no system-specific copy. Wire these to runtime selectors and
        canonical state when you add a serious RPG module.
      </p>
      <div className="panel panel-tight">
        <p className="eyebrow" style={{ margin: "0 0 6px" }}>
          Initiative / turn order
        </p>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {["A", "B", "C"].map((id, i) => (
            <span key={id} className="mono" style={{ padding: "4px 8px", border: "1px solid #4446", borderRadius: 6, opacity: i === 0 ? 1 : 0.6 }}>
              {id}
            </span>
          ))}
        </div>
      </div>
      <div className="panel panel-tight">
        <p className="eyebrow" style={{ margin: "0 0 6px" }}>
          Inventory strip (canonical keys)
        </p>
        <p className="mono muted" style={{ fontSize: 11, margin: 0 }}>
          inventory · equipment · containers · currency slots
        </p>
      </div>
      <div className="panel panel-tight">
        <p className="eyebrow" style={{ margin: "0 0 6px" }}>
          Map / rooms
        </p>
        <p className="mono muted" style={{ fontSize: 11, margin: 0 }}>
          room graph · encounter markers · hazards (relationship-driven)
        </p>
      </div>
      <div className="panel panel-tight">
        <p className="eyebrow" style={{ margin: "0 0 6px" }}>
          Status / quests / NPCs
        </p>
        <p className="mono muted" style={{ fontSize: 11, margin: 0 }}>
          statuses[] · quest hooks · NPC roster rows (entity ids only)
        </p>
      </div>
    </div>
  )
}
