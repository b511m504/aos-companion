import type { PersistedStoreSnapshot } from "@/models/types"

const STORAGE_KEY = "nfc-tabletop-companion:v1"

export type PersistenceLayer = {
  load(): PersistedStoreSnapshot | null
  save(snapshot: PersistedStoreSnapshot): void
  clearAll(): void
  /** Stable label for diagnostics (e.g. localStorage). */
  backendId: string
}

export function createLocalStoragePersistence(): PersistenceLayer {
  return {
    backendId: "localStorage",
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as unknown
        if (!parsed || typeof parsed !== "object") return null
        return parsed as PersistedStoreSnapshot
      } catch {
        return null
      }
    },
    save(snapshot: PersistedStoreSnapshot) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
    },
    clearAll() {
      localStorage.removeItem(STORAGE_KEY)
    }
  }
}
