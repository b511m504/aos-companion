import type { PersistedPlaySession } from "@/play/playTypes"

const STORAGE_KEY = "nfc-tabletop-play:v1"

export function loadPlaySession(): PersistedPlaySession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedPlaySession
    if (parsed?.schemaVersion !== 1 || !parsed.listId) return null
    return parsed
  } catch {
    return null
  }
}

export function savePlaySession(session: PersistedPlaySession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function clearPlaySession(): void {
  localStorage.removeItem(STORAGE_KEY)
}
