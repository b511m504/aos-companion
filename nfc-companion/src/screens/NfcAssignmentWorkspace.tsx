import { useAppStore } from "@/store/useAppStore"
import { useRuntimeSession } from "@/store/useRuntimeSession"
import { ActiveContextHeader } from "@/components/ActiveContextHeader"
import { EntityListPanel } from "@/components/EntityListPanel"
import { NfcScanPanel } from "@/components/NfcScanPanel"
import { AssignmentDetailsPanel } from "@/components/AssignmentDetailsPanel"
import { ConflictDialog } from "@/components/ConflictDialog"

export function NfcAssignmentWorkspace() {
  const goList = useAppStore((s) => s.goList)
  const goValidate = useAppStore((s) => s.goValidate)
  const selectedList = useAppStore((s) => s.selectedList)
  const sessionWarning = useAppStore((s) => s.sessionWarning)
  const clearSessionWarning = useAppStore((s) => s.clearSessionWarning)
  const lastRuntimeToast = useRuntimeSession((s) => s.lastToast)
  const clearRuntimeToast = useRuntimeSession((s) => s.clearRuntimeToast)

  if (!selectedList) {
    return (
      <div className="stack">
        <p className="muted">No army selected.</p>
        <button type="button" className="btn" onClick={() => goList()}>
          Choose an army
        </button>
      </div>
    )
  }

  return (
    <div className="stack wizard-screen">
      <div className="row-between wizard-header">
        <div>
          <p className="eyebrow">Step 4 of 4</p>
          <h1 className="h1">Link your tags</h1>
          <p className="muted wizard-lead">
            Tap a unit, then hold a tag to the reader. Repeat for each model or squad.
          </p>
        </div>
        <div className="row" style={{ flexWrap: "wrap", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={() => goValidate()}>
            Check tags on table
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => goList()}>
            Change army
          </button>
        </div>
      </div>

      {sessionWarning ? (
        <div className="banner-error row-between">
          <span>{sessionWarning}</span>
          <button type="button" className="btn btn-ghost" onClick={() => clearSessionWarning()}>
            Dismiss
          </button>
        </div>
      ) : null}

      {lastRuntimeToast ? (
        <div className="validate-banner validate-banner-ok row-between">
          <span>{lastRuntimeToast}</span>
          <button type="button" className="btn btn-ghost" onClick={() => clearRuntimeToast()}>
            Dismiss
          </button>
        </div>
      ) : null}

      <ActiveContextHeader />

      <div className="workspace">
        <EntityListPanel />
        <NfcScanPanel />
      </div>

      <AssignmentDetailsPanel />

      <ConflictDialog />
    </div>
  )
}
