/**
 * Runtime / gameplay → player-facing copy (never expose internal action names to players).
 */

/** @param {string} receipt */
export function playerMessageForScanReceipt(receipt) {
  const r = String(receipt || '')
  switch (r) {
    case 'idle':
      return { title: 'Ready', detail: 'Tap a tag when you act on the table.' }
    case 'resolved':
    case 'package_entity_resolved':
      return { title: 'Got it', detail: 'Piece recognized.' }
    case 'duplicate_ignored':
    case 'package_scan_ignored':
      return { title: 'Already counted', detail: 'Try another model or wait a moment.' }
    case 'unknown_tag':
    case 'package_entity_missing':
      return { title: 'New tag', detail: 'Link this chip to a unit or marker.' }
    case 'no_roster':
      return { title: 'Load your list', detail: 'Choose an army in Setup first.' }
    case 'unit_not_in_roster':
      return { title: 'Tag not on your list', detail: 'Check assignments or pick another model.' }
    case 'nfc_ui_blocking':
      return { title: 'Finish this first', detail: 'Close the dialog, then scan again.' }
    default:
      if (!r || r === '') return { title: 'Ready', detail: 'Hold a tag near the phone.' }
      return { title: 'Scan notice', detail: 'Something blocked that tap — try again.' }
  }
}

/** @param {string} reason runtime dispatch rejection reason */
export function playerMessageForRuntimeRejection(reason) {
  const r = String(reason || '')
  if (r === 'duplicate_ignored') return { title: 'Already counted', detail: 'Same tap — no change.' }
  if (r === 'unknown_tag') return { title: 'Unknown chip', detail: 'Link it under Setup or Assignment.' }
  if (r === 'no_roster') return { title: 'No army loaded', detail: 'Open Setup and load a list.' }
  if (r === 'stale_epoch_rejected' || r === 'stale_sequence_rejected')
    return { title: 'Try again', detail: 'The table state moved on — one more tap.' }
  if (r === 'nfc_ui_blocking') return { title: 'Hold on', detail: 'Finish the open dialog first.' }
  if (r === 'runtime_frozen') return { title: 'Paused', detail: 'Game flow is locked — check Tools if you are debugging.' }
  return { title: 'Could not use that tap', detail: 'Try again or check your list.' }
}

const OBJ_NAMES = { obj_alpha: 'Primary objective', obj_beta: 'Secondary objective' }

/**
 * Big celebration line from latest timeline tail (player-visible).
 * @param {{ type: string, payload?: object }} ev
 * @param {{ unitName?: (id: string) => string }} ctx
 */
export function celebrationLineForTimelineEvent(ev, ctx = {}) {
  const ty = String(ev?.type || '')
  const p = ev?.payload && typeof ev.payload === 'object' ? ev.payload : {}
  const unitName = typeof ctx.unitName === 'function' ? ctx.unitName : () => ''

  if (ty === 'GAMEPLAY_OBJECTIVE_CAPTURE_COMPLETED') {
    const oid = String(p.objectiveId || '')
    const label = OBJ_NAMES[oid] || 'Objective'
    return `${label} secured`
  }
  if (ty === 'GAMEPLAY_OBJECTIVE_CAPTURE_STARTED') {
    const oid = String(p.objectiveId || '')
    const label = OBJ_NAMES[oid] || 'Objective'
    return `${label} — contest started`
  }
  if (ty === 'GAMEPLAY_ENTITY_SCAN_DETECTED' && p.resolvedEntityId) {
    const name = unitName(String(p.resolvedEntityId))
    return `${name} — on the board`
  }
  if (ty === 'GAMEPLAY_PHASE_CHANGED') return `Phase — ${p.phase || ''}`
  if (ty === 'GAMEPLAY_ROUND_ADVANCED') return `Round ${p.round ?? ''}`
  if (ty === 'GAMEPLAY_TURN_ADVANCED') return `Turn ${p.turn ?? ''}`
  if (ty === 'GAMEPLAY_ENTITY_REGISTERED') return `Tag linked — ready to play`
  return ''
}
