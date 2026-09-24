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

## Setup

Use the normal local Postgres, ClickHouse, Redis, web, and worker stack. Apply the
repository's database migrations and regenerate/build shared before starting the
worker. Once the Topics tables exist, set `LANGFUSE_TOPICS_ENABLED=true` on both
web and worker. It defaults to false: Topics routes, effective session flags,
queues and Topics cleanup are disabled, so the tables may be absent.
Set `LANGFUSE_TOPICS_ENABLED_PROJECT_IDS=project-a,project-b` on both services to
allow processing for those project IDs. An unset or empty list admits no projects;
IDs are comma-separated and whitespace is trimmed. Keep the deployment enabled
while clearing the list to pause processing: trace and project deletion still
clean historical Topics data, including data from formerly admitted projects.
UI visibility and read/configuration access additionally use the `langfuseTopics`
feature flag and project permissions. Trigger/retry and both worker processors
check deployment enablement and the allowlist; rejected queue jobs fail without retrying or running pipeline
work. Apply changes by restarting web and worker; this does not cancel work that
is already running. Web and worker use the same databases and Redis. Topics does
not write to object storage or require a shared filesystem; ingestion storage is unchanged.

Build the numerical addon from the repository root (the normal worker build and
dev commands also build it):

```sh
pnpm --filter @langfuse/native run build
```

The worker reads `LANGFUSE_AI_AWS_BEDROCK_REGION` for all Topics model calls
through the normal `.env` loader.
Use a region supporting both the global OpenAI inference profiles and Cohere
Embed v4, such as `eu-west-1` or `us-east-1`. Bedrock uses the default AWS
credential chain; the worker role needs `bedrock:InvokeModel` access to
`global.openai.gpt-5.6-luna`, `global.openai.gpt-5.6-terra`, their routed
foundation models, and `cohere.embed-v4:0`.
Locally, set `LANGFUSE_TOPICS_AWS_PROFILE=playground` to use the SSO profile
without changing credentials for local object storage. `AWS_PROFILE` takes
precedence when set. Restart the worker's parent dev command after changing env.
Numerical fitting uses the worker's existing Node runtime and compiled
`@langfuse/native` addon, with no extra runtime or service.
Summary and assignment records use `trace_id` as their source when present;
`session_id` can also record that trace's parent session. With an empty `trace_id`,
`session_id` identifies the processed session. At least one ID is required.
The current pipeline processes traces only. `unit_start_time` (`unitStartTime` in
TypeScript) is the first observation's start time for the processed source. Summaries set
`trigger_type=manual_poc`. Each clustering attempt records its own `started_at`. Failed updates start a fresh
attempt while keeping the previous published map available.

Summaries snapshot source environment and trace name; assignments copy that
snapshot. Reprocessing refreshes metadata even when text is reused; session
results have no trace name.

Summaries use `global.openai.gpt-5.6-luna`; cluster naming uses
`global.openai.gpt-5.6-terra` through Bedrock Converse with reasoning disabled.
Both OpenAI profiles use global cross-region inference, including when invoked
from `eu-west-1`; they do not provide EU-only routing. Embeddings use Cohere Embed v4
(`cohere.embed-v4:0`) on Amazon Bedrock, with float output, `clustering` input
type for both discovery and assignment, and truncation disabled. Default: 1,024
dimensions; supported choices: 256, 512, 1,024, 1,536. Calls embed one summary at a
time, retaining per-summary Redis checkpointing.
Embedding settings are independent of immutable facet versions; changing them
with stored-summary reuse enabled regenerates vectors without summarization inference. This PoC does
not use `aiEmbed` or change ingestion. It accepts traces already stored in v4
events; legacy-only traces are unsupported.

After changing embedding models, start a new **Process traces** execution with
**Reuse stored summaries** to replace vectors without repeating summary inference,
then **Update topics** to rebuild the map. Old vectors/maps cannot match the new
configuration. Drain existing work before deploying; old-model staged jobs cannot
resume under the new schema. Old execution history remains readable.
After changing the summary model, start a new **Process traces** execution;
stored-summary reuse cannot reuse results from a different summary model.
Existing topic names remain until their definitions change during **Update topics**.

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

The worker loads each trace lazily, shares one in-memory transcript across facets,
and releases it before the next trace. Worker and inspector use the same assembly.
Accepted summary references resume without fetching source data; source snapshots,
transcripts and model request bodies are not persisted.

Processing and fitting use separate `topics` and `topics-update` queues with one
coordinator slot each. `topics-embedding` has two slots and receives reference-only
batches of up to 100 traces across facets. This internal batch size is not a
selected-trace cap.

