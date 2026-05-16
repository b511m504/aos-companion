import { create } from "zustand"
import type { Unit } from "@/models/types"
import { getNfcManager } from "@/services/NFCManager"
import { useAppStore } from "@/store/useAppStore"
import { useRuntimeSession } from "@/store/useRuntimeSession"
import { clearPlaySession, loadPlaySession, savePlaySession } from "@/play/playPersistence"
import { playLinkSuccess, playScanPulse } from "@/play/playFeedback"
import type { PersistedPlaySession, PlayPhase, PlaySessionMetrics, UnitPlayState } from "@/play/playTypes"
import {
  SKELETON_STRIKE_FACTION_ID,
  SKELETON_STRIKE_LIST_ID,
  SKELETON_STRIKE_SYSTEM_ID
} from "@/play/playTypes"
import { shortTagLabel } from "@/utils/uid"

export type PlayToast = { message: string; tone: "ok" | "neutral" | "warn" } | null

type State = {
  units: Record<string, UnitPlayState>
  selectedUnitId: string | null
  sheetOpen: boolean
  round: number
  phase: PlayPhase
  toast: PlayToast
  glowUnitId: string | null
  metrics: PlaySessionMetrics
  lastResumeAt: number | null
}

type Actions = {
  hasSavedSession(): boolean
  resumeSavedSession(): Promise<boolean>
  startSkeletonSession(): Promise<boolean>
  clearSession(): void
  persistNow(): void
  onTableScan(uid: string): void
  selectUnit(id: string | null): void
  openSheet(id: string): void
  closeSheet(): void
  applyDamage(amount: number): void
  applyHeal(amount: number): void
  toggleActivated(): void
  toggleEffect(effect: string): void
  setPhase(phase: PlayPhase): void
  nextRound(): void
  setToast(t: PlayToast): void
  recordRecovery(): void
  startTableListening(): Promise<void>
  stopTableListening(): Promise<void>
}

function defaultMetrics(): PlaySessionMetrics {
  return {
    sessionStartedAt: Date.now(),
    scanCount: 0,
    duplicateScanCount: 0,
    recoveryCount: 0,
    lastScanAt: null
  }
}

function unitFromEntity(u: Unit): UnitPlayState {
  const o = u.runtimeStateOverlay ?? {}
  const maxWounds = typeof o.maxWounds === "number" ? o.maxWounds : 10
  const wounds = typeof o.wounds === "number" ? o.wounds : 0
  return {
    entityId: u.id,
    displayName: u.name,
    maxWounds,
    wounds: Math.min(wounds, maxWounds),
    activated: o.activated === true,
    statusLabel: typeof o.statusLabel === "string" ? o.statusLabel : wounds >= maxWounds ? "Down" : "Ready",
    effects: []
  }
}

function hydrateFromPersisted(p: PersistedPlaySession): Partial<State> {
  return {
    units: p.units,
    round: p.round,
    phase: p.phase,
    metrics: p.metrics,
    selectedUnitId: null,
    sheetOpen: false,
    glowUnitId: null,
    toast: null,
    lastResumeAt: Date.now()
  }
}

function buildPersisted(get: () => State & Actions): PersistedPlaySession | null {
  const app = useAppStore.getState()
  if (!app.selectedList || !app.selectedSystem || !app.selectedFaction) return null
  const s = get()
  return {
    schemaVersion: 1,
    listId: app.selectedList.id,
    systemId: app.selectedSystem.id,
    factionId: app.selectedFaction.id,
    listName: app.selectedList.name,
    factionName: app.selectedFaction.name,
    systemName: app.selectedSystem.name,
    startedAt: new Date(s.metrics.sessionStartedAt).toISOString(),
    lastActiveAt: new Date().toISOString(),
    round: s.round,
    phase: s.phase,
    units: s.units,
    metrics: s.metrics
  }
}

