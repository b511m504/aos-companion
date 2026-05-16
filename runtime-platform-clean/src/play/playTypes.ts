/** Per-operative state during a live tabletop session. */
export type UnitPlayState = {
  entityId: string
  displayName: string
  maxWounds: number
  wounds: number
  activated: boolean
  statusLabel: string
  /** Optional effect tags (e.g. suppressed, cover). */
  effects: string[]
}

export type PlayPhase = "setup" | "turn" | "end"

export type PlaySessionMetrics = {
  sessionStartedAt: number
  scanCount: number
  duplicateScanCount: number
  recoveryCount: number
  lastScanAt: number | null
}

export type PersistedPlaySession = {
  schemaVersion: 1
  listId: string
  systemId: string
  factionId: string
  listName: string
  factionName: string
  systemName: string
  startedAt: string
  lastActiveAt: string
  round: number
  phase: PlayPhase
  units: Record<string, UnitPlayState>
  metrics: PlaySessionMetrics
}

export const SKELETON_STRIKE_LIST_ID = "skt_strike_team"
export const SKELETON_STRIKE_SYSTEM_ID = "killteam"
export const SKELETON_STRIKE_FACTION_ID = "skeleton_strike"