1. Summarization stages accepted results in Redis with a fixed deadline:
   `LANGFUSE_TOPICS_REDIS_TTL_SECONDS` defaults to three hours. Retries never extend it.
2. Embedding saves its vector with the staged summary before the combined
   ClickHouse insert. A completed embedding job acknowledges that insert;
   no unfinished summary rows reach ClickHouse.
3. The coordinator releases its slot while waiting. Pending batch IDs live in its
   BullMQ job; unchanged polls read Redis queue state without database work.
4. After assignment inserts succeed, save terminal BullMQ state before deleting
   payloads. Cleanup failures leave them to expire. Repeated writes keep their
   identity. Inserts are bounded by 10,000 rows / 8 MiB and await async acknowledgement.

Normal retries use frozen inputs and accepted references, not summary/assignment
reads. Missing/expired payloads fail explicitly. A new execution with **Reuse stored
summaries** can recover persisted results. Redis loss or a crash between a provider
response and saving it can repeat inference.

Stored-summary reuse is opt-in and requires the same facet version, summary model
and transcript producer version; it does not check content freshness. Compatible
vectors are reused; changed dimensions regenerate only embeddings. Results receive
the new execution's staging ownership,
replace previous summaries, record reuse timestamps and count only new usage.
This is not a cross-execution deduplication cache.

Each processing attempt shares identical transcript text across facets for a trace.
Facet instructions affect only summarization. `loadTopicTranscript` uses the shared
`orderObservations` and `assembleTranscript` producer, with a 10,000-character cap
on the complete serialized JSON, including escaping, provenance and metadata.
The model receives the structured transcript directly: threads with conversation
history and current-turn messages, normalized parts and observation provenance.
`truncated: true` marks omitted content. A null transcript produces
`insufficient_input` without a summarization or embedding call.

The shared producer defines observation eligibility, tool association and replay
deduplication. It includes generations and matched tool responses. Root-only
non-generation traces, unmatched tool observations and observation-level status
messages are outside that conversation contract. Topics does not add fallbacks,
coverage fields, custom media handling or a separate transcript projection.
See `packages/shared/src/server/transcript/README.md` for the producer's semantics
and limitations.

If transcript plus instructions/schema exceeds the execution's input allowance,
the worker fails before calling the provider; it does not
silently change the evidence for that facet. Stored summaries record
`transcript_id` (`poc`) and `transcript_version` (`shared-transcript-v1`), plus the
models used. Historical summaries from other producer versions are regenerated.
Accepted Redis payloads retain their recorded version when the same execution
resumes. Transcripts are regenerated from current observations; original source
snapshots and content hashes are not retained.

The summary prompt and schema write the summary before deciding applicability.
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

Provider usage and calculated model costs use the events-style
`provided_usage_details`, `usage_details`, `provided_cost_details` and `cost_details`
maps. Summary and embedding keys are prefixed by stage; effective maps include
combined totals.
Global Bedrock text rates per million input/output tokens are $0.20/$1.20 for
[Luna](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-56-luna.html)
and $2/$12 for
[Terra](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-56-terra.html).
Naming requests above 272,000 input tokens use $4/$18 for the whole request.
Embedding costs use Bedrock-reported input tokens at $0.12/million. Missing usage
is logged and omitted from usage/cost maps, never estimated with an OpenAI tokenizer.
Model prices and token budgets live in [models.ts](models.ts) and the shared
Topics contracts. Oversized naming input fails before calling the provider;
member summaries are never silently discarded.
Provider SDK retries are disabled. Embedding queue jobs retry transient failures
up to three attempts with exponential backoff; authentication and invalid
input/output failures stop immediately. A manual resume can retry a failed batch
while its Redis payload still exists; each manual resume resets the three-attempt
retry budget.

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

[metrics.ts](metrics.ts) owns `langfuse.topics.executions`, `.results`,
`.stage_duration_ms` and `.errors`. Tags are fixed categories without tenant IDs
or customer content. Counters measure attempts and work, not unique persisted
rows: resumes can count again and accepted results can precede persistence
failures. Nested catches count the same error once per attempt; completed replays
emit no attempt/result metrics. Model durations exclude cache hits.

Metrics are best effort, not an exactly-once ledger or heartbeat. Queue backlog,
waiting time and BullMQ outcomes use `langfuse.queue.topics.*`,
`langfuse.queue.topics-update.*` and `langfuse.queue.topics-embedding.*`.

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
