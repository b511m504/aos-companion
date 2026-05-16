import type { Assignment } from "@/models/types"
import type { ArmyList } from "@/models/types"
import { useRuntimeSession } from "@/store/useRuntimeSession"

export async function bootstrapRuntimeFromAppStore(): Promise<void> {
  const { useAppStore } = await import("@/store/useAppStore")
  const s = useAppStore.getState()
  if (!s.selectedList || !s.selectedSystem) return
  await useRuntimeSession.getState().bootstrapRuntimeIfNeeded({
    systemId: s.selectedSystem.id,
    list: s.selectedList,
    assignments: s.assignments
  })
}

/** After a successful NFC link — feeds canonical `nfc.scan` into the event runtime. */
export async function emitRuntimeAfterNfcLink(params: {
  systemId: string
  list: ArmyList
  assignments: Assignment[]
  entityId: string
  tagUid: string
  listId: string
}): Promise<void> {
  const rs = useRuntimeSession.getState()
  await rs.bootstrapRuntimeIfNeeded({
    systemId: params.systemId,
    list: params.list,
    assignments: params.assignments
  })
  const { useAppStore } = await import("@/store/useAppStore")
  const s = useAppStore.getState()
  const override = s.runtimeEffectTargetEntityId?.trim()
  const effectTargetEntityId = override && override.length > 0 ? override : params.entityId
  rs.dispatchRuntimeEvent(
    {
      type: "nfc.scan",
      payload: {
        entityId: params.entityId,
        tagUid: params.tagUid,
        listId: params.listId,
        effectTargetEntityId,
        playerId: "player1"
      }
    },
    params.assignments
  )
}

export function emitRuntimeEntitySelected(entityId: string | null, assignments: Assignment[]) {
  if (!entityId) return
  const rs = useRuntimeSession.getState()
  rs.dispatchRuntimeEvent(
    {
      type: "entity.selected",
      payload: { entityId, effectTargetEntityId: entityId, playerId: "player1" }
    },
    assignments
  )
}
