# Topics PoC

Turn selected v4 traces into facet summaries, embeddings, discovered topic maps,
and assignments to an existing map. Open `/project/<projectId>/topics` on the
current Langfuse instance (locally, normally `http://localhost:3000`).

## Facets and selection rules

Like evaluators and evaluation rules, Topics separates semantic definitions from
which traces are processed:

- `facets`: stable facet identity, name and description.
- `facet_versions`: immutable prompts keyed by project, facet and numeric
  version. Saving an unchanged prompt does not create a version.
- `facet_rules`: editable names, observation filters and optional random/latest
  sample size. `facet_rule_assignments` attaches stable facets to rules;
  editing a rule does not create prompt versions.
- At trigger, the request freezes the rule ID, filter, time window,
  sampling seed, exclusions, resolved trace IDs, selected prompt versions and
  runtime summary/embedding configuration. Retries never re-evaluate a rule.

Summary reuse is explicit and requires the same facet version and summary model.
It does not check whether source content changed. Embedding reuse additionally
requires the same embedding model and dimensions.
Summaries and embeddings remain in ClickHouse; there are no per-trace Postgres
rule or execution rows. Rules select incoming traces for the facet's cumulative
topics, rather than owning separate maps.

## Setup

Use the normal local Postgres, ClickHouse, Redis, web, and worker stack. Apply the
repository's database migrations and regenerate/build shared before starting the
worker. Set `LANGFUSE_TOPICS_ENABLED_PROJECT_IDS=project-a,project-b` on both web
and worker to allow processing for those project IDs. An unset or empty environment
variable defaults to demo project `7a88fb47-b4e2-43b8-a06c-a5ce950dc53a`.
An explicit list replaces this default. IDs are comma-separated and whitespace
is trimmed. UI visibility and read/configuration access use the `langfuseTopics`
feature flag and project permissions. Trigger/retry and both worker processors
check the allowlist; rejected queue jobs fail without retrying or running pipeline
work. Apply changes by restarting web and worker; this does not cancel work that
is already running. Web and worker use the same databases and Redis. Topics does
not write to object storage or require a shared filesystem; ingestion storage is unchanged.

Build the numerical addon from the repository root (the normal worker build and
dev commands also build it):

```sh
pnpm --filter @langfuse/native run build
```

The worker reads `OPENAI_API_KEY` from its environment through the normal `.env`
loader. Numerical fitting uses the worker's existing Node runtime and compiled
`@langfuse/native` addon, with no extra runtime or service.
Summary and assignment records use `trace_id` as their source when present;
`session_id` can also record that trace's parent session. With an empty `trace_id`,
`session_id` identifies the processed session. At least one ID is required.
The current pipeline processes traces only. `unit_start_time` (`unitStartTime` in
TypeScript) is the first observation's start time for the processed source. Summaries set
`trigger_type=manual_poc`. Each clustering attempt records its own `started_at`. Failed updates start a fresh
attempt while keeping the previous published map available.

The key remains in the worker. Summaries use `gpt-4.1-nano`; cluster naming uses
`gpt-5.6-luna` with reasoning disabled. Embeddings use `text-embedding-3-small`
at 768 dimensions by default. Each execution chooses 16–1,536 dimensions.
Embedding settings are independent of immutable facet versions; changing them
with stored-summary reuse enabled regenerates vectors without summarization inference. This PoC does
not use `aiEmbed` or change ingestion. It accepts traces already stored in v4
events; legacy-only traces are unsupported.

## Run the experiment

1. Initialize facets and inspect/edit their instructions. `Intent`, `Outcome`,
   and `Issues` are editable starting points; a facet is not a list of topic classes.
2. Choose **Process traces** and select traces through filters or pasted IDs.
   The request freezes the selection and selected facet versions. It generates
   summaries and embeddings, then assigns only this batch to the current
   compatible map. With no compatible map, completed summaries are **Awaiting
   topics**, not outliers. Processing never clusters or renames topics.
3. Choose **Update topics** to fit a map from the latest completed compatible
   summaries in ClickHouse. Initial discovery and later updates use this same
   operation. It does not load traces, summarize, or generate embeddings.
4. Inspect the resulting summaries, names, representative examples, and outliers.
   The inspector regenerates the shared transcript from current trace data and
   reports unavailable source data. Non-applicable and insufficient-input
   results remain separate from outliers.
