# Topics worker

Topics turns v4 traces into facet summaries, embeddings and topic assignments. The [web README](../../../../web/src/features/topics/README.md) covers the UI and access checks. This file covers worker lifecycle and recovery.

## Entry points

- [processTopicsExecution.ts](processTopicsExecution.ts): manual processing and topic updates.
- [summarizeAssembledTrace.ts](summarizeAssembledTrace.ts): shared facet extraction and automatic processing of an already assembled transcript.
- [topicsAutomation.ts](topicsAutomation.ts): online assignment to a facet's serving map.
- [nightlyRefit.ts](nightlyRefit.ts): daily scheduling of each rule's continuous map.
- [models.ts](models.ts): model requests, token budgets, naming and cost estimates.
- [numeric.ts](numeric.ts), [classifier.ts](classifier.ts), [continuity.ts](continuity.ts): fitting, membership and topic identity.
- [shared Topics](../../../../packages/shared/src/server/topics/): configuration, persistence, queue contracts and paid-result staging.

## Enablement and models

Topics requires `LANGFUSE_TOPICS_ENABLED=true` and a cloud region (`NEXT_PUBLIC_LANGFUSE_CLOUD_REGION`; `DEV` locally). Read access, configuration and processing also require the project in `LANGFUSE_TOPICS_ENABLED_PROJECT_IDS`. Keep web and worker configuration aligned. An empty allowlist disables Topics access for all projects. Trace and project deletion clean Topics data independently of these gates.

Use the normal migrated Postgres, ClickHouse and Redis stack and build shared and `@langfuse/native` before starting the worker. Automatic intake additionally needs the [trace-batch dispatcher and consumer](../traceBatching/README.md). These are internal controls, not a supported self-hosting configuration surface.

Project settings resolve three LLM connections: summary, embedding and clustering (naming). Pass the resolved `TopicsModels` explicitly; credentials must not enter persisted execution or batch state. Model validation and connection lifecycle belong to [model-config.ts](../../../../packages/shared/src/server/topics/model-config.ts). The embedding model and dimensions are locked once embedded summaries exist. Discovery and later assignment must use the same embedding purpose and normalization; equal dimensions alone do not make vector spaces compatible. An execution whose frozen summary or embedding model differs from current settings must be restarted. Changing the naming model affects subsequent naming; it does not rename unchanged definitions.

Text-call tracing is separate from processing. It requires the source project in `LANGFUSE_TOPICS_TRACING_ENABLED_PROJECT_IDS` and the organization's AI-feature and AI-analytics settings. Embeddings are untraced. Preserve internal-environment exclusion to prevent recursive processing. OpenRouter Broadcast can create new public traces without the reserved internal environment; exclude the Topics key from a Broadcast destination that itself runs Topics.

## Processing and updates

**Process traces** freezes trace selection, facet versions, model settings and compatible published map references, including the absence of a map. Retries use that selection. It summarizes and embeds traces, then classifies against those maps; it never fits or renames topics. Complete summaries without a compatible map are awaiting topics, not outliers.

**Update topics** fits stored summaries in a frozen source-time window. It does not load source traces, summarize or embed. Select the latest summary per source before checking completion, facet version and embedding compatibility: a newer ineligible result must not revive an older eligible one. This check must see replacements outside the selected window, including sources moved to another minute or month. Retrying an unpublished update starts a fresh fit from current compatible summaries in that same window. Completed or skipped attempts replay their saved outcome without refitting or naming again. The previous published map remains available until publication succeeds.

Automatic trace batches use the same extraction and project models without reloading observations. A facet completed since the job's enqueue time is skipped on retry; a later redispatch can produce an updated summary. A failed trace is counted without failing or rereading the whole batch. Rejected credentials or billing pause the project's automatic processing. Successful rows queue `topics-automation` for online assignment to compatible serving maps.

## Continuous maps and nightly refits

