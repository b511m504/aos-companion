const DEV_UNLOCK_KEY = "aos_play_dev_unlock"

export function isDevToolsUnlocked(): boolean {
  if (typeof window === "undefined") return false
  if (import.meta.env.DEV && import.meta.env.VITE_PLAY_DEV_ALWAYS === "true") return true
  return localStorage.getItem(DEV_UNLOCK_KEY) === "1"
}

export function unlockDevTools(): void {
  localStorage.setItem(DEV_UNLOCK_KEY, "1")
}

export function lockDevTools(): void {
  localStorage.removeItem(DEV_UNLOCK_KEY)
}
