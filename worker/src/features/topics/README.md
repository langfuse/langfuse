# Local Topics PoC

Turn selected v4 traces into facet summaries, embeddings, discovered topic maps,
and assignments to an existing map. Open `/project/<projectId>/topics` on the
current local Langfuse instance (normally `http://localhost:3000`).

## Facets and selection rules

Like evaluators and evaluation rules, Topics separates semantic definitions from
which traces are processed:

- `topic_facets`: stable facet identity, name and current published map.
- `topic_facet_versions`: immutable prompt versions only. Saving an unchanged
  prompt does not create a version.
- `topic_rules`: editable names, observation filters and optional random/latest
  sample size. `topic_rule_facet_assignments` attaches stable facets to rules;
  editing a rule does not create prompt versions.
- At trigger, the execution manifest freezes the rule ID, filter, time window,
  sampling seed, exclusions, resolved trace IDs, selected prompt versions and
  runtime summary/embedding configuration. Retries never re-evaluate a rule.

Summary reuse depends on transcript content, facet prompt, summary settings and
system-prompt version. Rule IDs and selection criteria do not affect that key.
Embedding reuse additionally requires the same embedding model and dimensions.
Summaries and embeddings remain in ClickHouse; there are no per-trace Postgres
rule or execution rows. Rules select incoming traces for the facet's cumulative
topics, rather than owning separate maps.

## Setup

Use the normal local Postgres, ClickHouse, Redis, object storage, web, and worker stack. Apply the
repository's database migrations and regenerate/build shared before starting the
worker. Topics is enabled only when `NODE_ENV=development` and `NEXTAUTH_URL` has a
loopback hostname. Web and worker use the same databases and event-upload bucket;
no shared filesystem is needed.

Build the numerical addon from the repository root (the normal worker build and
dev commands also build it):

```sh
pnpm --filter @langfuse/native run build
```

The worker reads `OPENAI_API_KEY` from its environment through the normal `.env`
loader. Numerical fitting uses the worker's existing Node runtime and compiled
`@langfuse/native` addon, with no extra runtime or service.
Summary records set `unit_type=trace`, `unit_id` to the source trace ID, and
`trigger_type=manual_poc`. Clustering runs record the first start in `started_at`;
retries preserve it.

The key remains in the worker. Summaries use `gpt-4.1-nano`; cluster naming uses
`gpt-5.6-luna` with reasoning disabled. Embeddings use `text-embedding-3-small`
at 768 dimensions by default. Each execution chooses 16–1,536 dimensions.
Embedding settings are independent of immutable facet versions; changing them
reuses summary text and regenerates vectors without summarization inference. This PoC does
not use `aiEmbed` or change ingestion. It accepts traces already stored in v4
events; legacy-only traces are unsupported.

## Run the experiment

1. Initialize facets, inspect/edit their instructions, and select trace IDs for
   batch A. Topic names emerge from the descriptions; the facet is not a list of
   topic classes. `Intent`, `Outcome`, and `Issues` are editable starting points.
2. Discover on batch A. Set **Minimum traces for clustering** to control how many
   applicable summaries each facet needs before discovery (at least 3). This is
   saved with the execution and reused on retry. The standard default is 100
   summaries per facet, with HDBSCAN minimum cluster size 15 and minimum samples 5. This minimum does not establish quality. Explicit exploratory mode uses
   defaults of 10 / 3 / 2 so a tiny smoke test can exercise the full path. Changing
   the trace minimum does not change the cluster-size or density settings.
3. Inspect the resulting summaries, names, representative examples, and outliers.
   The summary inspector regenerates the shared transcript from current trace data. It checks the stored input hash and explicitly marks changed or unavailable source data.
   Non-applicable and insufficient-input results remain separate from outliers.
4. Assign later batch B to the selected published map. This performs summary and
   embedding inference for uncached traces and the existing classifier; it does
   not discover or rename topics.
