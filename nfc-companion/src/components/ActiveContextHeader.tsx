import { useAppStore } from "@/store/useAppStore"

export function ActiveContextHeader() {
  const system = useAppStore((s) => s.selectedSystem)
  const faction = useAppStore((s) => s.selectedFaction)
  const list = useAppStore((s) => s.selectedList)

  if (!system || !faction || !list) return null

  return (
    <header className="context-header-sticky panel panel-tight">
      <p className="eyebrow">This session</p>
      <div className="row-between context-header-grid">
        <div>
          <div className="muted" style={{ fontSize: 13 }}>
            Game
          </div>
          <div style={{ fontWeight: 650 }}>{system.name}</div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 13 }}>
            Faction
          </div>
          <div style={{ fontWeight: 650 }}>{faction.name}</div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 13 }}>
            Army
          </div>
          <div style={{ fontWeight: 650 }}>{list.name}</div>
        </div>
      </div>
    </header>
  )
}