Clustering runs come in two kinds, told apart by their owner columns. A **continuous map** belongs to a Topics rule (`rule_id`): the system fits it, and each refit continues it. A **one-off snapshot** belongs to the manual execution that requested it (`batch_action_id`) and is owned by the user who started it. Every manual **Update topics**, including the setup's first clustering after its backfill, is a snapshot. Runs written before these columns carry neither: the project's oldest rule continues them at its refits, and for serving they rank like snapshots. The serving map of a facet, read by the Topics page, the public API and online assignment alike, is the newest completed run at the highest facet version, where a run with a rule wins over every other run. A snapshot or a run without an owner therefore serves only until its facet version has a continuous map, and a project without nightly refits keeps seeing its newest manual update. A facet without a serving map keeps its summaries awaiting topics until the first nightly fit.

[nightlyRefit.ts](nightlyRefit.ts) fits every active rule's continuous map once a day, one run per rule and facet at its latest version; a paused rule keeps its map without refits. A five-minute runner, holding a Redis lease, handles a project once its slot has passed. The slot is `LANGFUSE_TOPICS_NIGHTLY_REFIT_HOUR_UTC` plus a stable, hash-derived offset of under 30 minutes; a rule saved after the slot waits for the next one. The run ID derives from the rule, facet, embedding configuration and slot, so replicas, retries and later ticks find the same run. The first fit of a rule runs whenever at least 100 summaries exist and continues the setup snapshot, so its topics keep their IDs and names. Later nights fit only when summaries arrived after the published map's window, and otherwise leave a skipped run. The scheduled window is the last 30 days. The fit loads the newest summaries in it, up to 80% of the worker's row and byte limits, reading back in steps of 7, 14 and 30 days (the last reaching the window's start) until the limits are reached, and stops early when a step fills its limit so the loaded summaries stay contiguous; the window stored on the run starts at the oldest summary it loaded. If the newest step fails, the run fails and the previous map keeps serving; if a later step fails, the fit uses the steps that completed. Summaries stored between the window's end and publication were assigned to the previous map; they await topics until the next refit includes them. A run still open from an earlier slot is failed when the next slot starts, and a replayed job that finds its run already running fails it rather than fitting again. A scheduling error is logged per rule facet and does not stop the tick. After downtime only the latest slot runs, at most five fits per tick. The fit itself runs as a `topics-rule-refit` job on the `topics-update` queue, with the same clustering, continuity and naming pipeline as a manual update.

A user can refresh a rule's map outside the nightly slot with `startTopicRuleRefresh` ([rule-refresh.ts](../../../../packages/shared/src/server/topics/rule-refresh.ts)). It creates one pending rule-owned run per facet with the nightly window (the last 30 days) and enqueues the same `topics-rule-refit` job. The run is marked `refresh`, so fewer than 100 matching summaries fall back to small-sample mode instead of a skipped run. An empty Redis key per rule, set only if absent and expiring after 15 minutes, is the cooldown and keeps two concurrent starts from both running; a refresh is also refused while any fit of the rule or its setup is open. Whether a fit is running comes from the rule's open runs in Postgres. The nightly scheduler skips a slot for a facet whose rule map had a fit started from an hour before the slot on, so it neither fails a refresh's open run nor fits again right after it. A refresh of a provisional map stays provisional, so the next nightly refit still includes the seeded summaries that finished later. Manual refreshes always fit, even without new summaries.

Summaries carry no rule, so a rule with a filter is matched again at fit time: the loading query keeps the summaries whose trace meets the rule's current filter, with the semantics of ingestion (one observation meets every predicate), before it takes the newest. A rule that matches a small share of a busy project therefore still gets a full cohort. The fit never samples; sampling only selects the traces to summarize. Each step matches only its own slice's events, limited to traces with a summary of the facet, which bounds its set. It reads events up to one hour past the slice's end, because a summary dates from its trace's first event and the matching observation can follow later; a trace that starts in the last hour of a slice and matches more than an hour later is left out. Fewer than 100 matching summaries leave a skipped run. Rules without a filter read no events.

The match re-reads up to 30 days of a project's events per rule and facet each night. Filters on metadata and tags cost the most, because they read those wide columns for every event in the window. Fits run on the events read service with two threads. Watch it through `langfuse.topics.errors` with `stage:execution`, the warning `Topics newest summaries stopped early`, and the `langfuse.topics.refit_window_days` attribute of the `topics-rule-refit` span, which shows how far back the newest summaries reach. To assess a slow or failed fit, read its statements from the query log (failed ones have a non-zero `exception_code`):

