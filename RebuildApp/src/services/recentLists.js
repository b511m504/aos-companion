const STORAGE_KEY = 'rebuildapp_recent_lists_v1'

/**
 * @returns {Array<{ key: string, label: string, at: number }>}
 */
export function getRecentPackageLoads() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    console.warn('PERSIST_RESTORE', STORAGE_KEY, raw ? '[present]' : '[empty]')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function rememberPackageLoad(key, label) {
  if (!key) return
  const prev = getRecentPackageLoads().filter((x) => x.key !== key)
  const next = [{ key, label: label || key, at: Date.now() }, ...prev].slice(0, 6)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota */
  }
}
