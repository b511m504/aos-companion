function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function renderOperatorValidationScreen(state) {
  const pulse =
    state.operatorUxPulse === 'success'
      ? ' operator-flow--pulse-success'
      : state.operatorUxPulse === 'warn'
        ? ' operator-flow--pulse-warn'
        : ''
  const vr = state.operatorValidationResult
  let body = `<p class="operator-validation-idle">Scan tagged units to verify assignments.</p>`
  if (vr?.status === 'ok') {
    body = `
      <div class="operator-validation-result operator-validation-result--ok" role="status">
        <p class="operator-validation-check" aria-hidden="true">✓</p>
        <p class="operator-validation-name">${esc(vr.headline || '')}</p>
        ${vr.subline ? `<p class="operator-validation-sub">${esc(vr.subline)}</p>` : ''}
        ${vr.league ? `<p class="operator-validation-league">${esc(vr.league)}</p>` : ''}
        <p class="operator-validation-detail">${esc(vr.detail || 'Assigned correctly')}</p>
      </div>`
  } else if (vr?.status === 'unknown') {
    body = `
      <div class="operator-validation-result operator-validation-result--warn" role="status">
        <p class="operator-validation-name">${esc(vr.headline || 'Unassigned tag')}</p>
        ${vr.detail ? `<p class="operator-validation-detail">${esc(vr.detail)}</p>` : ''}
      </div>`
  } else if (vr?.status === 'conflict') {
    body = `
      <div class="operator-validation-result operator-validation-result--warn" role="alert">
        <p class="operator-validation-name">${esc(vr.headline || 'Assignment conflict detected')}</p>
        ${vr.detail ? `<p class="operator-validation-detail">${esc(vr.detail)}</p>` : ''}
      </div>`
  }

  return `
    <div class="operator-flow operator-flow--validation${pulse}">
      <h2 class="operator-flow__title">Validation</h2>
      <p class="operator-flow__lead">Scan tagged units to verify assignments</p>
      ${body}
      <div class="operator-actions operator-actions--footer">
        <button type="button" class="operator-secondary" data-action="go-operator-overview">Back</button>
      </div>
    </div>
  `
}
