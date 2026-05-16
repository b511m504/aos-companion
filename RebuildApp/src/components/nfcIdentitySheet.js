/** Bottom sheet when a scanned tag is recognized on another piece this session. */

export function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function escAttr(s) {
  return esc(s).replaceAll("'", '&#39;')
}

export function renderNfcIdentitySheet(state) {
  const modal = state.nfcIdentityModal
  if (!modal) return ''

  const {
    tagId,
    requestedName,
    existingName,
    requestedEntityId,
    existingEntityId,
    recognizedFromHistory,
    existingPackageKey,
    canViewCurrent,
  } = modal
  const hasCurrentTarget = canViewCurrent !== false && Boolean(existingEntityId)

  return `
    <div class="nfc-sheet-root" role="presentation">
      <button type="button" class="nfc-sheet-bg-hit" aria-label="Dismiss" data-action="dismiss-tag-identity-sheet"></button>
      <div class="nfc-sheet" role="dialog" aria-modal="true" aria-labelledby="nfc-sheet-title">
        <div class="nfc-sheet__grab" aria-hidden="true"></div>
        <p class="nfc-sheet__kicker">Tag recognized</p>
        <h2 id="nfc-sheet-title" class="nfc-sheet__title">Tag recognized</h2>
        <p class="nfc-sheet__lead">${recognizedFromHistory ? 'Previously used with:' : 'Currently linked to:'}</p>
        <p class="nfc-sheet__owner"><strong>${esc(existingName || existingEntityId)}</strong></p>
        ${
          recognizedFromHistory && existingPackageKey
            ? `<p class="nfc-sheet__past">From package: ${esc(existingPackageKey)}</p>`
            : ''
        }
        <p class="nfc-sheet__meta">Link this tag to <strong>${esc(requestedName || requestedEntityId)}</strong> instead?</p>
        <div class="nfc-sheet__actions">
          <button type="button" class="action-button nfc-sheet__primary" data-action="reassign-physical-tag" data-nfc-tag="${escAttr(
            tagId
          )}" data-value="${escAttr(requestedEntityId)}">
            Relink tag
          </button>
          ${
            hasCurrentTarget
              ? `<button type="button" class="action-button action-button--secondary" data-action="jump-to-linked-piece" data-value="${escAttr(
                  existingEntityId
                )}">
            View current
          </button>`
              : ''
          }
          <button type="button" class="link-button nfc-sheet__cancel" data-action="dismiss-tag-identity-sheet">Cancel</button>
        </div>
      </div>
    </div>
  `
}
