const KEY = 'rebuildapp_launcher_session_v1'

/** Bump when persisted shape changes; loaders must tolerate older and reject newer. */
export const SESSION_SNAPSHOT_SCHEMA_VERSION = 2

function legacyGameToLauncherGroup(gameId) {
  const m = {
    wh40k: 'warhammer40k',
    aos: 'aos',
    skirmish: 'skirmish',
    rpg: 'rpg',
    motorpool: 'motorpool',
    battletech: 'battletech',
    cyberpunk: 'cyberpunk',
    imported: 'imported',
  }
  return m[gameId] || gameId || ''
}

function stripNfcBundleForIncompatibleSchema(o) {
  const { nfcBundle: _b, ...rest } = o || {}
  return rest
}

/**
 * @returns {{
 *   schemaVersion?: number,
 *   launcherGroupKey?: string,
 *   gameId?: string,
 *   packageKey: string,
 *   themeId: string,
 *   at: number,
 *   nfcBundle?: object,
 *   operatorGameId?: string,
 *   operatorFactionKey?: string,
 *   lastOperatorScreen?: string,
 *   embeddedOperatorRegistry?: object | null,
 * } | null}
 */
export function loadSessionSnapshot() {
  try {
    const raw = localStorage.getItem(KEY)
    console.debug('SPEARHEAD_PERSIST restore key=', KEY, raw ? '[present]' : '[empty]')
    if (!raw) return null
    const o = JSON.parse(raw)
    if (!o?.packageKey) return null

    const declared =
      o.schemaVersion !== undefined && o.schemaVersion !== null ? Number(o.schemaVersion) : 0

    if (declared > SESSION_SNAPSHOT_SCHEMA_VERSION) {
      console.warn(
        'SPEARHEAD_PERSIST schema_future snapshot_version=',
        declared,
        'app_supports=',
        SESSION_SNAPSHOT_SCHEMA_VERSION,
        'launcher_only'
      )
      const stripped = stripNfcBundleForIncompatibleSchema(o)
      const launcherGroupKey =
        stripped.launcherGroupKey !== undefined && stripped.launcherGroupKey !== null
          ? stripped.launcherGroupKey
          : legacyGameToLauncherGroup(stripped.gameId)
      return {
        ...stripped,
        launcherGroupKey,
        schemaVersion: declared,
        nfcBundle: undefined,
      }
    }

    const launcherGroupKey =
      o.launcherGroupKey !== undefined && o.launcherGroupKey !== null
        ? o.launcherGroupKey
        : legacyGameToLauncherGroup(o.gameId)

    return {
      ...o,
      launcherGroupKey,
      schemaVersion: declared === 0 ? 0 : declared,
    }
  } catch {
    return null
  }
}

export function saveSessionSnapshot(snapshot) {
  try {
    const payload = {
      ...snapshot,
      schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION,
      at: Date.now(),
    }
    localStorage.setItem(KEY, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

export function clearSessionSnapshot() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