5. Process subsequent trace batches as they arrive. Update topics manually when
   ready to incorporate new evidence into the clustering and names.

**Minimum traces for clustering** applies only to topic updates. It defaults to
100 applicable summaries per facet, with HDBSCAN minimum cluster size 15 and
minimum samples 5. Exploratory mode defaults to 10 / 3 / 2. The minimum can be
set to at least 3; changing it does not change cluster-size or density settings.
This minimum does not establish cluster quality.

Use the repository seed CLI for synthetic local trace data (`pnpm run seed --
list`). There is no automatic fixture insertion in this feature.

## Current topics and explicit updates

There is no total trace-count cap; explicit lookups use bounded internal batches.
Each processing request pins the current compatible published map per facet
before summarization, including the absence of a map. Retries keep that choice.
New requests can use a map completed while an earlier request was running.
The serving map is the completed run with the highest facet version, then newest
creation time and ID. A newer configured version without a completed map does
not hide the previous map. Pending, running, failed and skipped runs are ineligible.
A valid all-outlier map is completed even though it contains no topics.

An update selects the latest summary per trace, then keeps only complete results
matching the selected facet version and embedding configuration. The attempt uses
that in-memory population for fitting; a failed update selects it again on retry. Non-applicable or incompatible newer summaries never
revive older eligible results. A change to embedding dimensions must first be
processed explicitly; topic updates do not silently re-embed historical data.
The explicit update always attempts a fit subject to its minimum count. There
is no conditional-refit heuristic or periodic scheduler in this PoC.

Continuity uses at least 80% reciprocal overlap of trace identities, 10
anchors (3 exploratory), and 50% old-topic coverage. Compatible centroids must be
within cosine distance 0.15. Material split/merge branches start new identities.
These thresholds require quality calibration; they are not universal guarantees.

The ClickHouse tables hold current state. Summaries replace rows with the same
project, facet version and source using `processed_at`; assignments replace the
same project/facet version/source/map/origin using `assigned_at`. Summary references
are derived from their natural key; assignments have no separate ID. Neither table
has time partitions: late-arriving
observations can move the first start time across a month, but the row must keep
the same replacement identity.

Assignments contain classification results only. A topic ID means assigned;
an empty topic ID means outlier. An empty map ID supports future ad-hoc
classification. Awaiting-map, non-applicable and insufficient-input states come
from summaries, with no placeholder assignment rows. `summary_processed_at`
records which summary an assignment classified, so reprocessing can invalidate
old membership. Current membership considers published-map and ad-hoc assignments;
topic filtering follows latest selection. Execution pages show current results,
not exact historical batch membership. A late older job may win by timestamp.

## Algorithm and queue recovery

The worker loads and assembles each trace once per processing attempt, shares
the same in-memory transcript across all selected facets, and releases it before
processing the next trace. Loading is lazy: accepted summary references in the
batch job resume without reading the source. It does not persist source
snapshots, transcripts, or model request bodies. Shared deterministic
assembly is used by the worker and the on-demand summary inspector. Accepted
summaries, embeddings and complete topic definitions are saved in ClickHouse.
Successful extraction writes the summary and embedding together to ClickHouse.
Summarization stages its result in Redis; the separate `topics-embedding` queue
holds only references, in batches of up to 100 traces across selected facets.
The payload TTL defaults to **3 hours**, configured with
`LANGFUSE_TOPICS_REDIS_TTL_SECONDS`. Retries never extend that deadline.
The embedding worker caches a completed vector alongside its summary before the
combined ClickHouse write. A completed embedding job acknowledges that insert;
the payload stays in Redis for assignment. After assignment inserts succeed and
terminal batch state is saved in BullMQ, the processing worker removes the
payload. Cleanup failures leave it to expire at its original deadline. A database
retry reuses the vector while the payload is available. No incomplete summary
rows are written to ClickHouse. The three-hour deadline covers assignment too.
Processing and updates have separate `topics` and `topics-update` queues, each
with one coordinator slot per worker. A numerical fit or naming call therefore
does not occupy the trace-processing slot. Both queues use the same execution
processor; the stored operation determines the path. Embeddings retain their
separate `topics-embedding` queue with two worker slots.
The processing coordinator releases its worker slot while waiting. Its BullMQ job records
pending embedding batch IDs; unchanged polls read only Redis queue states, with
no Postgres or ClickHouse work. Completed batches are removed from the wait
list. When pending jobs finish or need recovery, the batch resumes from references
in its BullMQ job. Missing/expired payloads fail the batch explicitly; start a new
execution with **Reuse stored summaries** to recover any persisted results.
Redis staging is temporary: data loss or expiry can require repeating inference
for work that was never persisted. Normal processing and retries never read
summary or assignment tables, even to confirm writes. They load source traces
from ClickHouse, pinned serving-map metadata from Postgres, and immutable topic
definitions from ClickHouse.

