# Operator NFC assignment backup — format specification

**Frozen schema:** `schemaVersion: 1`  
**Module:** `src/services/operatorAssignmentBackup.js`

This file is the canonical reference for portable assignment backups (not full roster JSON).

## Top-level object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schemaVersion` | number | yes | Must be `1` for this revision. |
| `packageKey` | string | yes | Operator session key, e.g. `operator:aos:stormcast`. Imports must match the active session. |
| `rosterId` | string | yes | Stable slug for the list (derived from list name at export). |
| `rosterName` | string | no | Human-readable list title. |
| `exportedAt` | string (ISO 8601) | yes | UTC export timestamp. |
| `assignments` | array | yes | Rows to bind. |

## Assignment row

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entityId` | string | yes | Must match `runtimeRegistry.entities[].entityId` for import. |
| `uid` | string | yes | Physical tag UID; may contain separators; **normalized on import** (uppercase, strip `:-` and spaces). |

## UID normalization

All UIDs are compared and stored in **canonical form**:

- Uppercase  
- Remove spaces, hyphens, colons  

Example: `04:a2:24:b1:93:65:80` → `04A224B1936580`

## Import semantics

Implemented by `previewAssignmentBundleImport` + `importAssignmentBundle`:

| Mode | Behavior |
|------|----------|
| `merge_safe` | Apply rows only where the entity has **no** UID or the **same** UID. Skips conflicts. If nothing applies but conflicts exist, returns `NEEDS_OVERWRITE` with a user-visible hint. |
| `replace_all` | For every row targeting an entity in the current roster, **overwrite** that entity’s certificate with the backup UID. Does not delete assignments for entities absent from the file. |

**Unknown `entityId`:** skipped; counted as unknown in preview.

**`packageKey` mismatch:** import rejected (wrong session).

## Future versions

- Bump `OPERATOR_ASSIGNMENT_BACKUP_SCHEMA` / `SUPPORTED_ASSIGNMENT_BACKUP_SCHEMA_MAX` only with a migration note and loader tolerance.  
- Older apps must **reject** unknown higher `schemaVersion` (already enforced in `validateAssignmentBundle`).

## Large rosters (50–100+ units)

- Export/import are **O(n)** over entities and assignment rows.  
- Integrity deep scan is **O(n + m)** over entities and tag keys.  
- For performance regression testing, use the **release candidate checklist** (`docs/release-candidate-operator-checklist.md`) with a generated roster of the target size and repeat cold boot + validation scans.
