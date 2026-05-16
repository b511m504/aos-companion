import { create } from "zustand"
import type {
  ArmyList,
  Assignment,
  AssignmentConflict,
  Faction,
  GameSystem,
  ImportMergeStrategy,
  NfcMode,
  NfcScanMachineState,
  PersistedStoreSnapshot,
  ScanFeedback,
  EntityAssignmentFilter,
  ValidationBanner,
  ValidationPhase,
  ValidationRowStatus
} from "@/models/types"
import { createContentLoader } from "@/loaders/ContentLoader"
import { persistence } from "@/store/persistenceSingleton"
import { AssignmentRegistry } from "@/services/AssignmentRegistry"
import { applyReassignment, checkUidConflict } from "@/services/TagConflictResolver"
import { buildAssignmentForEntity, validateAssignmentShape } from "@/services/assignmentValidation"
import { getNfcManager } from "@/services/NFCManager"
import {
  applyAssignmentImportPreview,
  exportAssignmentBundleJson,
  parseAssignmentBundleJson,
  previewAssignmentBundleImport,
  type ImportPreview
} from "@/services/AssignmentBundleService"
import { entityIdSet } from "@/utils/entityLookup"
import { normalizeUid, shortTagLabel } from "@/utils/uid"
import { devBulkRandomAssignments, devStressRegistryIterations } from "@/utils/devTesting"
import { bootstrapRuntimeFromAppStore, emitRuntimeAfterNfcLink, emitRuntimeEntitySelected } from "@/runtime/emitRuntimeFromApp"
import type { CanonicalImportResult } from "@/content-import/CanonicalImportResult"
import { ImportSessionManager } from "@/content-import/ImportSessionManager"
import { parseImportAdapterJson } from "@/content-import/ImportRegistry"
import { EntityRelationshipGraph } from "@/runtime/relationships/EntityRelationshipGraph"
import { useRuntimeSession } from "@/store/useRuntimeSession"
import { parseReplayBundleJson } from "@/runtime/replay/replayBundle"

function friendlySetupError(detail: string): string {
  if (/json|schema|parse|catalog|object|array|required|missing|duplicate path|Invalid|must be/i.test(detail)) {
    return "Couldn’t load game lists. Check your install, or use Settings → Advanced → Import if you’re bringing in custom data."
  }
  return detail
}

let validationPhaseTimer: number | null = null

function clearValidationPhaseTimer() {
  if (validationPhaseTimer !== null) {
    window.clearTimeout(validationPhaseTimer)
    validationPhaseTimer = null
  }
}

const contentLoader = createContentLoader()

export type ScreenId = "start" | "system" | "faction" | "list" | "nfc" | "validate" | "settings" | "runtime_lab"

export type AppState = {
  screen: ScreenId
  errorBanner: string | null
  sessionWarning: string | null
  systems: GameSystem[]
  factions: Faction[]
  lists: ArmyList[]
  selectedSystem: GameSystem | null
  selectedFaction: Faction | null
  selectedList: ArmyList | null
  assignments: Assignment[]
  selectedEntityId: string | null
  awaitingScan: boolean
  lastScannedUid: string | null
  lastScanSuccessAt: number | null
  lastAssignedEntityId: string | null
  scanFeedback: ScanFeedback
  conflict: AssignmentConflict | null
  nfcMode: NfcMode
  nativeNfcAvailable: boolean
  nfcScanState: NfcScanMachineState
  nfcDebounceMs: number
  contentLoading: boolean
  entityFilter: EntityAssignmentFilter
  entitySearch: string
  importPreview: ImportPreview | null
  importBundleJson: string
  canonicalImportPackageId: string
  canonicalImportPayloadJson: string
  lastCanonicalImportResult: CanonicalImportResult | null
  canonicalRelationshipGraphJson: string | null
  validationListening: boolean
  validationRowStatus: Record<string, ValidationRowStatus>
  validationBanner: ValidationBanner | null
  validationFocusEntityId: string | null
  validationGlowEntityId: string | null
  validationLastTagLabel: string
  validationLastTagUid: string
  validationPhase: ValidationPhase
  /** Optional entity id: JSON `selected_entity` resolves here on nfc.scan when set (cross-entity trap POC). */
  runtimeEffectTargetEntityId: string | null
}

