/**
 * Minimal DOM for Android WebView hit-testing — no cards, transforms, or overlays here.
 * Enable with `?interactionLab=1` or Tools → Open WebView interaction lab.
 */

import { getInteractionLabTapCounter } from '../diagnostics/webviewInteractionLab.js'

export function renderInteractionTestScreen() {
  const n = getInteractionLabTapCounter()
  return `
    <div class="interaction-lab-screen">
      <p class="interaction-lab-screen__title">WebView interaction lab</p>
      <div class="interaction-lab-screen__counter" aria-live="polite">${n}</div>
      <p class="interaction-lab-screen__hint">Watch Logcat / remote inspector for <code>SPEARHEAD_INTERACTION_LAB*</code> lines.</p>

      <button type="button" id="test-button">Test Button</button>

      <div data-action="test-action" class="interaction-lab-screen__hit">
        Test Data Action
      </div>

      <p class="interaction-lab-screen__nav">
        <button type="button" data-action="go-home">← Home</button>
      </p>
    </div>
  `
}
