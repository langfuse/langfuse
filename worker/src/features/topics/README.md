# Local Topics PoC

Turn selected v4 traces into facet summaries, embeddings, discovered topic maps,
and assignments to an existing map. Open `/project/<projectId>/topics` on the
current local Langfuse instance (normally `http://localhost:3000`).

## Setup

Use the normal local Postgres, ClickHouse, Redis, web, and worker stack. Apply the
repository's database migrations and regenerate/build shared before starting the
worker. Topics is enabled only when `NODE_ENV=development` and `NEXTAUTH_URL` has a
loopback hostname. Web and worker must share this checkout and its local disk.

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
   topic classes. `Intent` and `Issues` are editable starting points.
2. Discover on batch A. The standard operational minimum is 100 applicable
   summaries per facet, with HDBSCAN minimum cluster size 15 and minimum samples 5. This minimum does not establish quality. Explicit exploratory mode uses
   10 / 3 / 2 so a tiny smoke test can exercise the full path.
3. Inspect the resulting summaries, names, representative examples, and outliers.
   The summary inspector regenerates the shared transcript from current trace data. It checks the stored input hash before highlighting cited evidence; changed or unavailable source data is shown explicitly.
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
model outputs are immutable local artifacts, written before ClickHouse results.
Successful extraction writes the summary and embedding together to ClickHouse.
If embedding fails, the summary is saved without a vector; a successful resume
writes the complete result under the same row identity with a higher result version.
Unchanged effective input and summary recipe reuse accepted summary text. Embedding
settings belong to the execution, not the facet version. Compatible vectors are
reused; a changed configuration creates a new combined summary/vector revision
with source-summary provenance and zero new summarization usage. Historical
vectors remain available for their original maps. Re-embedding accumulated
summaries never reloads traces or repeats summarization.

Every facet receives identical transcript text and source references for the same
source snapshot. Facet instructions affect only summarization. The transcript
includes system messages, tool evidence, provider status and coverage. It keeps
all assembled blocks. Assembly shortens individual blocks to 4,000 characters
with an explicit marker, omits media bytes and reasoning, and preserves available
audio transcripts. Structural ordering and proven replay-prefix references are
shared across facets. This is a normalized representation, not a lossless export.

If transcript plus instructions/schema exceeds a facet version's input allowance,
the worker fails before calling the provider; it does not
silently change the evidence for that facet. The canonical transcript text
determines input identity. Accepted checkpoints and reclustering of stored
summaries retain their inputs and provenance.

Extraction prompt versions participate in cache identity. The tested nano prompt
and schema write the summary and evidence before deciding applicability. Check
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
See [numerical validation](NUMERIC_VALIDATION.md) for replacement evidence and
known quality differences.

HDBSCAN's single root cluster is disabled: accepting it merged three clear themes
in the 12-trace smoke cohort. The smaller neighborhood separated them offline
using the same stored embeddings. This example supports the exploratory setting,
not its quality on arbitrary data.

The same classifier determines initial and later memberships. Naming sees its
effective populations: every member's full facet summary, plus three nearby
contrasts. Each group gets one naming call with no tool loop. Group IDs, unique
names, and member evidence references are validated before accepting output.
The provider schema keeps evidence IDs as strings, avoiding the API's enum-size
limit for large clusters; local validation still requires genuine member IDs. This checks structural grounding, not factual
or semantic correctness; inspect the examples to judge usefulness.

No informative clusters yields a terminal `no_topics` result and leaves the
previous published map in place. A single overall population is not forced into
a topic; validating that case needs a future coherence policy. Maps are
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

The summary prompt distinguishes evidence about a task from whether that task
succeeded. Evidence IDs are constrained to blocks in the shared transcript.
Model outputs still undergo semantic contract checks: a non-applicable result
containing a summary or evidence is rejected, not silently repaired. Real model
quality checks remain necessary; mocked tests cannot establish summary accuracy.

`.topics-data/` contains private local journals, accepted inference outputs,
cohort manifests, and numerical results.
Transcripts and raw source snapshots are regenerated from the original trace
data and are not stored here. This local directory is ignored by git.

Provider usage and calculated model costs are recorded with accepted results.
Calculations use $0.10/M input and
$0.40/M output for nano, $0.20/M input and $1.20/M output for Luna, and $0.02/M
embedding input tokens. Luna requests above 272k input tokens use 2x input and
1.5x output rates for the whole request. See the [model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-luna).
Extraction defaults to 8,000/512 input/output tokens (version-specific). Naming
allows its counted full input plus 10% and 512 framing tokens, and 1,000 output
tokens. Inputs exceeding a conservative 900k-token context allowance fail before
calling the provider; member summaries are never silently discarded. Embedding
input remains capped at 1,024 tokens.
Provider retries are disabled.

An accepted call checkpoint can replay without another charge. If a worker
stops after a provider call succeeds but before saving its result, a manual
resume may repeat that call.

Resume advances pending or failed stages from their accepted checkpoints.
Once extraction finishes, the accepted summary cohort and its failed-trace count
are frozen before clustering or assignment. Downstream retries reuse that cohort
without loading traces again, including when some traces failed.
To process those traces later, create a new execution; do not reinterpret a
published map's initial manifest. This local PoC has one queue owner and no
automatic discovery schedule, arrival catch-up, retention, or multi-host journal.

### Observed small-sample limitation

The synthetic smoke test discovered three topics from 12 traces. Its frozen map
accepted two held-out requests and rejected a novel baking request as an outlier.
Reclustering all 15 summaries absorbed that request into billing. A bounded
offline robust-radius experiment did not prevent this; robust seed filtering also
rejected a legitimate travel request. Neither experimental change is enabled.
Inspect common-cohort comparisons and validate on representative data before
treating these small-sample topics or thresholds as reliable.

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