function emptyValidationSlice() {
  return {
    validationListening: false,
    validationRowStatus: {} as Record<string, ValidationRowStatus>,
    validationBanner: null as ValidationBanner | null,
    validationFocusEntityId: null as string | null,
    validationGlowEntityId: null as string | null,
    validationLastTagLabel: "",
    validationLastTagUid: "",
    validationPhase: "idle" as ValidationPhase
  }
}

type AppActions = {
  bootstrap(): Promise<void>
  goStart(): void
  goSystems(): void
  goFaction(): void
  goList(): void
  goSettings(): void
  goRuntimeLab(): void
  selectSystem(system: GameSystem): Promise<void>
  selectFaction(faction: Faction): Promise<void>
  selectList(list: ArmyList): void
  goNfcWorkspace(): void
  goValidate(): void
  startValidationListening(): Promise<void>
  stopValidationListening(): Promise<void>
  applyValidationScan(uid: string): void
  resetValidationProgress(): void
  resetValidationRow(entityId: string): void
  setValidationFocusEntityId(id: string | null): void
  setSelectedEntity(entityId: string | null): void
  setAwaitingScan(on: boolean): Promise<void>
  setNfcMode(mode: NfcMode): Promise<void>
  setNfcDebounceMs(ms: number): void
  setNfcScanState(s: NfcScanMachineState): void
  probeNfc(): Promise<void>
  simulateUidInput(raw: string): void
  applyScanUid(uid: string): void
  cancelConflict(): void
  resolveConflictReassign(): void
  resolveConflictViewOwner(): void
  removeAssignmentForSelected(): void
  clearError(): void
  clearSessionWarning(): void
  setEntityFilter(f: EntityAssignmentFilter): void
  setEntitySearch(q: string): void
  setImportBundleJson(s: string): void
  runImportPreview(): void
  applyImport(strategy: ImportMergeStrategy): void
  clearImportPreview(): void
  setCanonicalImportPackageId(s: string): void
  setCanonicalImportPayloadJson(s: string): void
  runCanonicalJsonImport(): Promise<void>
  clearCanonicalImportSession(): void
  exportCurrentBundle(): string
  copyExportToClipboard(): Promise<void>
  clearCurrentListAssignments(): void
  devFillRandom(count: number): void
  devStress(iterations: number): { ok: boolean; error?: string }
  setRuntimeEffectTargetEntityId(id: string | null): void
  importReplayBundleFromFile(jsonText: string): void
}

function loadAssignmentsForList(listId: string, allowed: Set<string>): { assignments: Assignment[]; warning: string | null } {
  const snap = persistence.load()
  const bundle = snap?.bundles.find((b) => b.listId === listId)
  const raw = bundle ? [...bundle.assignments] : []
  const rep = AssignmentRegistry.validateRawAssignmentList(raw)
  if (!rep.ok) {
    return {
      assignments: [],
      warning:
        "Saved tag links for this army couldn’t be loaded and were reset. You can re-link tags, or use Settings → Advanced if you need to recover from a backup."
    }
  }
  const reg = AssignmentRegistry.fromAssignments(raw)
  const integ = reg.validateRegistryIntegrity({ allowedEntityIds: allowed })
  if (!integ.ok) {
    return {
      assignments: [],
      warning:
        "Saved tag links didn’t match this army and were cleared. Re-link your tags, or restore from Settings → Advanced if you have an export."
    }
  }
  return { assignments: reg.getAll(), warning: null }
}

function persistAssignments(listId: string, assignments: Assignment[]) {
  const raw = AssignmentRegistry.validateRawAssignmentList(assignments)
  if (!raw.ok) {
    console.error("[persist] blocked corrupt snapshot", raw.issues)
    return
  }
  const reg = AssignmentRegistry.fromAssignments(assignments)
  const integ = reg.validateRegistryIntegrity()
  if (!integ.ok) {
    console.error("[persist] blocked integrity failures", integ.issues)
    return
  }
  const prev = persistence.load() ?? { schemaVersion: 1, bundles: [] }
  const others = prev.bundles.filter((b) => b.listId !== listId)
  const next: PersistedStoreSnapshot = {
    schemaVersion: 1,
    bundles: [...others, { schemaVersion: 1, listId, assignments: [...assignments] }]
  }
  persistence.save(next)
}

