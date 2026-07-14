# App-root default filter for the v4 events table

## Status

Implemented on 2026-07-14. See `## IMPLEMENTATION` for the concrete choices and
verification status.

## Summary

The v4 events table used by both `/traces` and `/observations` should default to
the following explicit filter when the project's active Langfuse SDKs support
app-root detection:

```text
isRootObservation = true
```

The filter may be applied when all of the following are true:

1. Fast Preview/v4 is enabled.
2. The normal v4 events table owns its filter state. Instances receiving
   externally controlled filter state must not overwrite that state.
3. No explicit URL or saved view defines the complete filter state.
4. The user has not previously overridden this default.
5. A positive project capability is already cached, or the SDK detection query
   completes successfully and proves app-root support.

On the first visit without a cached positive capability, load the normal
unfiltered table and the SDK detection query in parallel. If detection proves
support, persist the positive result and apply the root filter. This intentionally
causes one additional events query and one visible transition on that first
supported visit. Detection failures must leave the current table unfiltered.

On later visits, use the cached positive capability immediately. Positive
capability has no expiry: once a project is proven compatible, this design
assumes its SDKs will not be downgraded.

If an auto-applied root filter returns no rows, retry the same query once
without that filter. When the retry returns rows, show those rows and remove
the auto-applied filter. For an otherwise neutral, recent table query, also
delete the project capability cache so the next visit detects capability
again. This fallback must never remove a user-authored, URL, or saved-view
filter.

The existing root predicate is defined in
[`packages/shared/src/eventsTable.ts`](../packages/shared/src/eventsTable.ts):

```sql
e.parent_span_id = '' OR e.is_app_root = true
```

## Why SDK versions gate the default

The exact minimum versions correspond to the introduction of app-root
detection:

