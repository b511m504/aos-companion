import { useAppStore } from "@/store/useAppStore"

export function ConflictDialog() {
  const conflict = useAppStore((s) => s.conflict)
  const cancelConflict = useAppStore((s) => s.cancelConflict)
  const resolveConflictReassign = useAppStore((s) => s.resolveConflictReassign)
  const resolveConflictViewOwner = useAppStore((s) => s.resolveConflictViewOwner)

  if (!conflict) return null

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Tag clash">
      <div className="modal stack">
        <div>
          <p className="eyebrow">Tag clash</p>
          <div className="h2" style={{ margin: 0 }}>
            This tag is already in use
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            That physical tag is still linked to another unit. Open the owner, or move the link to the unit you have
            selected.
          </p>
        </div>

        <div className="panel panel-tight">
          <div className="muted" style={{ fontSize: 13 }}>
            Scanned tag
          </div>
          <div className="mono tag-uid-wrap" style={{ fontSize: 15, fontWeight: 700 }}>
            {conflict.tagUid}
          </div>
          <div className="divider" />
          <div className="muted" style={{ fontSize: 13 }}>
            Linked to
          </div>
          <div style={{ fontWeight: 700 }}>{conflict.existing.displayName}</div>
        </div>

        <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={() => cancelConflict()}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={() => resolveConflictViewOwner()}>
            Show that unit
          </button>
          <button type="button" className="btn btn-primary" onClick={() => resolveConflictReassign()}>
            Move link here
          </button>
        </div>
      </div>
    </div>
  )
}
