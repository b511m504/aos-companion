# NFC Tabletop Companion — Architecture (internal)

This document describes the **identity assignment** layer: NFC reads, the assignment registry, persistence, and JSON content. It intentionally excludes gameplay engines, networking, and combat logic.

## Layer separation

| Layer | Responsibility |
|--------|----------------|
| **UI** (`screens/`, `components/`) | Navigation, operational clarity, touch-first layout. Never imports Capacitor NFC plugins. |
| **NFC** (`services/NFCManager.ts`) | Native vs simulated reads, scan state machine, debounce, hardware errors. |
| **Assignment logic** (`services/AssignmentRegistry.ts`, `TagConflictResolver.ts`, `assignmentValidation.ts`, `AssignmentBundleService.ts`) | Invariants, conflicts, import/export, validation. |
| **Persistence** (`storage/PersistenceLayer.ts`, `store/persistenceSingleton.ts`) | Durable snapshots; swappable backend (`localStorage` today). |
| **Content** (`loaders/ContentLoader.ts`, `public/content/`) | JSON packages with `schemaVersion`, manifests, and cross-reference checks. |

## NFC flow

1. User selects an **entity** (stable `entityId` from roster JSON).
2. User **arms** the scanner → `NFCManager.startListening()` enters `arming` → `scanning` (native attaches listeners + `startScan` on iOS).
3. A tag read produces a **raw UID** → normalized (`utils/uid.ts`) → duplicate suppression via **debounce window** (default 1500 ms).
4. `useNfcScanBridge` forwards UID to the store **only while `awaitingScan`** (guards accidental applies).
5. Store runs **conflict check** (`TagConflictResolver`) against `AssignmentRegistry`; on success **upsert** + **persist**; on UID collision opens **conflict UI** (cancel / reassign / view owner).
6. `NFCManager` scan states: `idle` → `arming` → `scanning` → (`success` | `cooldown` | `error`) → back toward `scanning` or `idle` when disarmed.

Hardware failures set `NfcHardwareError` (typed codes) and transition to `error` when valid; repeated errors while already in `error` refresh the message without invalid transitions.

## Assignment lifecycle

- **Create / update**: `AssignmentRegistry.upsert` enforces normalized UID, validates shape, maintains **one entity ↔ one UID** maps.
- **Remove**: `removeByEntity` clears both indexes.
- **Load**: `validateRawAssignmentList` rejects contradictory persisted batches (same UID → multiple entities in one blob). Empty load + `sessionWarning` if corrupt.
- **Save**: `persistAssignments` refuses corrupt snapshots (raw + integrity).

Full **export/import** uses `AssignmentBundleService`: parse JSON → **preview** (per-row status) → **strict** (all-or-nothing) or **safe_partial** (skip rows that would steal a UID already bound elsewhere).

## Registry invariants

`validateRegistryIntegrity` reports:

- Duplicate UIDs or duplicate entities in the materialized maps.
- Malformed records (invalid UID, empty entity id, etc.).
- Optional **orphan** detection when `allowedEntityIds` is provided (assignment not in current roster).

`validateRawAssignmentList` catches **batch contradictions** before merge (import file or persistence healing).

## JSON hierarchy

- `content/catalog.json` — `schemaVersion: 1`, `systemRefs[]`.
- `content/systems/*.json` — system metadata + `factionsPath`.
- `content/factions/*.json` — `package` manifest (`packageType`, `systemId`, `factionId` or `*` for multi-faction index) + `factions[]`.
- `content/lists/*.json` — `package` manifest + `lists[]` (each list: `id`, `factionId`, `units[]` with unique `unit.id`).

Loaders return `LoadResult<T>` so the UI can show **errors without throwing**.

## Persistence abstraction

- `PersistenceLayer` exposes `load` / `save` / `clearAll` / `backendId`.
- Snapshots: `{ schemaVersion: 1, bundles: [{ listId, assignments }] }`.
- Future: IndexedDB/SQLite adapters implement the same interface; bump `schemaVersion` on breaking changes.

## Future extension points

- **Gameplay / event engine**: consume `Assignment` + entity id; do not write around the registry—dispatch through explicit actions.
- **Cloud sync**: merge bundles with the same preview/strict rules; never blind overwrite.
- **Marketplace packages**: additional `packageType` values + signing (out of scope here).

## Dev / scaling utilities

`utils/devTesting.ts` — random UID generation, bulk random assignments, mock bundle JSON, registry stress iterations (used from Settings for smoke tests).