**Reuse stored summaries** is an unchecked process option (`reuseExistingSummaries`).
Only this explicit reprocessing path looks up stored summaries. It reuses the
current summary for the same facet version and model, without checking content
freshness. Compatible vectors are reused; changed dimensions regenerate embeddings
without summary inference. The combined result replaces the previous summary,
records reuse timestamps and counts only new usage. Reused results are staged
under the new execution identity. Redis staging and BullMQ completion
receipts are scoped to an execution, not a cross-execution deduplication cache.

Each processing attempt shares identical transcript text across facets for a trace.
Facet instructions affect only summarization. This PoC focuses on generations
and tools when present, falling back to other observations otherwise. Wrapper
errors/status remain visible. Repeated input text and tool definitions are omitted,
including assistant replies replayed as input; repeated outputs are retained.
The transcript is a compact JSON array containing source direction, message role
and text, plus coverage counts.
Internal block/observation IDs, parent IDs, message/part indices and kinds are
excluded from model input. The entire serialized JSON is limited to 10,000
characters, including escaping. Long entries are shortened first, preserving
both ends. If too many entries remain, keep the beginning and end of the trace
and explicitly mark the omitted middle. Coverage reports shortened and omitted
blocks. Assembly omits media bytes and reasoning, and preserves available audio
transcripts. Structural ordering and replayed-context deduplication are shared
across facets. This is a normalized representation, not a lossless export.

If transcript plus instructions/schema exceeds the execution's input allowance,
the worker fails before calling the provider; it does not
silently change the evidence for that facet. Stored summaries record
`transcript_id` and `transcript_version`, currently both `poc`, plus the models
used. Transcripts are regenerated from current observations; original source
snapshots and content hashes are not retained.

The tested nano prompt and schema write the summary before deciding applicability.
Check one trace after changing either prompt or schema before spending on a batch.
Replaying an accepted summary or embedding does not require its source trace.
If a retry needs a missing facet, it uses the current transcript for that facet.

UMAP and HDBSCAN propose density clusters. Original-space unit centroids and
cosine radii form the serving classifier. A radius uses the 95th percentile of
leave-one-out member distances, capped by the fifth percentile of the nearest
rival cluster's distances. The closest topic must pass its radius; there is no
fallback to a farther topic. These are provisional heuristics, particularly
uncertain for small or rare populations.

UMAP uses `min(15, max(3, floor(n/3)))` neighbors, bounded below the cohort size.
The pinned Rust backend is `holomap` 0.3.0 plus `hdbscan-rs` 0.6.1. Unit-normalized
embeddings feed seeded cosine UMAP (random initialization, seed 42), separately
into at most 10 dimensions for Euclidean HDBSCAN/EOM and 2 dimensions for display.
The Rust adapter adds one to `minSamples` because the library includes the point
itself in its neighbor count. Rust owns the fixed reduction and cluster-selection
defaults; the worker passes only minimum population, cluster size, and samples.
The numerical backend version is recorded per run.
Numerical results are held in memory until their assignments and coordinates are
saved in ClickHouse. An unpublished attempt is rerun from scratch after failure.

The synchronous native fit runs in a credential-free Node child process with a
120-second kill deadline and output limits proportional to cohort size. No trace
count cap is imposed. Exact neighbor search has quadratic cost; large cohorts
can exceed the deadline. Map coordinates are repeatable on the same platform
and build, but are not a compatibility contract across backends or architectures.
Synthetic cohorts do not establish topic quality; validate representative data
before expanding deployment.

The same classifier determines initial and later memberships. Naming sees its
effective populations: every member's full facet summary, plus three nearby
contrasts. Each group gets one naming call with no tool loop. Unique names and
member evidence references are validated before accepting output.
The provider schema keeps evidence IDs as strings, avoiding the API's enum-size
limit for large clusters; local validation still requires genuine member IDs. This checks structural grounding, not factual
or semantic correctness; inspect the examples to judge usefulness.

