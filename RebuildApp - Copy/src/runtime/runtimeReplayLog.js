/** Ring buffer of recent runtime dispatches for replay / timeline (engine diagnostics). */

const RUNTIME_REPLAY_LOG_MAX = 384
/** @type {object[]} */
const log = []

export function appendRuntimeReplayActionLog(entry) {
  log.push({ at: Date.now(), ...entry })
  if (log.length > RUNTIME_REPLAY_LOG_MAX) log.splice(0, log.length - RUNTIME_REPLAY_LOG_MAX)
}

export function getRuntimeReplayActionLog() {
  return [...log]
}

export function clearRuntimeReplayActionLog() {
  log.length = 0
}