- [JavaScript/TypeScript SDK v5.4.0](https://github.com/langfuse/langfuse-js/releases/tag/v5.4.0)
- [Python SDK v4.7.0](https://github.com/langfuse/langfuse-python/releases/tag/v4.7.0)

The [Python app-root design](https://github.com/langfuse/langfuse-python/pull/1651)
explains why this capability allows the v4 table to show one useful root per
trace even when a non-exported parent exists.

Older SDKs remain compatible with ingestion, but applying the root filter by
default could hide traces whose exported observations cannot be identified as
application roots.

## SDK detection

### Classify individual SDK versions

Langfuse already persists these request headers at ingestion time:

- `x-langfuse-sdk-name`
- `x-langfuse-sdk-version`
- ingestion API key

The current normalization and attribution logic lives in
[`packages/shared/src/server/ingestion/ingestionAttribution.ts`](../packages/shared/src/server/ingestion/ingestionAttribution.ts).

Classify the existing SDK result on the frontend:

```text
javascript >= 5.4.0
python     >= 4.7.0
```

Classification rules:

- Start with the SDK-emitted header values `javascript` and `python`.
- Add another alias only when its package version is proven to represent the
  same app-root capability threshold. Do not automatically reuse every alias
  from the latest-major classifier.
- Unknown SDK names and raw OTel attribution fail closed.
- Versions newer than the threshold are supported.
- Build metadata, for example `5.4.0+build`, compares as `5.4.0`.
- Prereleases at the threshold fail closed. For example, `5.4.0-rc.1` and
  `4.7.0rc1` are below the corresponding stable version.
- Do not reuse `extractBaseIngestionSdkVersion` unchanged. It currently strips
  prerelease markers, which would make a release candidate look stable.

### Define project-level eligibility

The existing
[`getLatestSdkVersionInfoFromEvents`](../packages/shared/src/server/repositories/events.ts)
query returns the newest attributed OTel event from the past seven days. It is
cheap and reusable, but it only answers:

> Does the single newest event appear to use a supported SDK?

It does not answer:

> Are all currently active ingestion streams compatible?

This distinction matters for projects with multiple applications or SDKs. For
example, if one service uses JavaScript 5.4 and another still uses 5.3, the
single newest event can produce either result depending on which service sent
it. The query also orders by observation `start_time`, not ingestion arrival
time, so backfills and user-provided timestamps can distort the result.

### Detection alternatives

| Approach                                        | Correctness               | Query cost       | Assessment                                              |
| ----------------------------------------------- | ------------------------- | ---------------- | ------------------------------------------------------- |
| Newest event in seven days                      | Weak for mixed projects   | Low              | Acceptable only for an initial guarded rollout          |
| Latest N events                                 | Better but not exhaustive | Bounded          | High-volume services can mask low-volume services       |
| Group raw events by SDK/version over seven days | Strong                    | Potentially high | Fallback only; can run in parallel but must be measured |
| Materialized active-SDK summary                 | Strong                    | Low read cost    | Preferred long-term solution                            |

For strict detection, maintain a small ClickHouse aggregate with dimensions
approximately like:

```text
project_id
seen_date
ingestion_sdk_name
ingestion_sdk_version
ingestion_api_key
last_seen_state AggregateFunction(max, DateTime64(...))
```

Use ingestion `created_at` for `seen_date` and `last_seen_state`, not
observation `start_time`. The materialized view should write
`maxState(created_at)` and the capability query should read it with
`maxMerge(...)`. `last_seen_at` must not be part of the ordering/grouping key.
The target ordering key should start with `project_id` and `seen_date`, which
match the capability query's filters, and place the higher-cardinality API key
last.

The aggregate must use `events_core` only, without `FINAL` and without scores.
An incremental materialized view only receives new inserts, so rollout requires
an explicit historical backfill. Start without partitioning unless the table
needs time-based retention; if retention is required, use bounded monthly
partitions rather than project- or day-level partitions.

The project is eligible when:

- At least one attributed SDK version was observed in the activity window.
- Every version active in that window is recognized and supported.
- No active unattributed or raw OTel version exists.

A seven-day activity window is conservative and matches the current endpoint.
It also means eligibility may take seven days after the final old-SDK event. A
shorter window activates the default faster but can miss low-volume services.
Start with seven days unless product data shows the delay is unacceptable.

The implementation accepts the newest-event approximation and permanently
caches a positive result. This can misclassify mixed-SDK projects, but avoids a
new grouped ClickHouse query. The one-shot empty-result fallback removes both
the filter and cache when that approximation visibly hides rows.

## Sticky default behavior

The root filter should be inserted into explicit filter state:

```ts
{
  column: "isRootObservation",
  type: "boolean",
  operator: "=",
  value: true,
}
```

This makes the active query visible and editable in the filter sidebar and
search grammar. Saved views and shared URLs also reflect the actual filter.

Do not implement the root default like the current implicit environment
default. Once a user removes an implicit filter, an empty explicit state is
indistinguishable from a state that has never received the default. Reapplying
whenever the filter is missing would continually reset the user's choice.

### Persisted browser state

Persist two independent markers:

```text
events-app-root-capability:v1:<projectId> = supported
events-app-root-default:v1:<userId>:<projectId> = auto | suppressed
```

Behavior:

- A missing capability key means “unknown”, not “unsupported”. Run detection in
  parallel with the normal table.
- A supported result writes the project-scoped capability key permanently.
  Unsupported, unknown, mixed, and errored results are never persisted, so a
  later SDK upgrade can be detected.
- A present capability key applies the default immediately on future neutral
  visits. It has no TTL and is not revalidated.
- A qualifying empty-result fallback deletes the capability key. The missing
  key becomes unknown again and allows detection on the next visit.
- When the user removes the auto-applied filter, changes it to false, or clears
  all filters, persist `suppressed` in the user/project key.
- `auto` records provenance for an applied default. It lets a later user removal
  remain sticky after refresh without treating saved-view-owned filters as the
  default.
- Selecting or automatically applying a saved view without the root filter
  does not persist suppression. The view owns the current state only.
- A present suppression key prevents automatic insertion for policy version
  `v1`.
- A manually added root filter continues to work, but does not need to clear
  `suppressed`.
- A future explicit “Reset table defaults” action may clear the marker.

Storage trade-offs:

| Storage             | Benefit                                                         | Cost                                     |
| ------------------- | --------------------------------------------------------------- | ---------------------------------------- |
| `sessionStorage`    | Simple and aligned with current filter persistence              | Default returns in a new browser session |
| `localStorage`      | Durable per user, project, and device without a database change | Does not follow the user across devices  |
| Database preference | Durable across devices                                          | Requires schema/API/write-path changes   |

`localStorage` is the recommended initial implementation. Capability is shared
by project because SDK support is a project property. Suppression also includes
`userId` because it is a user preference. Project IDs occur in both keys to
prevent state leaking between projects. The policy version allows an
intentional future behavior change without rewriting version `v1`.

### Source-aware state changes

The SDK result may arrive after the table has rendered. Handle it as a named,
one-shot query-success action, not as a general effect that keeps merging the
root filter whenever it is absent. Before applying the late result, re-check
current URL/view ownership, suppression, and whether the user has edited table
filters since detection started. Cache a recognized supported result even when the
filter is no longer applied: project capability and current table ownership are
separate decisions.

Use explicit action origins:

```text
system_default
system_empty_fallback
url_restore
session_restore
saved_view_apply
user_edit
```

Only `system_default` may insert the filter. `system_empty_fallback` may remove
only the filter previously inserted by `system_default`; it must not mark the
preference as suppressed. Only a user-originated removal or change of the
auto-applied root filter may mark it `suppressed`. Saved views win for the
current table without changing the sticky preference.

### Empty-result fallback

An SDK version proves that new observations can carry app-root attribution, but
the current table range can still contain no matching roots. The table must not
remain empty when removing only the system default would reveal observations.

When the settled, non-placeholder first-page query containing the
system-applied root filter returns zero rows:

1. Retry exactly once with the same project, time range, search, ordering, and
   user filters, but without the system-applied root filter.
2. If the retry also returns zero rows, keep the root filter and the capability
   cache unchanged.
3. If the retry errors, use normal query error handling and change neither the
   filter nor either browser marker.
4. If the retry returns rows, display them and remove the system-applied root
   filter from explicit filter state.
5. Do not write the user suppression key. This is a system fallback, not a user
   preference.
6. Prevent an in-flight SDK result from reapplying the filter during the same
   mounted table lifecycle.

Delete `events-app-root-capability:v1:<projectId>` only when the query is a
valid project-level cache check: the normal full-page table, no saved/default
view, no user filter or search beyond the system root filter, and a recent time
range covered by the SDK activity window. A custom filter or historical range
can legitimately contain child observations but no roots; in that case remove
the root filter for the current table state without invalidating project-wide
capability.

Never run this fallback for a root filter supplied by the user, an explicit
URL, or a saved view. Track a one-shot attempt for the current query state so
the fallback cannot loop.

## Initialization precedence

```text
Not the v4 events table, or filter state is externally controlled?
  -> no default

Explicit URL table state?
  -> URL wins

Saved/default view?
  -> saved view wins

Restored session state?
  -> restore it, then continue evaluating the sticky marker and SDK capability

User/project suppression key exists?
  -> no default

Positive project capability is cached?
  -> insert isRootObservation=true during neutral table initialization

No positive capability is cached?
  -> render the normal table and run SDK detection in parallel

Detection proves support and the table is still eligible for defaulting?
  -> cache support and insert isRootObservation=true

Detection is unsupported, mixed, unknown, or errored?
  -> keep the normal table and persist no capability result

System-applied root query returns zero rows?
  -> retry once without only the root filter

Retry returns rows and is a neutral, recent capability check?
  -> show unfiltered rows, remove the root filter, and delete capability cache

Retry returns rows but the table has custom state or a historical range?
  -> show unfiltered rows and remove the root filter for this state only
```

The existing saved-view manager already treats explicit URL table state as
authoritative. Router, persisted filter, and saved-view initialization must
settle before a cached capability applies a filter or a late detection result
mutates the table. The events query itself does not wait for SDK detection.
Ordinary restored session filters may be combined with
`isRootObservation = true` unless the user previously suppressed the default.

An explicit URL or saved view without the root filter must not be mutated. A
URL carrying explicit table state reproduces that state. A clean URL with no
table-state parameters is a neutral visit and therefore uses the recipient's
cached capability and sticky preference.

## Shared v4 table identity

The v4 `/traces` and `/observations` pages currently mount the same
`EventsTable` component and use the same table identity and project-only
session-filter context:

- [`web/src/pages/project/[projectId]/traces/index.tsx`](../web/src/pages/project/[projectId]/traces/index.tsx)
- [`web/src/pages/project/[projectId]/observations/index.tsx`](../web/src/pages/project/[projectId]/observations/index.tsx)
- [`web/src/features/events/components/EventsTable.tsx`](../web/src/features/events/components/EventsTable.tsx)

This sharing is intentional. The default, sticky preference, explicit filter
state, and session persistence must behave identically on both routes. Do not
introduce a `traces` versus `observations` surface distinction or separate
their persistence keys.

The relevant boundary is filter ownership rather than route identity. The two
main routes should explicitly pass that Fast Preview is enabled. The table may
default only on the normal full-page surface:

```text
!hideControls && !externalFilterState && !peekContext && !userId && !sessionId
```

This explicit v4 signal is required because other routes can mount
`EventsTable` directly. Controlled, peek, and embedded instances must preserve
their supplied/page-scoped state and never synthesize the default.

Fast Preview should continue to be gated by `session.user.v4BetaEnabled` via
`useV4Beta`. `canToggleV4` controls toggle visibility and must not be used as
the read-path eligibility signal.

## ClickHouse performance

The root predicate is not aligned with the events table ordering key:

```text
ORDER BY (
  project_id,
  toStartOfMinute(start_time),
  xxHash32(trace_id),
  span_id,
  start_time
)
```

Consequences:

- Project and time-range primary-key pruning remains effective.
- `parent_span_id` and `is_app_root` are evaluated after candidate ranges are
  read.
- A paginated list query may need to read more observations to find one page of
  roots.
- When the user selects all matching rows, the resulting exact count must scan
  all candidate rows in the project/time range and read the predicate columns.
- A boolean skip index is unlikely to help when roots and children are
  interleaved. The `OR` predicate further reduces skipping effectiveness.
- SDK capability must not be joined into every event list/count query. Fetch it
  independently and cache it.

The permanent positive browser cache is independent from React Query. When it
is absent, deduplicate the in-flight SDK query, but do not run it for
pagination, normal table refreshes, or time-range changes. Once positive
support is persisted, skip future SDK queries for that project.

The empty-result fallback adds at most one events query for a given query
state, and only after the root-filtered query returns zero rows. It must reuse
the same project/time predicates and all non-root filters. Measure how often it
runs and how often it invalidates a positive capability cache.

ClickHouse rules considered:

- [`schema-pk-filter-on-orderby`](../.agents/skills/clickhouse-best-practices/rules/schema-pk-filter-on-orderby.md): retain project and time predicates so
  primary-key pruning remains effective.
- [`query-index-skipping-indices`](../.agents/skills/clickhouse-best-practices/rules/query-index-skipping-indices.md): benchmark before adding a low-cardinality
  index.
- [`query-mv-incremental`](../.agents/skills/clickhouse-best-practices/rules/query-mv-incremental.md): use aggregate states and explicitly backfill
  historical rows.
- [`schema-pk-cardinality-order`](../.agents/skills/clickhouse-best-practices/rules/schema-pk-cardinality-order.md) and
  [`schema-pk-prioritize-filters`](../.agents/skills/clickhouse-best-practices/rules/schema-pk-prioritize-filters.md): order the summary around its project/date
  lookup and keep the high-cardinality API key last.
- [`query-join-consider-alternatives`](../.agents/skills/clickhouse-best-practices/rules/query-join-consider-alternatives.md): use the independent summary query rather than
  joining eligibility into the events query.

Before rollout, benchmark root-filtered list and count queries using
`EXPLAIN indexes = 1` and `system.query_log`. Compare at least:

- Small and large projects.
- Short and long table time ranges.
- Root filtering enabled and disabled.
- Read rows, read bytes, duration, and p95 latency.

Do not add a skip index until these measurements demonstrate useful granule
elimination.

## Implementation plan

1. Add the pure frontend app-root version classifier and version-matrix tests.
2. Reuse the project-authorized `events.getSdkVersionInfo` query.
3. Add the project-scoped positive capability cache and user/project
   suppression marker.
4. Start uncached SDK detection in parallel with the normal events query. Apply
   a successful late result only if the table still has no conflicting owner or
   user interaction.
5. Add the one-shot empty-result fallback. Remove only a system-applied root
   filter and invalidate the project capability cache only for neutral, recent
   checks.
6. Add source-aware filter actions so only user changes suppress the default.
7. Preserve the shared v4 table identity and persistence across `/traces` and
   `/observations`.
8. Roll out behind the existing v4 gate.
9. Benchmark the first-visit refetch, empty-result fallback, and affected
   ClickHouse list/count queries.

## Test plan

### SDK classifier

- JavaScript/TypeScript `5.4.0`, versions below it, and future versions.
- Python `4.7.0`, versions below it, and future versions.
- Supported emitted SDK names and explicitly approved aliases.
- `v` prefixes and build metadata.
- SemVer and PEP 440 prereleases.
- Unknown names, missing versions, and invalid versions.

### Project capability

- No recent OTel events.
- Supported JavaScript only.
- Supported Python only.
- Unsupported JavaScript or Python.
- Raw OTel and missing attribution.
- Latest event from a mixed project is supported or unsupported.
- SDK upgrade changes which version is the latest event.
- Detection query failure.
- Only a recognized supported latest-event result is cached.

### Default-resolution state

- v3/Fast Preview disabled.
- Both `/traces` and `/observations` use the same default and persisted state.
- Externally controlled filter state is never overwritten.
- Explicit URL filter state.
- Restored session filter state receives the default when it is not suppressed.
- Selected and default saved views.
- Supported, unsupported, unknown, mixed, and errored SDK capability.
- First uncached visit renders normally while SDK detection runs, then applies
  the root filter after a supported result.
- Positive capability persists without expiry and skips future SDK queries.
- Unsupported, mixed, unknown, and errored results are not persisted.
- A user edit while first-time detection is pending prevents a late mutation
  for that mount.
- User removal survives rerenders, navigation, and browser refresh.
- Clear-all and changing the root filter to false suppress the default.
- Saved-view application does not persist suppression.
- User, project, and policy-version isolation.
- Auto-applied root query returns rows and does not trigger the fallback.
- Auto-applied root query and the one unfiltered retry both return zero.
- Placeholder data and later pages do not trigger the fallback.
- An errored unfiltered retry changes neither browser marker nor filter state.
- Unfiltered retry returns rows, removes the system root filter, and does not
  write user suppression.
- A neutral, recent fallback deletes the project capability cache.
- A custom-filter or historical fallback does not delete project capability.
- User-, URL-, and saved-view-authored root filters never trigger the fallback.
- An in-flight SDK result cannot reapply the filter after fallback in the same
  mount.
- The fallback runs at most once for the current query state.

### Browser verification

Use the seed CLI to create supported, unsupported, and mixed-SDK states. Extend
an existing seeder scenario if SDK attribution cannot currently express those
states; do not use ad hoc ClickHouse inserts.

Verify in a real browser that:

- Eligible uncached first visits initially display the normal table and then
  transition to a visible root filter.
- A later visit to the same project applies the root filter immediately without
  another SDK query.
- Ineligible projects show all observations.
- A cached project with no matching roots falls back to observations after one
  unfiltered retry.
- A qualifying fallback removes the project capability cache, so the next visit
  runs SDK detection again.
- Removing the filter remains sticky after refresh.
- Saved views and shared URLs are not overwritten.
- `/traces` and `/observations` show the same default and sticky behavior.

## Rollout and observability

Roll out behind a feature flag. Record only privacy-safe classification results
and action reasons, such as:

```text
auto_applied
capability_cache_hit
capability_detected
empty_root_fallback
capability_cache_invalidated
user_suppressed
unsupported_version
mixed_versions
unknown_sdk
no_recent_evidence
detection_error
blocked_by_url_state
blocked_by_saved_view
```

Do not capture raw SDK headers or filter contents in analytics. Monitor:

- Fraction of v4 projects considered eligible.
- Mixed-version and unknown-attribution rates.
- How often users remove the auto-applied filter.
- How often empty-root fallback runs and invalidates a capability cache.
- Eligibility-query latency and ClickHouse read volume.
- Trace list/count latency before and after rollout.

High suppression rates or reports of missing traces should pause broader
rollout and trigger review of the detection window and mixed-SDK policy.

## IMPLEMENTATION

Implemented on 2026-07-14.

### SDK detection

- Reused the existing project-authorized `events.getSdkVersionInfo` query and
  `getLatestSdkVersionInfoFromEvents` repository function. No new server query,
  endpoint, migration, materialized view, join, or index was added.
- The frontend reuses the shared ingestion SDK-name normalizer, then accepts
  only stable JavaScript/TypeScript `>= 5.4.0` or Python `>= 4.7.0`.
  Recognized package aliases such as `@langfuse/tracing` work; unknown,
  missing, invalid, prerelease, and raw OTel results fail closed.
- This query checks the newest attributed OTel event in seven days, not every
  active SDK stream. The empty-result fallback is the runtime safety net for a
  stale or mixed-project positive.

### Client

- All product decisions now live in the pure
  `web/src/features/events/lib/appRootDefaultPolicy.ts` module: SDK thresholds,
  URL/view/user ownership, capability caching, default application,
  suppression, fallback triggering, filter removal, and cache invalidation.
  React, tRPC, router, and browser-storage code only gather inputs and execute
  the returned decisions.
- One explicit owner state (`pending`, `neutral`, `url`, `saved_view`, `user`,
  or `fallback`) replaces the previous collection of blocking booleans.
- The main v4 `/traces` and `/observations` routes explicitly enable the
  behavior on their shared `EventsTable`. Other direct, controlled, peek,
  user, and session table instances cannot enable it accidentally.
- No second rollout flag was added; the existing Fast Preview/v4 gate plus the
  explicit table prop is the rollout boundary requested for this feature.
- The normal table query and uncached SDK query run independently. A
  supported result is cached permanently under the project-scoped localStorage
  key; unsupported/error results are not persisted. React Query deduplicates
  negative checks for five minutes.
- The root default is derived into explicit filter state, so it is visible to
  the sidebar/search grammar without copying fetched data into React state.
  Existing URL state and saved/default views keep precedence.
- The user/project preference stores `auto` provenance or `suppressed`. User
  removal/disable/clear writes `suppressed`; saved-view and system fallback
  changes do not.
- localStorage is read through `useSyncExternalStore`, including same-tab and
  cross-tab updates. Both keys include `projectId`; the preference also includes
  `userId`.
- The policy hook resets its project-scoped owner state when `projectId`
  changes, so client-side navigation needs no route-level remount key.
- No new PostHog event is emitted for programmatic apply/fallback actions;
  existing filter analytics continue to represent user actions only.

### Empty result fallback

- The table no longer owns an inline fallback workflow. A narrow adapter hook
  executes the pure fallback decision and writes the resulting URL/storage
  changes; the data hook only reports whether the retry found additional rows.
- A settled non-placeholder first page with a currently auto-managed root
  filter runs one unfiltered retry for that query key.
- If the retry finds rows, those rows are shown and only the auto root filter is
  removed with replace-history semantics. No user suppression is written.
- If the retry fails, the successful empty root result remains visible; the
  safety probe does not replace the table with its error.
- The permanent capability key is removed only for a neutral, recent query
  (system root only, no search, range within the seven-day proof window and
  ending near now). Custom and historical queries keep project capability.
- Capability invalidation also resets the matching SDK query cache, preventing
  a cached positive result from restoring localStorage on remount.
- User-, URL-, and saved-view-owned root filters never trigger the fallback.

### Query performance

- Capability detection stays separate from list/count queries and runs only
  while the permanent positive cache is absent. Pagination, table refresh, and
  date-range changes do not create new capability queries.
- Detection reuses the existing bounded, `LIMIT 1` SDK lookup. The previous
  grouped SDK/version scan was removed.
- The row fallback adds at most one list query per root-filtered query key and
  only after an empty first page.

### Tests and checks

- Focused SDK matrix, lifecycle, saved-view null-sentinel, client default
  integration, and fallback regressions: 25 tests passed.
- Web lint passed with zero warnings.
- Full web typecheck remains blocked by unrelated,
  pre-existing untracked observation-I/O-parser errors; it reported no errors
  in the files changed for this feature.
- Browser review reached the local app but redirected to `/auth/sign-in`, so UI
  signoff was blocked by authentication rather than treated as passed.
