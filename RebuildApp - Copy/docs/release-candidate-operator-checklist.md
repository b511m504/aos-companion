# Release candidate checklist — operator identity layer

Use this for **manual** verification before tagging a build as RC. All items assume an **operator:** session with an imported roster.

## Core flows

- [ ] **Cold boot restore** — assign tags, kill app, relaunch; assignments and screen resume match last snapshot.
- [ ] **Suspend / resume** — background app, return; no duplicate assignments from a single physical tap; metrics `resumeNotifyCount` increments (diagnostics only).
- [ ] **Backup export** — JSON opens; `schemaVersion === 1`; UIDs normalized; `packageKey` matches session.
- [ ] **Backup import (merge safe)** — partial apply; conflicts skipped unless user chooses replace.
- [ ] **Backup import (replace conflicting)** — overwrites differing UIDs as expected.
- [ ] **Corrupted backup** — invalid JSON / wrong shape → readable error banner, no crash.
- [ ] **Hydration warning** — inject malformed UID in snapshot (dev); app shows dismissible warning and stays usable.

## NFC behavior

- [ ] **Duplicate reassignment** — tag on unit A, assign to B → prompt; Cancel clears; Reassign moves link and persists.
- [ ] **Validation mode** — known tag shows unit; unknown shows unassigned; duplicate UID in data shows conflict.
- [ ] **Rapid scans** — tap same tag repeatedly on assignment (<500 ms); lock/bounce metrics move; no double-bind.
- [ ] **Intercept routing** — in devtools (dev build), confirm each scan logs a single `SPEARHEAD_NFC_ROUTE` line from intercept (runtime / validation / assignment_queue / rejected_* ).

## UI / integrity

- [ ] **Overview integrity** — healthy / warnings / conflicts matches deep validation state after edits.
- [ ] **Leaving assignment** — no “arming” stuck after navigating away without Back (e.g. programmatic screen change).

## Diagnostics

- [ ] **Long-press version** in operator session bar exports JSON.
- [ ] **Export payload** — no raw backup `bundle`, no full `userAgent` string (only `userAgentPresent` + viewport).
- [ ] **Export read-only** — export does not change roster or assignments (spot-check counts before/after).

## Large roster spot-check (optional but recommended)

- [ ] **50–100 entities** — scroll overview; validation scans remain responsive; export file size acceptable.

## Sign-off

| Date | Tester | Build id | Notes |
|------|--------|----------|-------|
| | | | |
