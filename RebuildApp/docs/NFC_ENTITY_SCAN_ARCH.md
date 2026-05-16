# NFC entity scan architecture (concise)

## Layers

1. **Transport (Android / Capacitor / `nfcController`)** — Reads tag UID, normalizes envelope (`uid`, `transactionId`, `receivedAt`, `sourcePath`), queues, dedupes enqueue spam. Emits into JS only; **no store mutation** here.
2. **Routing (`main.js` `interceptScan`)** — Decides:
   - **Assignment pairing**: if `nfcController` has `selectedUnitId` + `waitingForScan`, returns `{ handled: false }` so the existing assignment commit path runs (new tag → entity link).
   - **Match runtime**: `currentScreen === 'runtime'` **and** `appMode === 'runtime'` → `RUNTIME_RESOLVE_TAG` via `dispatchRuntimeAction`.
   - **Browse / roster / launcher / non-match runtime**: `RUNTIME_NFC_SCAN` when the screen is allowed **and** either **a roster is loaded** or the screen is a **package-browse NFC screen** (`nfcScanRouting.js` — home, game/faction/theme selection, package-selection). Envelope carries `scanRoute` for diagnostics (`package_browse_no_roster` vs `roster_context` vs `package_with_roster`).
3. **Runtime (`dispatchRuntimeAction` → entities domain)** — Single pure transition (`transitionResolveTag`) for both action types: updates `runtimeUnits`, lookup history, NFC receipt diagnostics. Entity resolution uses **`resolveVirtualUnitForBinding`**: **roster unit → `runtimeRegistry.entities` → binding-only fallback** (no full match runtime required). `RUNTIME_NFC_SCAN` adds roster selection + roster scroll, or **package browse** patches (`packageNfcHighlight*`, `package_entity_resolved` / `package_entity_missing` / `package_scan_ignored`).
4. **Effects (`scheduleRuntimeEffects`)** — Side effects only: overlay log, persist hook, **`NFC_UI_SCROLL_ENTITY`** (roster cards), **`NFC_UI_SCROLL_PACKAGE_NFC`** (`.pkg-nfc-hit` banner on package browser). Replay uses policies; no hidden store writes from effects.

## Actions

| Action | When | Selection UI |
|--------|------|----------------|
| `RUNTIME_RESOLVE_TAG` | Live match runtime screen | No |
| `RUNTIME_NFC_SCAN` | Roster, NFC assignment, launcher browse screens, runtime outside match mode | Roster: `nfcTapSelectDetailOpen` + scroll entity card. Package browser: highlight banner + scroll |

## Package browser without roster

On `package-selection` (and other `NFC_PACKAGE_BROWSE_SCREENS`), scans dispatch **without** `activeRoster` if `assignedTags` + optional `runtimeRegistry` can still resolve the bound entity. **`packageBrowseNfcEntityCount`** is refreshed when a package pipeline hydrates the registry (`commitPackageResult`).

## Duplicate suppression

Semantic dedupe in the transition: same `tagId` + same outcome class within **~420 ms** → `duplicate_ignored`, or **`package_scan_ignored`** on package-browse screens for the same UX bucket.

## Stress harness

`globalThis.__SPEARHEAD_NFC_STRESS__('rapid' | 'spam' | 'unknown')` — fires `injectTestScan` bursts against the live queue (uses first `assignedTags` key when not `unknown`).

## Lifecycle

Visibility / suspend flags on `nfcController` continue to gate drain; `interceptScan` does not touch the store except through `dispatchRuntimeAction` + optional `recordNfcTransportFailure` for guard-level rejects (non-replay-critical diagnostics).
