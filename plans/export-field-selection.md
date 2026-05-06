# Export Field Selection for Blob Storage Integration

## Goal

Let users choose which field groups to include in blob storage exports for the
`EVENTS` export source, reducing export size and avoiding transmission of
sensitive fields (e.g. `io`, `metadata`).

---

## Decisions Made

- **Scope:** EVENTS source only — traces/observations use hardcoded SQL with no
  group concept.
- **Feature flag:** No additional flag needed. The UI is implicitly gated by
  `isBetaEnabled && exportSource === "EVENTS"` — both conditions must already be
  true before a user can reach this field. The worker-side change (steps 2–3) is
  non-breaking by design (default = all groups = today's output).
  - Available mechanisms for reference: `User.featureFlags` (per-user, via
    `useIsFeatureEnabled()`), `v4BetaEnabled` (already gates this area),
    `LANGFUSE_ENABLE_*` env vars (global).
- **Storage:** `String[]` with default = all groups (matches existing pattern:
  `featureFlags`, `customModels`, `tags`, etc.).
- **Validation:** `z.array().min(1)` — empty selection is rejected at the form
  level. No "all" sentinel needed.
- **New groups:** Add `tools` and `trace_context` to cover all fields currently
  in the `export` field set that are not in any existing `OBSERVATION_FIELD_GROUPS`.
- **Column naming:** Keep `model_id` for blob export (matches DB column and
  existing consumer expectations). The `model` group in the query builder uses
  `internalModelId` → `internal_model_id`, so the blob export path uses a
  dedicated `model_export` field set variant with `modelId` → `model_id` instead.

---

## Final Field Group Layout

| Group | Fields | Status |
|---|---|---|
| `core` | id, traceId, startTime, endTime, projectId, parentObservationId, type | existing |
| `basic` | name, level, statusMessage, version, environment, bookmarked, public, userId, sessionId | existing |
| `time` | completionStartTime, createdAt, updatedAt | existing |
| `io` | input, output | existing |
| `metadata` | metadata | existing |
| `model` | providedModelName, modelId, modelParameters | existing (blob path uses `model_export` field set → `model_id` alias) |
| `usage` | usageDetails, costDetails, totalCost | existing |
| `prompt` | promptId, promptName, promptVersion | existing |
| `metrics` | latency, timeToFirstToken | existing |
| `tools` | toolDefinitions, toolCalls, toolCallNames | NEW |
| `trace_context` | tags, release, traceName, usagePricingTierName | NEW |

All 11 groups selected = exactly today's `export + selectIO(false) + metadata` output.

---

## Delivery Plan (4 PRs)

### PR 1 — Tests (no implementation changes)

Establish a regression baseline before touching any code.

**Test 1: `getEventsForBlobStorageExport` column contract**
- File: `worker/src/__tests__/batchExport.test.ts`
- Assert the **exact set** of output column names against the expected list of
  all 35+ columns (all 11 groups combined).
- Assert column types (string, number, boolean, object as appropriate).
- Assert representative values for a known fixture row.
- This test must pass now and must continue to pass after PR 3.

**Test 2: Public API v2 field group contract**
- File: `web/src/__tests__/server/observations-api-v2.servertest.ts`
- For each of the 9 existing groups, assert the **complete set** of fields
  returned when only that group is requested (no extras, no missing).
- Extends existing partial coverage; does not replace it.

---

### PR 2 — Database migration (no behavior change)

Add the column to Postgres and wire it through the tRPC layer so the value can
be stored, but do not expose it in the UI yet.

**Files:**
- `packages/shared/prisma/schema.prisma` — add field:
  ```prisma
  exportFieldGroups String[] @default(["core","basic","time","io","metadata","model","usage","prompt","metrics","tools","trace_context"]) @map("export_field_groups")
  ```
- `packages/shared/prisma/migrations/YYYYMMDD_.../migration.sql`:
  ```sql
  ALTER TABLE "blob_storage_integrations"
    ADD COLUMN "export_field_groups" TEXT[]
    NOT NULL DEFAULT ARRAY['core','basic','time','io','metadata','model','usage','prompt','metrics','tools','trace_context'];
  ```
- `web/src/features/blobstorage-integration/types.ts` — add to Zod schema:
  ```ts
  exportFieldGroups: z
    .array(z.enum(OBSERVATION_FIELD_GROUPS as [string, ...string[]]))
    .min(1, { message: "At least one field group must be selected" })
    .default([...OBSERVATION_FIELD_GROUPS]),
  ```
- `web/src/features/blobstorage-integration/blobstorage-integration-router.ts` —
  pass through in `update` mutation (same pattern as every other field).

**Verification:** `pnpm run db:generate`, lint, typecheck. No observable behavior change.

---

### PR 3 — Worker/query field group selection (behavior stays identical)

Wire field groups into the query. Default = all groups, so output is unchanged.
Tests from PR 1 confirm no regression.

**Files:**
- `packages/shared/src/server/queries/clickhouse-sql/event-query-builder.ts`:
  ```ts
  tools:         ["toolDefinitions", "toolCalls", "toolCallNames"],
  trace_context: ["tags", "release", "traceName", "usagePricingTierName"],
  model_export:  ["providedModelName", "modelId", "modelParameters"],
  ```
- `packages/shared/src/server/repositories/events.ts`:
  - Append `"tools"` and `"trace_context"` to `OBSERVATION_FIELD_GROUPS`.
  - Update `getEventsForBlobStorageExport` signature:
    ```ts
    function getEventsForBlobStorageExport(
      projectId: string,
      minTimestamp: Date,
      maxTimestamp: Date,
      fieldGroups: string[] = [...OBSERVATION_FIELD_GROUPS],
    )
    ```
  - Replace hardcoded `.selectFieldSet("export").selectIO(false).selectFieldSet("metadata")`
    with a loop over `fieldGroups`, with two special cases:
    - `"io"` → `.selectIO(false)` (preserves full I/O, no truncation)
    - `"model"` → `.selectFieldSet("model_export")` (keeps `model_id` alias)
- `worker/src/features/blobstorage/handleBlobStorageIntegrationProjectJob.ts`:
  - Add `exportFieldGroups` to `executionConfig`.
  - Pass to `getEventsForBlobStorageExport` for `table: "observations_v2"` only.
  - Fall back to `[...OBSERVATION_FIELD_GROUPS]` when value is null (pre-migration rows).

**New tests** (add to `blobStorageIntegrationProcessing.test.ts`):
- All groups selected → output column set matches PR 1 baseline exactly.
- Subset selected (e.g., `["core", "io"]`) → only those columns present.

---

### PR 4 — UI exposure

Add the multi-checkbox field to the settings form.

**Files:**
- `packages/shared/src/features/analytics-integrations/index.ts` — add
  `EXPORT_FIELD_GROUP_OPTIONS` constant (parallel to `EXPORT_SOURCE_OPTIONS`),
  one entry per group with `value`, `label`, and `description` (column list).
- `web/src/pages/project/[projectId]/settings/integrations/blobstorage.tsx`:
  - Add `exportFieldGroups` `FormField` rendered only when
    `isBetaEnabled && watchedExportSource === "EVENTS"`.
  - Multi-checkbox using `EXPORT_FIELD_GROUP_OPTIONS`.
  - Default: all 11 groups checked (preserves existing behavior on first load).

**New tests:**
- Unit: form submits correct `exportFieldGroups` value when a subset is checked.
- Unit: form rejects submission when zero groups are checked.
- Integration: tRPC `update` stores the value; subsequent `get` returns it.

---

## Definition of Done (applies to every PR)

After each PR, before marking it complete:

1. **Tests** — run the tests relevant to the changed packages:
   - `pnpm --filter worker vitest run` for worker changes
   - `pnpm --filter web vitest run` for web changes
   - `pnpm --filter @langfuse/shared vitest run` for shared changes
2. **Format** — `npx prettier --write <changed files>` then verify no diff remains.
3. **Lint** — `pnpm --filter <package> run lint` for each changed package; zero warnings.
4. **Typecheck** — `pnpm --filter <package> run typecheck` for each changed package.
5. **Code review** — review every changed file from the perspective of a code reviewer:
   - No unintended side effects or scope creep
   - Consistent with surrounding code style and patterns
   - No dead code, leftover debug statements, or stray comments
   - Public API / exported types are intentional and minimal
   - **Test coverage**: do the tests actually fail if the behaviour they guard breaks?
   - **Backwards compatibility**: could any change break existing consumers of the blob export or the public API v2?

---

## Key Reuse

- `OBSERVATION_FIELD_GROUPS` (`events.ts:840`) — source of truth, extended with 2 new groups
- `EXPORT_SOURCE_OPTIONS` pattern (`analytics-integrations/index.ts`) — copy for `EXPORT_FIELD_GROUP_OPTIONS`
- `z.array().min(1, { message })` — established pattern (`annotation/types.ts:87`)
- `getObservationsV2FromEventsTableForPublicApi` (`events.ts:1128`) — precedent for field-group-parameterised events query