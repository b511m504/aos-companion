# Operator flow — state machine (release candidate)

This document describes **valid transitions** and **transient state** for the **operator NFC identity** workflow only. It does not cover legacy launcher browse or match runtime.

## Screens (nodes)

| Screen ID | Role |
|-----------|------|
| `operator-package` | Choose game |
| `operator-faction` | Choose faction |
| `roster-import` | Paste/upload roster JSON |
| `operator-overview` | Assignment counts, integrity, backup import/export |
| `nfc-assignment` | Pair tags to units (`appMode: nfc_assignment`) |
| `operator-validation` | Scan bases to verify bindings |

## App modes (orthogonal)

| `appMode` | Typical screens |
|-----------|------------------|
| `operator` | Package, faction, import, overview, validation |
| `nfc_assignment` | **Only** with `currentScreen === 'nfc-assignment'` |
| `selection-flow` / `runtime` | Legacy paths (out of scope here) |

**Invariant:** For operator packages (`selectedPackage` starts with `operator:`), `operator-validation` must **not** occur together with `nfc_assignment`. If it does, see internal log `SPEARHEAD_NFC_INVARIANT`.

## Valid transitions (directed)

Intended happy path:

```
operator-package
  → operator-faction
  → roster-import
  → operator-overview   (after successful import)
  → nfc-assignment      (via navigateNfcAssignment / “Assign NFC tags”)
  → operator-overview   (exit assignment, or “Overview”)
  → operator-validation (via “Validate tags”)
  → operator-overview   (Back)
```

Additional allowed moves:

- **Any operator screen** → `operator-package` / `operator-faction` / `roster-import` via explicit back actions (may reset roster context when re-importing).
- **overview** ↔ **nfc-assignment** ↔ **validation** freely while the same `selectedPackage` and `runtimeRegistry` remain loaded.
- **Session resume** (cold boot / `resumeLastSession`): may restore `currentScreen` to any of the operator set per `lastOperatorScreen` + snapshot rules (see `store.js` + `sessionSnapshot.js`).

## Transient UI state (cleared on navigation)

| State field | Cleared when |
|-------------|----------------|
| `operatorValidationResult`, `operatorUxPulse` | Leaving `operator-validation` (`setCurrentScreen`) |
| `operatorPendingClear` | Leaving `operator-overview` |
| `operatorBackupImportPreview` | Leaving `operator-overview` |
| `lastAssignmentResult`, `nfcStatus`, `nfcScanPhase` (assignment errors) | Leaving `nfc-assignment` screen (`setCurrentScreen` when exiting `nfc_assignment` mode) |
| `activeNfcConflict` | Leaving NFC assignment mode or runtime modes per existing rules |

**Exit NFC assignment** (`exitNfcAssignment`): also clears `lastAssignmentResult` and `nfcStatus` so reassignment prompts do not leak onto overview.

## NFC scan routing (exactly one intercept outcome)

Each hardware scan passes `interceptScan` **once**. Terminal outcomes:

| Route ID | Meaning |
|----------|---------|
| `runtime` | Match screen + runtime mode handled the scan |
| `validation` | Validation screen consumed the scan |
| `rejected_no_pair` | Assignment screen but no unit armed — scan ignored (handled) |
| `assignment_queue` | Scan passed through to **commit** path (handled: false → `createAssignment`) |
| `rejected_idle` | No consumer — idle reject |

Commit path (`commitAssignment`) is **not** a second intercept; it is the continuation for `assignment_queue` only.

Internal audit: `recordNfcInterceptRoute` (see `nfcInterceptAudit.js`). Duplicate `transactionId` in intercept logs `SPEARHEAD_NFC_INVARIANT`.

## NFC controller arming

`nfcController` assignment pairing (selected unit + waiting) is **not** store state. When leaving `nfc-assignment` for an operator session, **`renderInner`** detects the screen change and calls `nfcController.resetSelection()` so arming cannot survive unexpected navigation (e.g. `setCurrentScreen` without going through `exit-nfc-assignment`).

## Determinism notes

- **Hydration** uses `sanitizePersistedNfcBundle` then deterministic mirror rebuild (`buildAssignedTagsMirror`). Same snapshot + same code path → same `nfcAssignments` / `assignedTags` keys (normalized UIDs).
- **Backup import** never auto-destructs roster; merge modes are explicit (`merge_safe` vs `replace_all`).

## Freeze

Per release candidate policy, **do not extend** this graph without a versioned change and an update to this document.
