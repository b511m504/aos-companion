# NFC architecture & extension rules

This document defines constraints for extending tabletop NFC features without splitting authority or bypassing queue and suspend semantics.

---

## Pipeline

**Authoritative end-to-end flow** (native Android → JS → store → UI): see **[NFC_RUNTIME_PIPELINE.md](./NFC_RUNTIME_PIPELINE.md)**.

Summary:

```
Android NFC
  → SPEARHEAD_NFC_NATIVE_RECEIVE (WebView)
  → nfcAndroidBridge → nfcController (FIFO queue + suspend)
  → runtime: normalized runtime action → store.dispatchRuntimeAction (guards / journal)
  → store (authority)
  → runtime / UI projection
```

Runtime action types and replay tooling: `src/runtime/runtimeActionSchema.js`, `runtimeEventJournal.js`, `runtimeReplay.js`.

---

## Store authority

The **store** is the single source of truth for:

- Assignments (`nfcAssignments`, `assignedTags`, and derived linkage)
- Runtime tag meaning (`resolveRuntimeTag`, runtime lookups)
- Conflicts (`activeNfcConflict`, `nfcIdentityModal`)
- Persisted tabletop bundles (via `sessionSnapshot` + schema version)
- Gameplay interpretation (wounds, runtime units, certification gates)

All NFC-driven **meaning** lands in the store through existing transitions (`applyStubTagAssignment`, `resolveRuntimeTag`, conflict handlers, etc.). Do not duplicate assignment maps or certification logic outside the store.

---

## nfcController responsibilities

The controller stays **thin**. It coordinates:

| Area | Role |
|------|------|
| Queue | Ordered FIFO processing of normalized scans (`enqueueScan` → drain) |
| Suspend | Gates draining via `updateSuspendState()` |
| Bridge | Start/stop listeners; optional `restartBridge()` |
| Recovery | Global hook for WebView-tier recovery (see below) |
| Routing | Forwards normalized scans to `interceptScan` / store-backed `commitAssignment` |

### nfcController must NOT become

- A gameplay rules engine
- Persistence authority (no owning `localStorage` / snapshot writes)
- A second assignment store (UI mirrors store via `syncAssignmentsFromStore`)
- Owner of long-lived runtime gameplay state

---

## Queue rules

All scans that carry assignable or runtime-resolvable tag IDs must:

1. **Enter** through the scan pipeline that ends in `enqueueScan` (never mutate gameplay state synchronously inside raw bridge callbacks).
2. **Process** through ordered FIFO draining (bounded queue; overflow drops oldest with a logged warning).
3. **Resolve meaning** against **current** store/controller selection at **processing time**, not at enqueue time.

### Never

- Mutate gameplay state directly from bridge callbacks (bypassing the queue).
- Introduce “fast paths” that skip the queue for perceived performance.
- Cache “assignment intent” at enqueue time (selection and modal state must be read when the item runs).

Diagnostic-only paths (e.g. NFC disabled, empty UID) may stay immediate where they only update diagnostics and do not commit assignments.

---

## Suspend rules

`updateSuspendState()` is the **centralized** gate for **when** queued scans may drain.

### Current suspend sources

| Flag | Typical source |
|------|------------------|
| `restoreInProgress` | Session restore (`resumeLastSession`) wrapped in main |
| `conflictBlocking` | Identity / conflict UI (`nfcIdentityModal`, `activeNfcConflict`) driven from render |

Draining resumes when suspend transitions from blocking → not blocking (not on every frame).

### Future work

Any new modal or system transition that must pause NFC side-effects should integrate via **`updateSuspendState`** (extend flags only if necessary and document them here). Do not invent parallel “pause NFC” globals or duplicate queues.

---

## Persistence rules

Session payloads use **`SESSION_SNAPSHOT_SCHEMA_VERSION`** (see `src/services/sessionSnapshot.js`).

Rules:

1. **Increment** the schema version when persisted shape is incompatible with older clients.
2. Provide a **migration** path **or** explicit **safe degradation** (e.g. strip `nfcBundle`, keep launcher fields).
3. **Never** silently reinterpret incompatible NFC/runtime blobs into new semantics.