5. Recluster selected prior executions to test a new map using their stored
   summaries and embeddings. This performs numerical discovery and naming again,
   without repeating extraction or embedding. Compare maps on a common cohort.

Use the repository seed CLI for synthetic local trace data (`pnpm run seed --
list`). There is no automatic fixture insertion in this feature.

## Current topics and manual refresh

The default **Run topics** action freezes the reviewed trace IDs and accumulates
terminal summaries across executions of each selected facet version. There is no
total trace-count cap; explicit lookups use bounded internal batches. Before the
first map reaches its minimum cohort, usable summaries wait for later batches.

A compatible existing map receives assignments immediately. Refit triggers are
provisional PoC defaults: at least 20 new usable summaries and 20% growth; or at
least 10 new outliers making up 25% of new evidence; or cosine drift of 0.05
supported by 10 new members. Exploratory absolute minima are 3. Force refresh,
missing maps and changed embedding configuration also request a refit. The same
summary input is not counted as new repeatedly. Progress records the decision,
metrics and cohort count. No periodic scheduler runs in this PoC.

Continuity uses at least 80% reciprocal overlap of unchanged trace inputs, 10
anchors (3 exploratory), and 50% old-topic coverage. Compatible centroids must be
within cosine distance 0.15. Material split/merge branches start new identities.
These thresholds require quality calibration; they are not universal guarantees.

Current membership resolves the latest `assigned_at`, then assignment ID, per
project/facet/unit. Only published map assignments and explicit terminal no-topic
results participate. Outliers, non-applicable facets and insufficient inputs clear
previous membership; processing failures do not. Topic filtering happens after
latest selection. A late older job may win by timestamp, intentionally accepted
for this PoC. Execution links continue to show historical results.

## Algorithm and checkpoints

The worker loads and assembles each trace once per processing attempt, shares
the same in-memory transcript across all selected facets, and releases it before
processing the next trace. Loading is lazy: accepted summaries and frozen cohorts
replay without reading the source. It does not persist source
snapshots, transcripts, projections, or model request bodies. Shared deterministic
assembly is used by the worker and the on-demand summary inspector. Accepted
summaries and embeddings are saved in ClickHouse; accepted names are saved in Postgres.
Successful extraction writes the summary and embedding together to ClickHouse.
Summarization stages its result in Redis; the separate `topics-embedding` queue
holds only references, in batches of up to 100 traces across selected facets.
The payload TTL defaults to **3 hours**, configured with
`LANGFUSE_TOPICS_REDIS_TTL_SECONDS`. Retries never extend that deadline.
The embedding worker caches a completed vector alongside its summary before the
combined ClickHouse write. It removes the Redis payload only after the insert is
acknowledged. A database retry therefore reuses the vector while its payload is
available. No incomplete summary rows are written to ClickHouse.
The coordinator releases its worker slot while waiting. Its BullMQ job records
pending embedding batch IDs; unchanged polls read only Redis queue states, with
no Postgres, S3 or ClickHouse work. Completed batches are removed from the wait
list. When pending jobs finish or need recovery, the coordinator resumes from
frozen batch references without rewriting earlier progress prefixes. Missing/expired payloads fail the batch explicitly; start a new
execution to regenerate them. Redis staging is temporary, not a durable archive:
Redis data loss or expiry before persistence can require repeating inference.
Unchanged effective input and summary recipe reuse accepted summary text. Embedding
settings belong to the execution, not the facet version. Compatible vectors are
reused; a changed configuration creates a new combined summary/vector revision
with source-summary provenance and zero new summarization usage. Historical
vectors remain available for their original maps. Re-embedding accumulated
summaries never reloads traces or repeats summarization.

Every facet receives identical transcript text for the same source snapshot.
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
silently change the evidence for that facet. The canonical transcript text
determines input identity. Accepted checkpoints and reclustering of stored
summaries retain their inputs and provenance.

