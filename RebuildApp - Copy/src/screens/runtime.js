/**
 * Match / play surface — tabletop companion layout (not a debug console).
 */

import { ENABLE_DEV_FIXTURES } from '../hardware/nfc.js'
import { renderMatchScreen } from '../components/matchScreen.js'

export function renderRuntimeScreen(state) {
  return renderMatchScreen(state, { showDevScan: ENABLE_DEV_FIXTURES })
}
