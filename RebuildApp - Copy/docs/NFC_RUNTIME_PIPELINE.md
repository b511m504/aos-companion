# NFC runtime pipeline (authoritative)

This is the **single** scan path for packaged Android + Capacitor. Other documents defer here for end-to-end flow.

See also: [NFC_EXTENSION.md](./NFC_EXTENSION.md) (constraints, queue rules, suspend).

---

## Canonical flow

```
NFC hardware / OS
  → MainActivity (foreground dispatch, JSON payload)
  → (queue until JS runtime_ready)
  → WebView.evaluateJavascript → window.SPEARHEAD_NFC_NATIVE_RECEIVE(payload)
       … sole transport for tag payloads on Android …
  → nfcAndroidBridge.deliverFromNative (normalize, heartbeat receipt)
  → nfcController.onTag → enqueueScan (FIFO, bounded) → drain → processQueuedItem
  → interceptScan (routing only — no direct gameplay mutations for runtime)
  → runtime: buildRuntimeResolveTagAction(envelope) → store.dispatchRuntimeAction(action)
       → guards → resolveRuntimeTag (internal) / future reducers
  → assignment: commitAssignment → store (existing assignment path)
  → store mutation
  → UI refresh (subscribers)
```

**Runtime actions** (see `src/runtime/runtimeActionSchema.js`): normalized `{ type, transactionId, uid, packageId, runtimeGroupId, … }`. Gameplay code should prefer **`dispatchRuntimeAction`** over calling **`resolveRuntimeTag`** directly (except inside the store implementation).

**Selectors**: derived UI projections come from `src/runtime/selectors/*` (deterministic, memoized, side-effect free), not from ad-hoc mutations in store shape.

**Journal / replay**: bounded journal in `runtimeEventJournal.js`; **`globalThis.__SPEARHEAD_RUNTIME_REPLAY__(events, { verifyDeterminism: true })`** re-feeds actions through **`dispatchRuntimeAction`** with checkpoint divergence logging.

**Suspend / resume**: `document.visibilitychange` bumps **`runtimeSuspendEpoch`**, sets NFC drain **`runtimeBackgroundHold`**, and runs **`verifyRuntimeResumeContext`** on foreground.

**Rules**

1. **Do not** handle assignable tag UIDs in parallel listeners (Capacitor plugin tag events are skipped on **Android** when the native callback is used, to avoid double delivery).
2. **Do not** mutate gameplay state synchronously inside raw bridge callbacks; the controller queue + drain owns ordering.
3. **Store** remains authority for assignments, runtime resolution, conflicts, and persistence.

---

## Transactional scans (deterministic + idempotent)

Each assignable scan receives a **transaction envelope** on enqueue:

| Field | Meaning |
|--------|---------|
| `uid` | Normalized tag UID |
| `transactionId` | `stx_<monotonic>_<receivedAt>` (replay-safe key) |
| `receivedAt` | `Date.now()` at enqueue |
| `queueSequence` | Monotonic counter across the session |
| `sourcePath` | e.g. `android_native_dom`, `test_harness` |

**Lifecycle logs** (grep `SPEARHEAD_NFC_PIPELINE scan_`):

`scan_received` → `scan_enqueued` → `scan_dispatched` → (`scan_resolved` | `scan_committed` | `scan_rejected` | `scan_failed`)

**Guards**

- **UID fast-dedupe** (hardware double-fire): `scan_duplicate_suppressed` (separate from transaction idempotency).
- **Transaction idempotency**: ring buffer of recent `transactionId`; replay logs `SPEARHEAD_NFC_PIPELINE duplicate_transaction_suppressed` and skips execution.

**Test harness** (same path as native): `globalThis.__SPEARHEAD_TEST_SCAN__(uid, { burst, gapMs, delayMs, payload, sourcePath })`

**Persistence hooks** (no storage backend yet): `scanRuntimePersistence.js` — mirrors pending queue / recent tx ids for future crash recovery.

**Queue watchdog**: overlay shows oldest queued age, processing age, watchdog status; warnings log `SPEARHEAD_NFC_PIPELINE queue_watchdog_warning`.

---

## Cold-launch NFC (app not running)

**Goal:** tag scan that launches the app must not be lost between native queue and JS.

**Expected native log sequence (grep `SPEARHEAD_NFC_DIAG`):**

1. `phase=nfc_queued_waiting_for_runtime_ready` (if tag arrived before JS handshake)
2. `phase=plugin_notify_runtime_ready_called` → `phase=runtime_ready_callback_enter` → `phase=runtime_ready_confirmed`
3. `phase=flush_pending_enter` / `phase=flush_pending_nfc`
4. JS: `SPEARHEAD_NFC_PIPELINE` … `bridge_js_receipt` (or equivalent receipt path)
5. `SPEARHEAD_NFC_PIPELINE` … `dispatch` / `assignment` / `runtime` lines as applicable

**Device steps**

1. Fully close the app (swipe away from recents).
2. Present tag (or use launcher intent that carries NFC as configured).
3. Capture logcat for the prefixes above.

---

## Repeated scans / stress

Exercise:

- Same tag repeatedly (hardware often double-fires; JS mirrors a short dedupe window on enqueue).
- Different tags in quick succession.
- Scan while navigating UI.
- Scan during startup / resume.

**Watch**

- Heartbeat: queue depth stable (not runaway), `dup suppressed` only bumps on rapid same-UID re-fire.
- No duplicate entity activation for a single physical tap (store-level invariants).
- `SPEARHEAD_NFC_PIPELINE` lines remain one line per major step (enable verbose only when debugging).

---

## Diagnostics

| Always on | Opt-in (`__SPEARHEAD_NFC_VERBOSE_DIAG__ = true`) |
|------------|---------------------------------------------------|
| Heartbeat overlay (runtime ready, last receipt uid, queue depth, …) | `SPEARHEAD_ASSIGN_DIAG` style controller/bridge logs |

Native: keep essential `SPEARHEAD_NFC` / `SPEARHEAD_NFC_DIAG` phases for queue + flush; avoid dumping full `evaluateJavascript` bodies in routine gameplay.
