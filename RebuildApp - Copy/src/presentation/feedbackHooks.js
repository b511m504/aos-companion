/**
 * Tactile / audio abstraction — does not touch store or runtime dispatch.
 * Wire Capacitor Haptics or Web Vibration when available.
 */

function safeImpact(style = 'MEDIUM') {
  try {
    const H = globalThis.Capacitor?.Plugins?.Haptics
    if (H?.impact) {
      H.impact({ style })
      return
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(style === 'LIGHT' ? 12 : 22)
    }
  } catch {
    /* ignore */
  }
}

/** Reserved for future Web Audio / native sound bridge */
function soundPlaceholder(_kind) {
  /* intentionally empty — product can plug asset playback here */
}

export const tableFeedback = {
  scanProcessing() {
    safeImpact('LIGHT')
  },
  scanSuccess() {
    soundPlaceholder('scan_success')
    safeImpact('MEDIUM')
  },
  scanDuplicate() {
    soundPlaceholder('scan_duplicate')
    safeImpact('LIGHT')
  },
  scanRejected() {
    soundPlaceholder('scan_reject')
    safeImpact('LIGHT')
  },
  objectiveClaimed() {
    soundPlaceholder('objective')
    safeImpact('MEDIUM')
  },
  phaseChanged() {
    safeImpact('LIGHT')
  },
}
