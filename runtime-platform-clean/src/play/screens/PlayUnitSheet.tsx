import type { MouseEvent } from "react"
import { useAppStore } from "@/store/useAppStore"
import { usePlaySessionStore } from "@/play/playSessionStore"
import { shortTagLabel } from "@/utils/uid"

const D = "div"

const EFFECTS = ["Cover", "Suppressed", "Engaged"] as const

export function PlayUnitSheet() {
  const assignments = useAppStore((s) => s.assignments)
  const selectedUnitId = usePlaySessionStore((s) => s.selectedUnitId)
  const units = usePlaySessionStore((s) => s.units)
  const closeSheet = usePlaySessionStore((s) => s.closeSheet)
  const applyDamage = usePlaySessionStore((s) => s.applyDamage)
  const applyHeal = usePlaySessionStore((s) => s.applyHeal)
  const toggleActivated = usePlaySessionStore((s) => s.toggleActivated)
  const toggleEffect = usePlaySessionStore((s) => s.toggleEffect)

  const unit = selectedUnitId ? units[selectedUnitId] : null
  const tag = selectedUnitId ? assignments.find((a) => a.entityId === selectedUnitId) : null

  if (!unit) return null

  return (
    <D className="play-sheet-backdrop" onClick={() => closeSheet()} role="presentation">
      <D
        className="play-sheet"
        onClick={(e: MouseEvent) => e.stopPropagation()}
        role="dialog"
        aria-label={unit.displayName}
      >
        <D className="row-between">
          <h2 className="h2" style={{ margin: 0 }}>
            {unit.displayName}
          </h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => closeSheet()}>
            Close
          </button>
        </D>
        {tag ? <p className="muted">Token {shortTagLabel(tag.tagUid)}</p> : null}

        <D className="play-wound-bar">
          <D
            className="play-wound-fill"
            style={{ width: `${Math.min(100, (unit.wounds / unit.maxWounds) * 100)}%` }}
          />
        </D>
        <p className="play-wound-label">
          {unit.wounds} / {unit.maxWounds} wounds · {unit.statusLabel}
        </p>

        <D className="play-action-row">
          <button type="button" className="btn btn-primary" onClick={() => applyDamage(1)}>
            +1 dmg
          </button>
          <button type="button" className="btn" onClick={() => applyDamage(3)}>
            +3 dmg
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => applyHeal(1)}>
            Heal 1
          </button>
        </D>

        <button type="button" className="btn play-activate-btn" onClick={() => toggleActivated()}>
          {unit.activated ? "Mark ready" : "Mark activated"}
        </button>

        <D className="play-effects">
          <span className="eyebrow">Effects</span>
          <D className="play-effect-chips">
            {EFFECTS.map((ef) => (
              <button
                key={ef}
                type="button"
                className={`play-chip ${unit.effects.includes(ef) ? "on" : ""}`}
                onClick={() => toggleEffect(ef)}
              >
                {ef}
              </button>
            ))}
          </D>
        </D>
      </D>
    </D>
  )
}