No informative clusters yields a terminal `no_topics` result and publishes an
empty map with explicit outlier assignments for the selected cohort. HDBSCAN's single root cluster is disabled, so
a single overall population is not forced into a topic; validating that case
needs a future coherence policy. Maps are
published only after their initial assignments and coordinates are readable in
ClickHouse. Topic definitions and initial coordinates remain fixed while later
assignments can extend a map's live membership. Displayed summaries use current
text. Updates match final memberships to the previous published map for that facet
version. Changed embedding spaces use membership evidence without comparing
centroids. Continuing topics retain their stable topic IDs. When the embedding
space, centroid and radius are unchanged, the existing definition is reused
without another naming call. Changed definitions receive new topic version IDs. Material
splits/merges receive new IDs with predecessor lineage in topic metadata.

## Cost and recovery

The Topics page renders saved 2D coordinates from the map's initial ClickHouse
assignments. This view uses the same scale on both axes, with topic filtering,
summary selection and trace links. It does not recompute clusters or charge a
model. Later assigned traces remain unpositioned until a new discovery map;
the numerical worker does not retain a UMAP transform.

The summary prompt distinguishes the requested task from whether that task
succeeded. Each call receives the shared transcript and facet instruction and
returns summary text plus applicability status. No citations or block IDs are
requested from the model. A non-applicable result containing a summary is rejected,
not silently repaired. Real model
quality checks remain necessary; mocked tests cannot establish summary accuracy.

Postgres stores one `batch_actions` row per manual request for either operation,
and one clustering-run row per real attempt. Update admission creates the first
pending run for each selected facet/version and saves its reference atomically.
BatchAction owns lifecycle, error and aggregate progress; run config contains
embedding compatibility and numerical settings. Retry counts for completed maps
come from initial assignments, excluding later online classifications.
These contain settings and aggregate progress, not per-trace records or paid outputs.
BullMQ jobs carry bounded batches of up to 100 trace IDs, accepted summary references,
and temporary retry state. ClickHouse stores current summary text, embeddings,
classifications, and map coordinates. Completed summaries can await a map without
an assignment row.
ClickHouse stores immutable topic names, descriptions and prototypes, including
their original creation run. Each Postgres run stores the exact topic-version
IDs used by its classifier; missing definitions prevent loading that map.
Definitions use `Float64` geometry to preserve classifier precision and
`ReplacingMergeTree(created_at)` keyed by project and version ID to deduplicate
identical retry writes. They have no time partition or age-based expiry: an old
definition may still be in use by the current map. Transcripts stay in memory.
There are no Topics object-storage manifests, numerical checkpoints or shared-disk files.

Processing reads staged Redis summaries in batches of 100 traces and records
accepted references before queueing embeddings. Completed BullMQ batch state
suppresses repeated processing of that batch. Assignment references and their timestamp
are stable across retries. ClickHouse writes are additionally
bounded by 10,000 rows / 8 MiB with awaited async inserts. Successful
summary+embedding work produces one combined row. Retries may repeat an
acknowledged insert under the same row identity; the replacing table resolves it.
The batch size is an internal work unit, not a selected-trace cap.

Provider usage and calculated model costs use the events-style
`provided_usage_details`, `usage_details`, `provided_cost_details` and `cost_details`
maps. Summary and embedding keys are prefixed by stage; effective maps include
combined totals.
Calculations use $0.10/M input and
$0.40/M output for nano, $0.20/M input and $1.20/M output for Luna, and $0.02/M
embedding input tokens. Luna requests above 272k input tokens use 2x input and
1.5x output rates for the whole request. See the [model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-luna).
Extraction defaults to 8,000/512 input/output tokens (execution settings). Naming
allows its counted full input plus 10% and 512 framing tokens, and 1,000 output
tokens. Inputs exceeding a conservative 900k-token context allowance fail before
calling the provider; member summaries are never silently discarded. Embedding
input remains capped at 1,024 tokens.
Provider SDK retries are disabled. Embedding queue jobs retry transient failures
up to three attempts with exponential backoff; authentication and invalid
input/output failures stop immediately. A manual resume can retry a failed batch
while its Redis payload still exists; each manual resume resets the three-attempt
retry budget.