const initial: AppState = {
  screen: "start",
  errorBanner: null,
  sessionWarning: null,
  systems: [],
  factions: [],
  lists: [],
  selectedSystem: null,
  selectedFaction: null,
  selectedList: null,
  assignments: [],
  selectedEntityId: null,
  awaitingScan: false,
  lastScannedUid: null,
  lastScanSuccessAt: null,
  lastAssignedEntityId: null,
  scanFeedback: { kind: "idle" },
  conflict: null,
  nfcMode: "simulated",
  nativeNfcAvailable: false,
  nfcScanState: "idle",
  nfcDebounceMs: 1500,
  contentLoading: false,
  entityFilter: "all",
  entitySearch: "",
  importPreview: null,
  importBundleJson: "",
  canonicalImportPackageId: "warhammer40k",
  canonicalImportPayloadJson: "",
  lastCanonicalImportResult: null,
  canonicalRelationshipGraphJson: null,
  runtimeEffectTargetEntityId: null,
  ...emptyValidationSlice()
}

export const useAppStore = create<AppState & AppActions>((set, get) => ({
  ...initial,

  async bootstrap() {
    set({ contentLoading: true, errorBanner: null, sessionWarning: null })
    const catalogResult = await contentLoader.loadCatalog()
    if (!catalogResult.ok) {
      set({ contentLoading: false, errorBanner: friendlySetupError(catalogResult.error) })
      return
    }
    const systems: GameSystem[] = []
    const seen = new Set<string>()
    for (const ref of catalogResult.value.systemRefs) {
      const sr = await contentLoader.loadSystem(ref.path)
      if (!sr.ok) {
        set({ contentLoading: false, errorBanner: friendlySetupError(`Game file (${ref.path}): ${sr.error}`) })
        return
      }
      if (seen.has(sr.value.id)) {
        set({ contentLoading: false, errorBanner: friendlySetupError(`Duplicate game entry: ${sr.value.id}`) })
        return
      }
      seen.add(sr.value.id)
      systems.push(sr.value)
    }
    set({ systems, contentLoading: false, nfcDebounceMs: getNfcManager().getDebounceMs() })
  },

  goStart() {
    clearValidationPhaseTimer()
    void getNfcManager().stopListening()
    set({
      screen: "start",
      awaitingScan: false,
      scanFeedback: { kind: "idle" },
      conflict: null,
      importPreview: null,
      ...emptyValidationSlice()
    })
  },

  goSettings() {
    clearValidationPhaseTimer()
    void getNfcManager().stopListening()
    set({
      screen: "settings",
      awaitingScan: false,
      scanFeedback: { kind: "idle" },
      conflict: null,
      ...emptyValidationSlice()
    })
  },

  goRuntimeLab() {
    clearValidationPhaseTimer()
    void getNfcManager().stopListening()
    set({
      screen: "runtime_lab",
      errorBanner: null,
      awaitingScan: false,
      scanFeedback: { kind: "idle" },
      conflict: null,
      importPreview: null,
      ...emptyValidationSlice()
    })
  },

  goSystems() {
    clearValidationPhaseTimer()
    void getNfcManager().stopListening()
    set({
      screen: "system",
      errorBanner: null,
      awaitingScan: false,
      scanFeedback: { kind: "idle" },
      conflict: null,
      importPreview: null,
      ...emptyValidationSlice()
    })
  },

  goFaction() {
    clearValidationPhaseTimer()
    void getNfcManager().stopListening()
    set({
      screen: "faction",
      errorBanner: null,
      awaitingScan: false,
      scanFeedback: { kind: "idle" },
      conflict: null,
      ...emptyValidationSlice()
    })
  },

  goList() {
    clearValidationPhaseTimer()
    void getNfcManager().stopListening()
    set({
      screen: "list",
      errorBanner: null,
      awaitingScan: false,
      scanFeedback: { kind: "idle" },
      conflict: null,
      ...emptyValidationSlice()
    })
  },

  async selectSystem(system: GameSystem) {
    set({ contentLoading: true, errorBanner: null, selectedSystem: system, sessionWarning: null })
    const file = await contentLoader.loadFactionsFile(system.factionsPath)
    if (!file.ok) {
      set({ contentLoading: false, errorBanner: friendlySetupError(file.error) })
      return
    }
    set({ factions: file.value.factions, screen: "faction", contentLoading: false })
  },

  async selectFaction(faction: Faction) {
    const sys = get().selectedSystem
    if (!sys) return
    set({ contentLoading: true, errorBanner: null, selectedFaction: faction, sessionWarning: null })
    const file = await contentLoader.loadListsFile(faction.listsPath)
    if (!file.ok) {
      set({ contentLoading: false, errorBanner: friendlySetupError(file.error) })
      return
    }
    set({ lists: file.value.lists, screen: "list", contentLoading: false })
  },

  selectList(list: ArmyList) {
    const allow = entityIdSet(list)
    const { assignments, warning } = loadAssignmentsForList(list.id, allow)
    set({
      selectedList: list,
      assignments,
      selectedEntityId: null,
      awaitingScan: false,
      scanFeedback: { kind: "idle" },
      conflict: null,
      lastScannedUid: null,
      lastScanSuccessAt: null,
      lastAssignedEntityId: null,
      sessionWarning: warning,
      importPreview: null,
      runtimeEffectTargetEntityId: null,
      ...emptyValidationSlice()
    })
    void bootstrapRuntimeFromAppStore()
  },

  goNfcWorkspace() {
    clearValidationPhaseTimer()
    const list = get().selectedList
    if (!list) {
      set({ errorBanner: "Choose an army on the previous step first." })
      return
    }
    set({ screen: "nfc", errorBanner: null, ...emptyValidationSlice() })
    void bootstrapRuntimeFromAppStore()
  },

  goValidate() {
    clearValidationPhaseTimer()
    void getNfcManager().stopListening()
    const { selectedList, assignments, selectedFaction, selectedSystem } = get()
    if (!selectedList || !selectedFaction || !selectedSystem) {
      set({ errorBanner: "Choose a game, faction, and army first." })
      return
    }
    const rowStatus: Record<string, ValidationRowStatus> = {}
    for (const a of assignments) {
      rowStatus[a.entityId] = "pending"
    }
    set({
      screen: "validate",
      awaitingScan: false,
      scanFeedback: { kind: "idle" },
      conflict: null,
      errorBanner: null,
      validationListening: false,
      validationRowStatus: rowStatus,
      validationBanner:
        assignments.length === 0
          ? {
              tone: "neutral",
              text: "No tags linked yet. Go back to link tags, then run a table check."
            }
          : null,
      validationPhase: "idle",
      validationFocusEntityId: null,
      validationGlowEntityId: null,
      validationLastTagLabel: "",
      validationLastTagUid: ""
    })
  },

  async startValidationListening() {
    const { selectedList, assignments } = get()
    if (!selectedList) return
    if (assignments.length === 0) {
      set({
        validationBanner: {
          tone: "bad",
          text: "No tags linked for this army yet. Link tags first, then come back to verify."
        }
      })
      return
    }
    clearValidationPhaseTimer()
    await getNfcManager().stopListening()
    set({
      awaitingScan: false,
      validationListening: true,
      validationPhase: "scanning",
      validationBanner: null,
      scanFeedback: { kind: "idle" },
      conflict: null
    })
    await getNfcManager().startListening()
  },

  async stopValidationListening() {
    clearValidationPhaseTimer()
    await getNfcManager().stopListening()
    const phase = get().validationPhase
    set({
      validationListening: false,
      validationPhase: phase === "complete" ? "complete" : "idle",
      validationBanner: phase === "complete" ? get().validationBanner : null
    })
  },

  applyValidationScan(uid: string) {
    const { validationListening, selectedList, assignments, validationFocusEntityId, validationRowStatus } = get()
    if (!validationListening || !selectedList) return

    const nuid = normalizeUid(uid)
    if (!nuid) {
      set({
        validationPhase: "warning",
        validationBanner: { tone: "bad", text: "Couldn’t read that tag. Try again." },
        validationLastTagLabel: "—",
        validationLastTagUid: ""
      })
      return
    }

    set({ validationLastTagLabel: shortTagLabel(nuid), validationLastTagUid: nuid })

    const matches = assignments.filter((a) => normalizeUid(a.tagUid) === nuid)
    if (matches.length === 0) {
      set({
        validationPhase: "warning",
        validationBanner: {
          tone: "bad",
          text: "Unknown tag — this NFC tag is not linked to this army."
        }
      })
      return
    }

    if (matches.length > 1) {
      const next = { ...validationRowStatus }
      for (const m of matches) next[m.entityId] = "problem"
      set({
        validationRowStatus: next,
        validationPhase: "warning",
        validationBanner: {
          tone: "bad",
          text: "Problem: this tag is linked more than once in saved data. Fix links in assignment mode."
        }
      })
      return
    }

    const owner = matches[0]!
    if (validationFocusEntityId && owner.entityId !== validationFocusEntityId) {
      const want = selectedList.units.find((u) => u.id === validationFocusEntityId)
      set({
        validationPhase: "warning",
        validationBanner: {
          tone: "bad",
          text: `Tag belongs to: ${owner.displayName}. You were checking: ${want?.name ?? "another unit"}.`
        }
      })
      return
    }

    const next = { ...validationRowStatus }
    next[owner.entityId] = "verified"

    const linkedIds = [...new Set(assignments.map((a) => a.entityId))]
    const allVerified = linkedIds.every((id) => next[id] === "verified")

    set({
      validationRowStatus: next,
      validationPhase: allVerified ? "complete" : "verified",
      validationBanner: { tone: "ok", text: `✓ ${owner.displayName} verified` },
      validationGlowEntityId: owner.entityId
    })

    window.setTimeout(() => {
      if (get().validationGlowEntityId === owner.entityId) set({ validationGlowEntityId: null })
    }, 1300)

    if (allVerified) {
      clearValidationPhaseTimer()
      void getNfcManager().stopListening()
      set({
        validationListening: false,
        validationBanner: {
          tone: "ok",
          text: "Army verification complete — all linked units matched their tags."
        }
      })
    } else {
      clearValidationPhaseTimer()
      validationPhaseTimer = window.setTimeout(() => {
        validationPhaseTimer = null
        const s = get()
        if (s.validationListening && s.validationPhase !== "complete") {
          set({ validationPhase: "scanning", validationBanner: null })
        }
      }, 1400)
    }
  },

  resetValidationProgress() {
    clearValidationPhaseTimer()
    void getNfcManager().stopListening()
    const { assignments } = get()
    const next: Record<string, ValidationRowStatus> = {}
    for (const a of assignments) next[a.entityId] = "pending"
    set({
      validationListening: false,
      validationRowStatus: next,
      validationBanner: null,
      validationPhase: "idle",
      validationGlowEntityId: null,
      validationLastTagLabel: "",
      validationLastTagUid: ""
    })
  },

  resetValidationRow(entityId: string) {
    const { assignments, validationRowStatus } = get()
    if (!assignments.some((a) => a.entityId === entityId)) return
    set({
      validationRowStatus: { ...validationRowStatus, [entityId]: "pending" },
      validationPhase: "idle",
      validationBanner: null
    })
  },

  setValidationFocusEntityId(id: string | null) {
    const { validationFocusEntityId } = get()
    if (id !== null && validationFocusEntityId === id) {
      set({ validationFocusEntityId: null })
      return
    }
    set({ validationFocusEntityId: id })
  },

  setSelectedEntity(entityId: string | null) {
    const prev = get().selectedEntityId
    set({
      selectedEntityId: entityId,
      awaitingScan: false,
      scanFeedback: { kind: "idle" },
      conflict: null
    })
    void getNfcManager().stopListening()
    if (entityId && entityId !== prev) {
      void bootstrapRuntimeFromAppStore().then(() => {
        emitRuntimeEntitySelected(entityId, get().assignments)
      })
    }
  },

  async setAwaitingScan(on: boolean) {
    const { selectedEntityId, selectedList, selectedFaction, selectedSystem } = get()
    if (on && (!selectedEntityId || !selectedList || !selectedFaction || !selectedSystem)) {
      set({ errorBanner: "Pick a unit in the list before starting the reader." })
      return
    }
    if (!on) {
      await getNfcManager().stopListening()
      set({ awaitingScan: false, scanFeedback: { kind: "idle" } })
      return
    }
    if (get().validationListening) {
      clearValidationPhaseTimer()
      await getNfcManager().stopListening()
      set({
        validationListening: false,
        validationPhase: get().validationPhase === "complete" ? "complete" : "idle",
        validationBanner: null
      })
    }
    set({ awaitingScan: true, scanFeedback: { kind: "listening" }, conflict: null })
    await getNfcManager().startListening()
  },

  async setNfcMode(mode: NfcMode) {
    const mgr = getNfcManager()
    mgr.setMode(mode)
    set({ nfcMode: mode })
    if (get().awaitingScan) {
      await mgr.stopListening()
      await mgr.startListening()
    }
    if (get().validationListening) {
      await mgr.stopListening()
      await mgr.startListening()
    }
  },

  setNfcDebounceMs(ms: number) {
    getNfcManager().setDebounceMs(ms)
    set({ nfcDebounceMs: getNfcManager().getDebounceMs() })
  },

  setNfcScanState(s: NfcScanMachineState) {
    set({ nfcScanState: s })
  },

  async probeNfc() {
    const supported = await getNfcManager().probeNative()
    set({ nativeNfcAvailable: supported, nfcDebounceMs: getNfcManager().getDebounceMs() })
  },

  simulateUidInput(raw: string) {
    const st = get()
    if (st.screen === "validate" && st.validationListening) {
      getNfcManager().simulateScan(raw)
      return
    }
    if (!st.awaitingScan) return
    getNfcManager().simulateScan(raw)
  },

  applyScanUid(uid: string) {
    const {
      selectedEntityId,
      selectedList,
      selectedFaction,
      selectedSystem,
      assignments
    } = get()
    if (!selectedEntityId || !selectedList || !selectedFaction || !selectedSystem) return

    const built = buildAssignmentForEntity({
      list: selectedList,
      entityId: selectedEntityId,
      tagUidRaw: uid,
      factionId: selectedFaction.id,
      gameSystemId: selectedSystem.id
    })
    if (!built.ok) {
      set({ scanFeedback: { kind: "error", message: built.error } })
      return
    }

    const registry = AssignmentRegistry.fromAssignments(assignments)
    const check = checkUidConflict({
      registry,
      rawUid: uid,
      targetEntityId: selectedEntityId,
      targetDisplayName: built.assignment.displayName
    })
    if (check.status === "conflict") {
      set({ conflict: check.conflict, scanFeedback: { kind: "error", message: "That tag is already linked to another unit." } })
      return
    }

    const err = validateAssignmentShape(built.assignment)
    if (err) {
      set({ scanFeedback: { kind: "error", message: err } })
      return
    }
    const up = registry.upsert(built.assignment)
    if (!up.ok) {
      set({ scanFeedback: { kind: "error", message: up.error } })
      return
    }
    const all = registry.getAll()
    persistAssignments(selectedList.id, all)
    set({
      assignments: all,
      lastScannedUid: built.assignment.tagUid,
      lastScanSuccessAt: Date.now(),
      lastAssignedEntityId: built.assignment.entityId,
      scanFeedback: {
        kind: "success",
        uid: built.assignment.tagUid,
        message: `Linked — ${built.assignment.displayName}`
      },
      awaitingScan: false
    })
    void getNfcManager().stopListening()
    void emitRuntimeAfterNfcLink({
      systemId: selectedSystem.id,
      list: selectedList,
      assignments: all,
      entityId: built.assignment.entityId,
      tagUid: built.assignment.tagUid,
      listId: selectedList.id
    })
  },

  cancelConflict() {
    set({ conflict: null, scanFeedback: { kind: "listening" } })
  },

  resolveConflictReassign() {
    const c = get().conflict
    const {
      selectedEntityId,
      selectedList,
      selectedFaction,
      selectedSystem,
      assignments
    } = get()
    if (!c || !selectedEntityId || !selectedList || !selectedFaction || !selectedSystem) return

    const built = buildAssignmentForEntity({
      list: selectedList,
      entityId: selectedEntityId,
      tagUidRaw: c.tagUid,
      factionId: selectedFaction.id,
      gameSystemId: selectedSystem.id
    })
    if (!built.ok) return

    const registry = AssignmentRegistry.fromAssignments(assignments)
    applyReassignment({ registry, conflict: c })
    const up = registry.upsert(built.assignment)
    if (!up.ok) {
      set({ scanFeedback: { kind: "error", message: up.error } })
      return
    }
    const all = registry.getAll()
    persistAssignments(selectedList.id, all)
    set({
      assignments: all,
      conflict: null,
      lastScannedUid: built.assignment.tagUid,
      lastScanSuccessAt: Date.now(),
      lastAssignedEntityId: built.assignment.entityId,
      scanFeedback: { kind: "success", uid: built.assignment.tagUid, message: `Moved tag here — ${built.assignment.displayName}` },
      awaitingScan: false
    })
    void getNfcManager().stopListening()
    void emitRuntimeAfterNfcLink({
      systemId: selectedSystem.id,
      list: selectedList,
      assignments: all,
      entityId: built.assignment.entityId,
      tagUid: built.assignment.tagUid,
      listId: selectedList.id
    })
  },

  resolveConflictViewOwner() {
    const c = get().conflict
    if (!c) return
    set({
      selectedEntityId: c.existing.entityId,
      conflict: null,
      scanFeedback: { kind: "idle" },
      awaitingScan: false
    })
    void getNfcManager().stopListening()
  },

  removeAssignmentForSelected() {
    const { selectedEntityId, selectedList, assignments } = get()
    if (!selectedEntityId || !selectedList) return
    const registry = AssignmentRegistry.fromAssignments(assignments)
    registry.removeByEntity(selectedEntityId)
    const all = registry.getAll()
    persistAssignments(selectedList.id, all)
    set({ assignments: all, scanFeedback: { kind: "idle" } })
  },

  clearError() {
    set({ errorBanner: null })
  },

  clearSessionWarning() {
    set({ sessionWarning: null })
  },

  setEntityFilter(f: EntityAssignmentFilter) {
    set({ entityFilter: f })
  },

  setEntitySearch(q: string) {
    set({ entitySearch: q })
  },

  setImportBundleJson(s: string) {
    set({ importBundleJson: s, importPreview: null })
  },

  runImportPreview() {
    const { importBundleJson, selectedList, selectedFaction, selectedSystem, assignments } = get()
    if (!selectedList || !selectedFaction || !selectedSystem) {
      set({ errorBanner: "Load a list before importing" })
      return
    }
    const parsed = parseAssignmentBundleJson(importBundleJson)
    if (!parsed.ok) {
      set({ errorBanner: parsed.errors.join("; "), importPreview: null })
      return
    }
    const b = parsed.bundle
    if (b.listId !== selectedList.id || b.factionId !== selectedFaction.id || b.gameSystemId !== selectedSystem.id) {
      set({
        errorBanner: "Bundle systemId/factionId/listId does not match the active session. Refusing preview.",
        importPreview: null
      })
      return
    }
    const preview = previewAssignmentBundleImport({
      bundle: b,
      currentAssignments: assignments,
      list: selectedList,
      factionId: selectedFaction.id,
      gameSystemId: selectedSystem.id
    })
    set({ importPreview: preview, errorBanner: null })
  },

  applyImport(strategy: ImportMergeStrategy) {
    const { importPreview, assignments, selectedList } = get()
    if (!importPreview || !selectedList) return
    const res = applyAssignmentImportPreview({
      preview: importPreview,
      strategy,
      currentAssignments: assignments
    })
    if (res.error) {
      set({ errorBanner: res.error })
      return
    }
    persistAssignments(selectedList.id, res.next)
    set({
      assignments: res.next,
      importPreview: null,
      importBundleJson: "",
      errorBanner: null,
      sessionWarning:
        strategy === "safe_partial" && res.skipped > 0
          ? "Some tag links from the file weren’t applied because those tags are already used. The rest are saved."
          : null
    })
  },

  clearImportPreview() {
    set({ importPreview: null })
  },

  setCanonicalImportPackageId(s: string) {
    set({ canonicalImportPackageId: s })
  },

  setCanonicalImportPayloadJson(s: string) {
    set({ canonicalImportPayloadJson: s })
  },

  async runCanonicalJsonImport() {
    const pkg = get().canonicalImportPackageId.trim()
    const text = get().canonicalImportPayloadJson.trim()
    if (!pkg || !text) {
      set({ errorBanner: "Enter package id and JSON payload (e.g. sample_lists export)." })
      return
    }
    let raw: unknown
    try {
      raw = JSON.parse(text) as unknown
    } catch {
      set({ errorBanner: "Payload is not valid JSON." })
      return
    }
    const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/")
    const url = `${base}packages/${pkg}/imports/jsonRosterAdapter.json`.replace(/\/{2,}/g, "/")
    let adapterRaw: unknown
    try {
      const res = await fetch(url, { cache: "no-store" })
      if (!res.ok) {
        set({ errorBanner: `Could not load adapter (${res.status}): ${url}` })
        return
      }
      adapterRaw = await res.json()
    } catch (e) {
      set({ errorBanner: e instanceof Error ? e.message : "Adapter fetch failed" })
      return
    }
    const adapter = parseImportAdapterJson(adapterRaw)
    if (!adapter) {
      set({ errorBanner: "Adapter JSON is not a valid jsonRoster adapter (schemaVersion 1)." })
      return
    }
    if (adapter.packageId !== pkg) {
      set({ errorBanner: `Adapter packageId ${adapter.packageId} does not match selected ${pkg}` })
      return
    }
    const session = ImportSessionManager.runJsonRoster({ raw, adapter })
    set({ lastCanonicalImportResult: session })
    if (!session.ok) {
      set({ errorBanner: session.errors[0] ?? "Canonical import validation failed", canonicalRelationshipGraphJson: null })
      return
    }
    const graph = EntityRelationshipGraph.fromImportGraph(session.graph)
    set({
      canonicalRelationshipGraphJson: graph.toJson(),
      errorBanner: null,
      importPreview: null,
      importBundleJson: ""
    })
    get().selectList(session.list)
  },

  clearCanonicalImportSession() {
    set({
      lastCanonicalImportResult: null,
      canonicalRelationshipGraphJson: null,
      canonicalImportPayloadJson: ""
    })
  },

  exportCurrentBundle(): string {
    const { assignments, selectedList, selectedFaction, selectedSystem } = get()
    if (!selectedList || !selectedFaction || !selectedSystem) return ""
    return exportAssignmentBundleJson({
      assignments,
      listId: selectedList.id,
      factionId: selectedFaction.id,
      gameSystemId: selectedSystem.id
    })
  },

  async copyExportToClipboard() {
    const json = get().exportCurrentBundle()
    if (!json) return
    try {
      await navigator.clipboard.writeText(json)
    } catch {
      set({ errorBanner: "Clipboard unavailable — copy from export text manually." })
    }
  },

  clearCurrentListAssignments() {
    const { selectedList } = get()
    if (!selectedList) return
    persistAssignments(selectedList.id, [])
    set({ assignments: [], importPreview: null, scanFeedback: { kind: "idle" }, ...emptyValidationSlice() })
  },

  devFillRandom(count: number) {
    const { selectedList, selectedFaction, selectedSystem, assignments } = get()
    if (!selectedList || !selectedFaction || !selectedSystem) return
    const extra = devBulkRandomAssignments({
      list: selectedList,
      factionId: selectedFaction.id,
      gameSystemId: selectedSystem.id,
      count
    })
    const reg = AssignmentRegistry.fromAssignments(assignments)
    for (const a of extra) {
      reg.upsert(a)
    }
    const all = reg.getAll()
    persistAssignments(selectedList.id, all)
    set({ assignments: all })
  },

  devStress(iterations: number) {
    const { selectedList, selectedFaction, selectedSystem } = get()
    if (!selectedList || !selectedFaction || !selectedSystem) {
      return { ok: false, error: "No list context" }
    }
    return devStressRegistryIterations({
      list: selectedList,
      factionId: selectedFaction.id,
      gameSystemId: selectedSystem.id,
      iterations
    })
  },

  setRuntimeEffectTargetEntityId(id: string | null) {
    set({ runtimeEffectTargetEntityId: id })
  },

  importReplayBundleFromFile(jsonText: string) {
    try {
      const bundle = parseReplayBundleJson(jsonText)
      useRuntimeSession.getState().restoreReplayBundleSnapshot(bundle)
      const sel = get().selectedList
      if (sel && bundle.listSummary?.id === sel.id && bundle.assignments.length) {
        persistAssignments(sel.id, bundle.assignments)
        set({
          assignments: bundle.assignments.map((a) => ({ ...a })),
          sessionWarning: "Assignments restored from replay bundle for the current roster."
        })
      } else {
        set({
          sessionWarning:
            "Engine snapshot restored from replay bundle. Assignments were not auto-synced (roster mismatch or empty bundle assignments)."
        })
      }
      void bootstrapRuntimeFromAppStore()
    } catch (e) {
      set({ errorBanner: e instanceof Error ? e.message : String(e) })
    }
  }
}))