Extraction prompt versions participate in cache identity. The tested nano prompt
and schema write the summary before deciding applicability. Check
one trace after changing either prompt or schema before spending on a batch.
Input and invocation hashes retain provenance without duplicating the transcript.
Replaying an accepted summary or embedding does not require its source trace.
If a retry needs to summarize a missing facet, the regenerated input hash must
match any accepted facet summaries for that trace in the execution. Changed
input is reported as a trace error; a new execution can process the updated
trace without mixing it with the earlier snapshot.

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
Accepted numerical checkpoints retain their original version on replay; an
unfinished fit records the installed backend before retrying.

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

No informative clusters yields a terminal `no_topics` result and leaves the
previous published map in place. HDBSCAN's single root cluster is disabled, so
a single overall population is not forced into a topic; validating that case
needs a future coherence policy. Maps are
published only after their frozen initial assignment cohort is readable in
ClickHouse. Topic definitions and initial manifests remain immutable while later
assignments can extend a map's live membership. Refresh matches final memberships to the previous published map. Continuing
topics retain their stable topic IDs and receive new topic version IDs. Material
splits/merges receive new IDs with predecessor lineage in topic metadata.

## Cost and recovery

The Topics page renders the saved 2D coordinates against the frozen discovery
manifest. This view uses the same scale on both axes, with topic filtering,
summary selection and trace links. It does not recompute clusters or charge a
model. Later assigned traces remain unpositioned until a new discovery map;
the numerical worker does not retain a UMAP transform.

The summary prompt distinguishes the requested task from whether that task
succeeded. Each call receives the shared transcript and facet instruction and
returns summary text plus applicability status. No citations or block IDs are
requested from the model. A non-applicable result containing a summary is rejected,
not silently repaired. Real model
quality checks remain necessary; mocked tests cannot establish summary accuracy.

Postgres creates one `topic_clustering_runs` row per selected facet at trigger
and stores aggregate execution progress. Selected trace IDs, summary references,
and numerical fits use content-addressed objects under the event-upload bucket's
`topics/` prefix. ID lists are chunked; their contents never enter Postgres.
ClickHouse stores summary text, embeddings, assignment outcomes, and map coordinates.
Postgres stores each accepted cluster label separately, with evidence IDs only.
Transcripts stay in memory. There are no per-call output files or shared-disk state.

Processing reads cached summaries in batches of 100 traces and records accepted
summary references before queueing embeddings. ClickHouse writes are additionally
bounded by 10,000 rows / 8 MiB with awaited async inserts. Successful
summary+embedding work produces one combined row. Retries may repeat an
acknowledged insert under the same row identity; the replacing table resolves it.
The batch size is an internal work unit, not a selected-trace cap.

Provider usage and calculated model costs are recorded with accepted results.
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

A persisted summary, embedding, or cluster name can be reused without another charge. If a worker
stops after a provider call succeeds but before saving its result, a manual
resume may repeat that call.

Resume advances pending or failed stages from their accepted checkpoints.
Once extraction finishes, the accepted summary cohort and its failed-trace count
are frozen before clustering or assignment. Downstream retries reuse that cohort
without loading traces again, including when some traces failed.
To process those traces later, create a new execution; do not reinterpret a
published map's initial manifest. This PoC has one queue owner per execution and no automatic discovery schedule,
arrival catch-up, or object-retention job. The planned six-hour scheduler should
invoke the same refresh path as the manual button. Large per-project discovery,
all-member naming, and distributed stream processing remain follow-up work;
these changes are not a 100-million-traces/day throughput validation.

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
resume or refresh. Generated results count when accepted in memory; a later
persistence failure is reported separately. Model durations exclude cache hits.
Metrics are best effort, not an exactly-once ledger or an execution heartbeat.
Queue backlog, waiting time and BullMQ outcomes remain under
`langfuse.queue.topics.*` and `langfuse.queue.topics-embedding.*`.

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