export const usePlaySessionStore = create<State & Actions>((set, get) => ({
  units: {},
  selectedUnitId: null,
  sheetOpen: false,
  round: 1,
  phase: "turn",
  toast: null,
  glowUnitId: null,
  metrics: defaultMetrics(),
  lastResumeAt: null,

  hasSavedSession() {
    return loadPlaySession() != null
  },

  async resumeSavedSession() {
    const saved = loadPlaySession()
    if (!saved) return false
    const app = useAppStore.getState()
    const sys = app.systems.find((x) => x.id === saved.systemId)
    if (!sys) return false
    await app.selectSystem(sys)
    const fac = useAppStore.getState().factions.find((x) => x.id === saved.factionId)
    if (!fac) return false
    await useAppStore.getState().selectFaction(fac)
    const list = useAppStore.getState().lists.find((x) => x.id === saved.listId)
    if (!list) return false
    useAppStore.getState().selectList(list)
    set({
      ...hydrateFromPersisted(saved),
      metrics: { ...saved.metrics, recoveryCount: saved.metrics.recoveryCount + 1 }
    })
    get().recordRecovery()
    get().persistNow()
    useRuntimeSession.getState().setRuntimeEnabled(true)
    useAppStore.getState().goPlayTable()
    await get().startTableListening()
    return true
  },

  async startSkeletonSession() {
    clearPlaySession()
    const app = useAppStore.getState()
    const sys = app.systems.find((x) => x.id === SKELETON_STRIKE_SYSTEM_ID)
    if (!sys) {
      useAppStore.getState().clearError()
      useAppStore.setState({ errorBanner: "Kill Team content not loaded." })
      return false
    }
    await app.selectSystem(sys)
    const fac = useAppStore.getState().factions.find((x) => x.id === SKELETON_STRIKE_FACTION_ID)
    if (!fac) {
      useAppStore.setState({ errorBanner: "Skeleton Strike faction not found." })
      return false
    }
    await useAppStore.getState().selectFaction(fac)
    const list = useAppStore.getState().lists.find((x) => x.id === SKELETON_STRIKE_LIST_ID)
    if (!list) {
      useAppStore.setState({ errorBanner: "Skeleton Strike Team roster not found." })
      return false
    }
    useAppStore.getState().selectList(list)
    const units: Record<string, UnitPlayState> = {}
    for (const u of list.units) units[u.id] = unitFromEntity(u)
    set({
      units,
      selectedUnitId: null,
      sheetOpen: false,
      round: 1,
      phase: "turn",
      toast: null,
      glowUnitId: null,
      metrics: defaultMetrics()
    })
    get().persistNow()
    useRuntimeSession.getState().setRuntimeEnabled(true)
    useAppStore.getState().goPlayAssign()
    return true
  },

  clearSession() {
    clearPlaySession()
    set({
      units: {},
      selectedUnitId: null,
      sheetOpen: false,
      round: 1,
      phase: "turn",
      toast: null,
      glowUnitId: null,
      metrics: defaultMetrics(),
      lastResumeAt: null
    })
  },

  persistNow() {
    const p = buildPersisted(get)
    if (p) savePlaySession(p)
  },

  onTableScan(uid: string) {
    const app = useAppStore.getState()
    const assignment = app.assignments.find((a) => a.tagUid === uid)
    const now = Date.now()
    const metrics = { ...get().metrics }
    metrics.scanCount += 1
    metrics.lastScanAt = now
  if (!assignment) {
      set({
        metrics,
        toast: { message: "Unknown token — link it in Assign Tags first.", tone: "warn" }
      })
      return
    }
    const unit = get().units[assignment.entityId]
    if (!unit) {
      set({ metrics, toast: { message: "Token not in this roster.", tone: "warn" } })
      return
    }
    const lastUid = app.lastScannedUid
    const lastAt = app.lastScanSuccessAt ?? 0
    if (lastUid === uid && now - lastAt < 1200) {
      metrics.duplicateScanCount += 1
    }
    playScanPulse()
    set({
      metrics,
      selectedUnitId: assignment.entityId,
      sheetOpen: true,
      glowUnitId: assignment.entityId,
      toast: { message: unit.displayName, tone: "ok" }
    })
    useAppStore.setState({
      lastScannedUid: uid,
      lastScanSuccessAt: now,
      selectedEntityId: assignment.entityId
    })
    get().persistNow()
    window.setTimeout(() => set({ glowUnitId: null }), 700)
  },

  selectUnit(id) {
    set({ selectedUnitId: id })
  },

  openSheet(id) {
    set({ selectedUnitId: id, sheetOpen: true })
  },

  closeSheet() {
    set({ sheetOpen: false })
  },

  applyDamage(amount) {
    const id = get().selectedUnitId
    if (!id) return
    const u = get().units[id]
    if (!u) return
    const wounds = Math.min(u.maxWounds, u.wounds + amount)
    const statusLabel = wounds >= u.maxWounds ? "Down" : u.statusLabel
    set({
      units: { ...get().units, [id]: { ...u, wounds, statusLabel } },
      toast: { message: `${u.displayName} · ${wounds}/${u.maxWounds} wounds`, tone: "neutral" }
    })
    get().persistNow()
  },

  applyHeal(amount) {
    const id = get().selectedUnitId
    if (!id) return
    const u = get().units[id]
    if (!u) return
    const wounds = Math.max(0, u.wounds - amount)
    const statusLabel = wounds >= u.maxWounds ? "Down" : wounds === 0 ? "Ready" : u.statusLabel
    set({
      units: { ...get().units, [id]: { ...u, wounds, statusLabel } },
      toast: { message: `${u.displayName} healed`, tone: "ok" }
    })
    get().persistNow()
  },

  toggleActivated() {
    const id = get().selectedUnitId
    if (!id) return
    const u = get().units[id]
    if (!u) return
    const activated = !u.activated
    set({
      units: {
        ...get().units,
        [id]: { ...u, activated, statusLabel: activated ? "Activated" : "Ready" }
      }
    })
    get().persistNow()
  },

  toggleEffect(effect) {
    const id = get().selectedUnitId
    if (!id) return
    const u = get().units[id]
    if (!u) return
    const has = u.effects.includes(effect)
    const effects = has ? u.effects.filter((e) => e !== effect) : [...u.effects, effect]
    set({ units: { ...get().units, [id]: { ...u, effects } } })
    get().persistNow()
  },

  setPhase(phase) {
    set({ phase })
    get().persistNow()
  },

  nextRound() {
    const round = get().round + 1
    const units = { ...get().units }
    for (const id of Object.keys(units)) {
      units[id] = { ...units[id]!, activated: false, statusLabel: units[id]!.wounds >= units[id]!.maxWounds ? "Down" : "Ready" }
    }
    set({ round, units, phase: "turn" })
    get().persistNow()
  },

  setToast(t) {
    set({ toast: t })
  },

  recordRecovery() {
    set((s) => ({
      metrics: { ...s.metrics, recoveryCount: s.metrics.recoveryCount + 1 },
      lastResumeAt: Date.now()
    }))
  },

  async startTableListening() {
    const mgr = getNfcManager()
    const app = useAppStore.getState()
    if (app.nativeNfcAvailable) await app.setNfcMode("native")
    await mgr.startListening()
    useAppStore.setState({ scanFeedback: { kind: "listening" } })
  },

  async stopTableListening() {
    await getNfcManager().stopListening()
    useAppStore.setState({ scanFeedback: { kind: "idle" }, awaitingScan: false })
  }
}))

/** After assignment scan succeeds — friendly copy + haptic. */
export function onAssignScanSuccess(uid: string, displayName: string): void {
  playLinkSuccess()
  usePlaySessionStore.getState().setToast({
    message: `Tag linked · ${displayName} (${shortTagLabel(uid)})`,
    tone: "ok"
  })
}
