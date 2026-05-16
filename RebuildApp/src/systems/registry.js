import * as generic from './generic/index.js'
import * as aos from './aos/index.js'
import * as warhammer40k from './warhammer40k/index.js'

const BY_ID = {
  generic,
  aos,
  warhammer40k,
}

/**
 * @param {string} id
 */
export function resolveSystemAdapter(id) {
  const key = String(id || '').toLowerCase()
  return BY_ID[key] ?? generic
}

export function listRegisteredSystems() {
  return Object.keys(BY_ID)
}
