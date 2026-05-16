const KEY = 'rebuildapp_imported_packages_v1'

/** @returns {object[]} */
export function loadImportedPackageRecords() {
  try {
    const raw = localStorage.getItem(KEY)
    console.warn('PERSIST_RESTORE', KEY, raw ? '[present]' : '[empty]')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveImportedPackageRecords(rows) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(0, 24)))
  } catch {
    /* quota */
  }
}