```sql
SELECT event_time, query_id, query_duration_ms, read_rows,
       formatReadableSize(read_bytes) AS read,
       formatReadableSize(memory_usage) AS memory,
       exception_code, query
FROM system.query_log
WHERE event_date >= today() - 7
  AND type IN ('QueryFinish', 'ExceptionWhileProcessing')
  AND JSONExtractString(log_comment, 'route') = 'topics-newest-clustering-summaries'
  AND JSONExtractString(log_comment, 'projectId') = '<project id>'
ORDER BY event_time DESC
LIMIT 50;
```

## Snapshots that summarize first

A snapshot is an `update` execution with `analysis` settings; its BatchAction stores the filter, facets, window and, with `analysis.summarize`, how many traces to summarize and how to pick them (random or latest). Such a snapshot starts in the `summarizing` phase and a `topics-setup` job, not the update job, drives it ([snapshotSetup.ts](snapshotSetup.ts)):

1. The first tick selects finished matching traces without a stored result for every facet (idle for twice the project's wait) and enqueues them as `events-dispatch` jobs, in locality batches as the dispatcher forms them, carrying `batchActionId` instead of rule IDs. Jobs are delayed over up to three minutes so summaries do not reach the provider at once. The trace-dispatch maps are not used, and a failed trace is not restored to them.
2. Events-dispatch routes those traces only to Topics. The per-trace job summarizes the snapshot's facets and stores `metadata.executionId` on each summary; it assigns nothing online.
3. Each 15 s tick counts the seeded traces' summaries into the execution's facet progress. At 90% settled, a minute without growth or eight minutes, the tick enqueues the usual update job, which clusters the snapshot's window with `batch_action_id` on its runs. A snapshot's fit picks its mode from the summaries it loads: below 100 it clusters a small sample (at least 10, minimum cluster size 3); rule fits keep the mode in their run config.

The seeded trace IDs and the settle clock live in the BatchAction's `summarizing` config. Three failed ticks in a row fail the execution.

## Transcript and summary contract

Manual processing and trace batches share the transcript producer and [topics-model-input.ts](../../../../packages/shared/src/server/transcript/topics-model-input.ts) projection. The model receives conversation history and current-turn messages without observation provenance, reasoning content, tool definitions or inline media payloads. Empty projected content produces `insufficient_input` without inference. The [shared transcript README](../../../../packages/shared/src/server/transcript/README.md) owns observation eligibility and assembly semantics; diagnostic text renderers are not the Topics model input.

[trace-input.ts](../../../../packages/shared/src/server/topics/trace-input.ts) bounds manual source loading separately from the summary request's token budget. The request budget includes transcript, instructions and schema; oversized input fails before inference, without shortening evidence per facet. Keep tokenizer code and its WASM dependency in worker `models.ts`.

Stored-summary reuse is opt-in and requires the same facet version, summary model, source start and transcript producer/version (`TOPICS_TRANSCRIPT_VERSION`). It does not establish content freshness. Compatible embeddings can be reused; otherwise the reused text needs embeddings. Reuse records only new usage and gets the new execution's staging ownership. Accepted staged results retain their recorded producer version across retries; original source snapshots are not kept.

Facet prompts define extraction semantics in the shared Topics contracts. One request handles the missing facets of a trace. Applicability is distinct from success: non-applicable and insufficient-input results have empty summaries and are not embedded. A model call can serve multiple facets; account for its usage once across those result rows.

## Manual queue recovery

BatchAction stores the immutable request and compact progress. Keep per-trace payloads and paid outputs outside the execution store, in staging and result storage.

1. Stage accepted summaries in Redis before handing them to `topics-embedding`. Staging has a fixed TTL; retrying does not renew it.
2. Save accepted vectors with the staged summaries before inserting completed rows into ClickHouse. Persistence retries reuse paid outputs.
3. While waiting for embeddings, release the coordinator slot and inspect only Redis queue state. Accepted references resume without reloading source data.
4. After assignment persistence, save terminal queue state before deleting staging payloads. Cleanup failure can leave them to expire.

Missing or expired staged payloads fail explicitly. A new execution with stored summary reuse can recover durable results. Redis loss, or a crash between a model response and staging, can repeat inference. Automatic trace batches do not use this staging protocol; their recovery is described above.

## Fitting and publication

Native UMAP/HDBSCAN proposes clusters; the worker builds the serving classifier from original-space centroids and cosine radii. The 2D display reduction is separate from the clustering reduction. The nearest prototype must pass its radius; there is no fallback to a farther topic. Fitting implementation and native checks live in the [native package](../../../../packages/native/README.md).

The native fit runs in a credential-free, killable Node child. Worker row/byte admission limits reject an oversized cohort rather than sample it. Those limits are not a process-memory guarantee: serialization, native fitting and concurrent jobs need additional headroom. Rule fits load the newest summaries that fit 80% of those limits; manual updates preserve the requested window.

Naming uses the classifier's final memberships. It selects whole summaries within request budgets and reuses that selection for a name-conflict retry. Evidence references must identify actual members. A provider content filter publishes an unnamed placeholder with a warning; other naming failures interrupt the update. A later update retries placeholder names.

Publish only after definitions, initial assignments and coordinates are readable. A completed all-outlier map is valid. Definitions are immutable and retain their original creation run; each run pins exact topic-version IDs. Definition lookups must include their original creation times, which can predate the current cohort. Assignment identity includes run and origin so online assignments or unpublished updates cannot replace a published map's initial membership and coordinates. Continuity can preserve topic IDs across updates, while changed definitions receive new versions and material splits/merges receive new identities. Reuse unchanged geometry at its stored precision so naming and assignment agree.

Later online assignments extend membership without changing initial coordinates. They remain unpositioned until another update; no UMAP transform is retained. Assignments must match `summaryProcessedAt` before being treated as current after reprocessing. Execution results show current summaries, not historical text snapshots, and processing timestamps do not guarantee dispatch-order freshness.

## Costs, telemetry and cleanup

[models.ts](models.ts) resolves the source project's custom/default model catalog through `findModel` and prices canonical usage with the shared [`calculateModelUsageCosts`](../../../../packages/shared/src/server/pricing-tiers/calculateModelUsageCosts.ts), including ingestion's pricing-tier selection. Explicit provider USD costs take precedence; missing usage is not inferred from token limits. Keep pricing lookup bounded; failures must not discard successful results or retry inference. Optional internal traces use the destination project's catalog independently.

Processing estimates sum retained summaries' `cost_details['total']` by project and execution without query-time deduplication. A stored zero is zero; an absent total means no estimate. Costs are saved with summary/embedding results and exclude naming, failed calls and unsaved results. Partial pricing can undercount; retry/replacement rows can overcount until background merges, and reprocessing or deletion can change historical estimates. Request limits remain in `models.ts`; provider usage and local token estimates are different measures.

[metrics.ts](metrics.ts) owns bounded Topics metric tags; tenant identifiers and request detail belong on spans/logs. Attempt counters can repeat on retry and are not a billing ledger. Model-call diagnostics must not include provider bodies or raw errors that can echo trace content. `langfuse.export.serialized_bytes` with `integration:topics` measures successful serialized request payloads, excluding responses and failed/retried traffic.

Queue/staging metrics expose backlog and remaining payload TTL. Global snapshots can be emitted by several workers: use max for counts/age and min for remaining TTL, not sums across reporters. Staging telemetry is best effort and must not block the paid-result handoff.

Trace deletion removes summaries and assignments, including map coordinates; project deletion also removes topic definitions. Deletion does not cancel in-flight jobs, which can write afterward. Optional trace-batch input capture has its own bucket-expiry contract; see the trace-batch README.

## Verification

```sh
pnpm --filter worker run test features/topics
```

Provider calls are mocked. Native and storage integration suites need the built addon and migrated databases; consult the native README for Rust checks. Synthetic vectors and mocked models verify contracts, not semantic topic quality. Use `pnpm run seed -- list` for reproducible local traces before inspecting real model output. For embedding comparisons, see the [dated benchmark evidence and evaluation method](../../../../specs/bedrock-embedding-quality-research.md).
