import { useAppStore } from "@/store/useAppStore"
import { useRuntimeSession } from "@/store/useRuntimeSession"

export function AssignmentDetailsPanel() {
  const list = useAppStore((s) => s.selectedList)
  const assignments = useAppStore((s) => s.assignments)
  const selectedEntityId = useAppStore((s) => s.selectedEntityId)
  const removeAssignmentForSelected = useAppStore((s) => s.removeAssignmentForSelected)
  const entityRows = useRuntimeSession((s) => s.entityRows)
  const translateLabel = useRuntimeSession((s) => s.translateLabel)

  if (!list) return null

  const unit = selectedEntityId ? list.units.find((u) => u.id === selectedEntityId) : undefined
  const assignment = selectedEntityId
    ? assignments.find((a) => a.entityId === selectedEntityId)
    : undefined
  const runtimeEntity = selectedEntityId ? entityRows.find((e) => e.id === selectedEntityId) : undefined

  return (
    <div className="panel">
      <h2 className="h2">Selected unit</h2>
      {!unit ? (
        <p className="muted">Choose a unit from the list to see or clear its tag.</p>
      ) : (
        <div className="stack">
          <div>
            <div className="muted" style={{ fontSize: 13 }}>
              Unit
            </div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{unit.name}</div>
          </div>

          <div>
            <div className="muted" style={{ fontSize: 13 }}>
              Linked tag
            </div>
            {assignment ? (
              <div className="mono tag-uid-wrap" style={{ fontSize: 15 }}>
                {assignment.tagUid}
              </div>
            ) : (
              <div className="muted">Not linked yet</div>
            )}
          </div>

          {runtimeEntity ? (
            <div>
              <div className="muted" style={{ fontSize: 13 }}>
                {translateLabel("health")}
              </div>
              <div style={{ fontWeight: 650, fontSize: 18 }}>{runtimeEntity.states.health}</div>
            </div>
          ) : null}

          <button
            type="button"
            className="btn btn-danger"
            disabled={!assignment}
            onClick={() => removeAssignmentForSelected()}
          >
            Unlink tag
          </button>
        </div>
      )}
    </div>
  )
}
