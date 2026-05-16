function valueOrDash(value) {
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString()
}

function escapeJsonForHtml(obj) {
  return String(JSON.stringify(obj))
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function briefAssignmentResult(state) {
  const r = state.lastAssignmentResult
  if (!r) return '-'
  const ent = r.entityId ?? r.unitId
  if (r.ok && r.idempotent) return `ok (idempotent) tag=${r.tagId} entity=${ent}`
  if (r.ok) return `ok tag=${r.tagId} entity=${ent}`
  return `fail ${r.reason || ''} tag=${r.tagId ?? ''}`
}

export function renderDebugPanel(state) {
  const historyItems = [...state.actionHistory].reverse()
  const rosterName = state.activeRoster?.name
  const unitCount = state.activeRoster?.units?.length ?? 0

  return `
    <aside class="debug-panel">
      <h3>Debug Panel</h3>
      <p>
        <button type="button" data-action="go-interaction-lab">Open WebView interaction lab</button>
      </p>
      <p><strong>current screen:</strong> ${state.currentScreen}</p>
      <p><strong>app mode:</strong> ${state.appMode}</p>
      <p><strong>launcher group:</strong> ${valueOrDash(state.selectedLauncherGroupKey)}</p>
      <p><strong>selected faction:</strong> ${valueOrDash(state.selectedFaction)}</p>
      <p><strong>selected package:</strong> ${valueOrDash(state.selectedPackage)}</p>
      <p><strong>active theme:</strong> ${valueOrDash(state.activeThemeId)}</p>
      <p><strong>runtime registry entities:</strong> ${state.runtimeRegistry?.entities?.length ?? 0}</p>
      <p><strong>runtime system:</strong> ${valueOrDash(state.runtimeRegistry?.metadata?.systemId)}</p>
      <p><strong>relationships (graph):</strong> ${(state.runtimeRegistry?.relationships || []).length}</p>
      <p><strong>active roster:</strong> ${valueOrDash(rosterName)}</p>
      <p><strong>unit count:</strong> ${unitCount}</p>
      <p><strong>selected unit (id):</strong> ${valueOrDash(state.selectedUnit)}</p>
      <p><strong>assignment unit id:</strong> ${valueOrDash(state.selectedUnitId)}</p>
      <p><strong>assignment unit name:</strong> ${valueOrDash(state.selectedUnitName)}</p>
      <p><strong>assignment unit index:</strong> ${valueOrDash(state.selectedUnitIndex)}</p>
      <p><strong>active assignment unit (NFC):</strong> ${valueOrDash(state.selectedUnitId)} · ${valueOrDash(state.selectedUnitName)}</p>
      <p><strong>last scanned UID (stub / hardware):</strong> ${valueOrDash(state.lastNfcStubRead)}</p>
      <p><strong>NFC last scanned UID (runtime pipeline):</strong> ${valueOrDash(state.nfcLastScannedUid)}</p>
      <p><strong>NFC scan receipt:</strong> ${valueOrDash(state.nfcScanReceiptState)}</p>
      <p><strong>NFC last resolved entity:</strong> ${valueOrDash(state.nfcLastResolvedEntityId)}</p>
      <p><strong>NFC dispatch latency (ms):</strong> ${valueOrDash(state.nfcLastDispatchLatencyMs)}</p>
      <p><strong>NFC last dispatch ok:</strong> ${state.nfcLastRuntimeDispatchOk == null ? '-' : state.nfcLastRuntimeDispatchOk ? 'yes' : 'no'}</p>
      <p><strong>NFC transport failure:</strong> ${valueOrDash(state.nfcLastTransportFailureReason)}</p>
      <p><strong>NFC tap detail open:</strong> ${state.nfcTapSelectDetailOpen ? 'yes' : 'no'}</p>
      <p><strong>NFC last scan route:</strong> ${valueOrDash(state.nfcLastScanRoute)}</p>
      <p><strong>package NFC highlight entity:</strong> ${valueOrDash(state.packageNfcHighlightEntityId)}</p>
      <p><strong>package NFC lookup source:</strong> ${valueOrDash(state.packageNfcLookupSource)}</p>
      <p><strong>package browse NFC entity count:</strong> ${valueOrDash(state.packageBrowseNfcEntityCount)}</p>
      <p><strong>nfc scan phase:</strong> ${valueOrDash(state.nfcScanPhase)}</p>
      <p><strong>nfc certified units:</strong> ${valueOrDash(state.nfcCertifiedUnitCount)}</p>
      <p><strong>runtime ready:</strong> ${state.runtimeReady === true ? 'yes' : 'no'}</p>
      <p><strong>nfc status:</strong> ${valueOrDash(state.nfcStatus)}</p>
      <p><strong>assigned tags (count):</strong> ${Object.keys(state.assignedTags || {}).length}</p>
      <p><strong>recent assignments (count):</strong> ${(state.recentAssignments || []).length}</p>
      <p><strong>last assignment result:</strong> ${briefAssignmentResult(state)}</p>
      <p><strong>runtime resolved tag:</strong> ${valueOrDash(state.runtimeResolvedTag)}</p>
      <p><strong>runtime resolved unit:</strong> ${state.runtimeResolvedUnit ? escapeJsonForHtml(state.runtimeResolvedUnit) : '-'}</p>
      <p><strong>runtime last lookup:</strong> ${state.runtimeLastLookupResult ? escapeJsonForHtml(state.runtimeLastLookupResult) : '-'}</p>
      <p><strong>runtime lookup history (n):</strong> ${(state.runtimeLookupHistory || []).length}</p>
      <p><strong>runtime units (canonical map size):</strong> ${Object.keys(state.runtimeUnits || {}).length}</p>
      <p><strong>render count:</strong> ${state.renderCount}</p>
      <p><strong>last action:</strong> ${state.lastAction}</p>
      <h4>Recent Actions (newest first)</h4>
      <ul class="action-history">
        ${historyItems
          .map(
            (action) => `
              <li>
                <span class="action-type">${action.type}</span>
                <span>${valueOrDash(action.value)}</span>
                <span>@${action.renderIndex}</span>
                <span>${formatTime(action.timestamp)}</span>
              </li>
            `
          )
          .join('')}
      </ul>
    </aside>
  `
}