Explicit reprocessing can reuse a persisted summary or embedding without another charge. A failed
clustering attempt restarts its fit and naming; a published attempt is recognized
without repeating them. If a worker stops after a provider call succeeds but
before saving its result, a manual resume may repeat that call.

Trace retries reuse accepted summary references from their bounded BullMQ job.
Execution ownership belongs to the Redis staging envelope, not the durable summary.
The summary payload itself still expires after three hours; expiry requires a new
execution. Current completed results live in ClickHouse.
An interrupted update starts a new attempt from current compatible summaries,
then fits again and names only new or changed definitions. Partially named failed attempts cannot overwrite
the previous published map. After publication, an acknowledgement retry recognizes
the completed attempt without fitting again. Skipped attempts also resume
without recomputation, using the previously saved cohort count to distinguish
no applicable summaries from insufficient data.

There is no automatic discovery schedule or stream producer yet. The planned
six-hour scheduler should invoke the same update path as the manual button.
Large per-project discovery, all-member naming, and distributed stream processing
remain follow-up work; this is not a 100-million-traces/day throughput validation.

Trace deletion removes stored facet summaries (including embeddings), assignments
and map coordinates through the existing batched ClickHouse deletion path.
It does not cancel in-flight Topics jobs, which can write results after deletion.
Topic-name/centroid refresh remains separate lifecycle work.
Project deletion removes summaries, assignments and topic definitions through
the batch project cleaner.

### Datadog metrics

Topics uses the worker's existing DogStatsD connection and emits four metrics:

| Metric                              | Meaning                                                                                                                                  | Tags                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `langfuse.topics.executions`        | Execution attempts started, completed, completed with errors, or failed; independent of BullMQ success                                   | `outcome`                  |
| `langfuse.topics.results`           | Generated/reused results, assignments/outliers, and clustering outcomes including insufficient data                                      | `stage`, `result`          |
| `langfuse.topics.stage_duration_ms` | Duration of summary, embedding, numerical clustering, naming, assignment, transcript loading and instrumented storage operations         | `stage`, `outcome`, `unit` |
| `langfuse.topics.errors`            | Failures classified as authentication, rate limit, timeout, invalid input/output, provider, trace loading, storage, numerical or unknown | `stage`, `reason`          |

Tags contain only fixed categories, never tenant/run/trace IDs, facet names or
customer content. The same error propagating through nested catches counts once
per execution attempt. A resume starts another attempt; an already-completed
execution replay emits no attempt or result metrics.

Result counters measure work, not unique database rows: summary/embedding and
assignment results count trace–facet processing, naming counts cluster labels,
and clustering counts facet outcomes. Revisited stages can count again on a
resume or repeated update. Generated results count when accepted in memory; a later
persistence failure is reported separately. Model durations exclude cache hits.
Metrics are best effort, not an exactly-once ledger or an execution heartbeat.
Queue backlog, waiting time and BullMQ outcomes remain under
`langfuse.queue.topics.*`, `langfuse.queue.topics-update.*`, and
`langfuse.queue.topics-embedding.*`.

## Offline verification

```sh
pnpm --filter worker run test features/topics
pnpm --filter @langfuse/native exec cargo test --features napi/dyn-symbols topics
```

Pipeline tests mock provider calls and storage. `numeric.native.test.ts` runs
real UMAP/HDBSCAN through the worker's child process on more than 1,000 synthetic
vectors and checks serving prototypes, cold-start, identical-input and invalid
vector behavior. Rust tests cover deterministic fitting and validation. Neither
command calls a paid model.

## Default facet extraction

Intent describes the requested task even when execution fails. Outcome describes
what was actually delivered or confirmed, keeping a proposed action distinct from
an assistant's claim and a confirming result. Issues describes the principal
observed obstacle, its consequence and recovery; a problem quoted for analysis
is not itself an agent defect. Each editable prompt owns its facet's semantics.

The shared extraction wrapper asks for compact English prose (normally one
sentence, at most two and 100 words), preserves meaningful distinctions, and
omits incidental identifiers, source references and narration. Applicability is
separate from task success: absent signals and insufficient evidence retain their
distinct statuses and empty summaries, so they do not become embedded topics.
With one summary per trace/facet, the Issues default prioritizes the principal
problem rather than claiming to enumerate every independent issue.
