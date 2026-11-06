# Topics worker

Topics turns v4 traces into facet summaries, embeddings and topic assignments. The [web README](../../../../web/src/features/topics/README.md) covers the UI and access checks. This file covers worker lifecycle and recovery.

## Entry points

- [processTopicsExecution.ts](processTopicsExecution.ts): manual processing and topic updates.
- [summarizeAssembledTrace.ts](summarizeAssembledTrace.ts): shared facet extraction and automatic processing of an already assembled transcript.
- [topicsAutomation.ts](topicsAutomation.ts): online assignment and first-map discovery.
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

Automation also starts a facet version's first map when enough compatible summaries fit the worker's capacity. It narrows the recent source-time window and rechecks capacity failures after a deduplicated cooldown. Each queued request's window stays fixed. An existing map or fit for that version blocks initial discovery, even if incompatible. There is no periodic refit schedule; use **Update topics** to refresh an existing map.

## Transcript and summary contract

Manual processing and trace batches share the transcript producer and [assembledTranscript.ts](assembledTranscript.ts) projection. The model receives conversation history and current-turn messages without observation provenance, reasoning content, tool definitions or inline media payloads. Empty projected content produces `insufficient_input` without inference. The [shared transcript README](../../../../packages/shared/src/server/transcript/README.md) owns observation eligibility and assembly semantics; diagnostic text renderers are not the Topics model input.

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

The native fit runs in a credential-free, killable Node child. Worker row/byte admission limits reject an oversized cohort rather than sample it. Those limits are not a process-memory guarantee: serialization, native fitting and concurrent jobs need additional headroom. Automatic discovery can choose a smaller window; manual updates preserve the requested window.

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
