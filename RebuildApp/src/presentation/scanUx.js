/**
 * Derives player-visible scan interaction state from store + bridge metrics (read-only).
 */

import { nfcBridgeHeartbeat } from '../nfcRuntime/nfcBridgeHeartbeat.js'

/**
 * @typedef {'idle'|'processing'|'success'|'duplicate'|'rejected'|'unknown_tag'|'disconnected'} ScanUxPhase
 */

/**
 * @param {object} state store snapshot
 * @returns {{ phase: ScanUxPhase, headline: string, sub: string }}
 */
export function deriveScanUxPresentation(state) {
  const receipt = String(state.nfcScanReceiptState || 'idle')
  const hb = nfcBridgeHeartbeat

  const bridgeLive =
    Boolean(hb.bridgeStarted) &&
    Boolean(hb.hasSpearheadBridge) &&
    Boolean(hb.capacitorReadyConfirmedTs)

  const processing =
    Number(hb.scanQueueDepth) > 0 ||
    Number(hb.processingScanAgeMs) > 30 ||
    (Number(hb.oldestQueuedAgeMs) > 0 && receipt === 'idle')

  if (!bridgeLive && typeof globalThis.Capacitor !== 'undefined') {
    return {
      phase: /** @type {ScanUxPhase} */ ('disconnected'),
      headline: 'Scanner idle',
      sub: 'Bridge not active — reopen the app or check NFC.',
    }
  }

  if (processing && receipt === 'idle') {
    return {
      phase: 'processing',
      headline: 'Reading tag…',
      sub: 'Hold steady for a moment.',
    }
  }

  if (receipt === 'duplicate_ignored' || receipt === 'package_scan_ignored') {
    return {
      phase: 'duplicate',
      headline: 'Already counted',
      sub: 'That piece was just registered — try another.',
    }
  }

  if (receipt === 'unknown_tag' || receipt === 'package_entity_missing') {
    return {
      phase: 'unknown_tag',
      headline: 'New chip',
      sub: 'Link it to a model or marker below.',
    }
  }

  if (receipt === 'no_roster' || receipt === 'unit_not_in_roster' || receipt === 'nfc_ui_blocking') {
    return {
      phase: 'rejected',
      headline: 'Cannot use that tap',
      sub:
        receipt === 'no_roster'
          ? 'Load an army list first.'
          : receipt === 'nfc_ui_blocking'
            ? 'Close the open sheet, then try again.'
            : 'Check your roster and assignments.',
    }
  }

  if (receipt === 'resolved' || receipt === 'package_entity_resolved') {
    const unit = state.runtimeResolvedUnit
    const name = unit?.name || unit?.id || 'Piece'
    return {
      phase: 'success',
      headline: `${name}`,
      sub: 'Registered — forces and objectives update now.',
    }
  }

  return {
    phase: 'idle',
    headline: 'Ready to scan',
    sub: 'Bring a tag close when you act in-game.',
  }
}