---

## Recovery / lifecycle notes

The stack is hardened for:

- Android lifecycle churn (foreground dispatch, sticky intent consumption on the native side)
- WebView recreation (bridge stop/start clears listeners and JS queue; native pending payload may still flush when WebView returns)
- Duplicate NFC intents (native dedupe + intent consume after handle)
- Rapid scan bursts (FIFO + bounded queue + suspend)
- Restore races (`restoreInProgress` suspend)

### Recovery hook

After WebView-tier issues (debug or OEM quirks), without reloading the shell:

```js
globalThis.__SPEARHEAD_RESTART_NFC_BRIDGE__()
```

This stops and restarts the JS NFC bridge (listeners + queue flush on stop). Prefer **targeted mitigations** over redesigning the pipeline.

---

## Operational guidance

- **Do not** refactor the NFC core unless there is a **reproducible** device/runtime failure and logs show a **concrete** failure path.
- Prefer **logging** (`SPEARHEAD_*` prefixes), **bounded retries**, **lifecycle guards**, and **small queue/suspend/recovery fixes** over architectural churn.

---

## Related implementation files

| Concern | Location |
|---------|-----------|
| Queue / suspend / restart | `src/nfcRuntime/nfcController.js` |
| Bridge listeners | `src/nfcRuntime/nfcAndroidBridge.js` |
| Store wiring, resume suspend | `src/main.js` |
| Snapshot schema | `src/services/sessionSnapshot.js` |
| Native NFC / dispatch | `android/.../MainActivity.java` |

---

## Temporary NFC diagnostics (field triage)

Use **logcat tag** `SPEARHEAD_NFC_DIAG` (`adb logcat -s SPEARHEAD_NFC_DIAG`) alongside `SPEARHEAD_NFC`.

| Symptom | Interpretation |
|--------|----------------|
| No `phase=intent_received` lines when tapping tag | Likely **A** — OS/hardware never delivered an NFC intent to the activity (RF, OEM, NFC off, or activity not foreground). |
| `intent_received` present but never `native_dispatch_commit` | Early exit / dedupe / JSON abort — see `dedupe_skip`, `json_build_abort`. |
| `native_dispatch_commit` but `bridge_deferred` / `bridge_abort_*` then later `bridge_window_event_ok` | **C** boundary — native OK, bridge/WebView timing; compare timestamps. |
| `bridge_window_event_ok` / `bridge_evaljs_fallback_ok` but app mis-assigns | **D** — JS queue/store (`SPEARHEAD_ASSIGN`, store traces). |

**MainActivity.java**

- `TEMP_DIAG_RELAX_FOREGROUND_TECH_FILTERS` — when `true`, foreground dispatch uses **null** tech lists (OS accepts all technologies). Set to **`false`** after diagnosis to restore strict `techListsArray` matching.
- `TEMP_DIAG_FOREGROUND_TAG_DISCOVERED_ONLY` — when `true`, foreground dispatch registers **only** `ACTION_TAG_DISCOVERED`. Pair with **`AndroidManifest.xml`** where the `TECH_DISCOVERED` intent-filter + `nfc_tech_filter` meta-data block is **commented out** (same triage build). Re-enable both after diagnosis.
- **`SPEARHEAD_NFC_DIAG`** lines: `nfc_environment` (adapter_present, adapter_enabled, `PackageManager.FEATURE_NFC`, resolved **launchMode**), `before_enable_foreground_dispatch` (pending intent target class, filter count, tech_lists null vs populated), `foreground_dispatch_attempted ok=true|false`, and explicit **`lifecycle_onCreate` / `lifecycle_onResume` / `lifecycle_onPause` / `lifecycle_onNewIntent`** phases.
- `logDiagNfcIntentRaw` logs **action**, **tag UID byte length**, **hex length**, **tech list**, **path_hint** (`TECH_DISCOVERED` vs `TAG_DISCOVERED` vs `NDEF_DISCOVERED`) before dedupe.

Remove or tighten diagnostics once the failure class is identified.
