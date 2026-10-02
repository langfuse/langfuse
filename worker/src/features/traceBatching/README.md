# Internal cloud trace-batch experiment

This read-only experiment measures full-event reads and transcript assembly for
idle traces. It requires
`NEXT_PUBLIC_LANGFUSE_CLOUD_REGION` and explicit opt-in. All four enablement
flags below default to `false`; an ordinary release needs no infrastructure
changes. These internal controls are intentionally absent from env templates.

## Controls

| Variable                                      | Default   | Role                                                                                                       |
| --------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| `LANGFUSE_TRACE_BATCH_INGESTION_ENABLED`      | `false`   | Track accepted direct-v4 event writes in Redis.                                                            |
| `LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED`     | `false`   | Schedule idle traces into BullMQ jobs.                                                                     |
| `QUEUE_CONSUMER_TRACE_BATCH_QUEUE_IS_ENABLED` | `false`   | Register the batch worker.                                                                                 |
| `LANGFUSE_TRACE_BATCH_READ_ENABLED`           | `false`   | Allow the worker to query ClickHouse; otherwise discard jobs.                                              |
| `LANGFUSE_TRACE_BATCH_SAMPLING_RATE`          | `1`       | Fraction admitted by ingestion, from 0 to 1.                                                               |
| `LANGFUSE_TRACE_BATCH_STRATEGY`               | `project` | Choose project-order packing or opt-in locality grouping.                                                  |
| `LANGFUSE_TRACE_BATCH_MAX_SIZE`               | `60`      | Maximum traces per job, up to 10,000.                                                                      |
| `LANGFUSE_TRACE_BATCH_MAX_ESTIMATED_BYTES`    | `0`       | Estimated serialized event bytes per job; `0` disables the budget. When enabled, unknown and oversized traces run alone. |
| `LANGFUSE_TRACE_BATCH_MAX_THREADS`            | `2`       | ClickHouse threads per query (positive integer).                                                           |
| `LANGFUSE_TRACE_BATCH_MAX_BLOCK_SIZE`         | unset     | Optional positive `max_block_size` hint; unset inherits the server profile.                                |
| `LANGFUSE_TRACE_BATCH_EXPERIMENT_ID`          | unset     | Optional 1–64 character attempt/query label: letters, digits, `.`, `_`, `-`; first character alphanumeric. |
| `LANGFUSE_TRACE_BATCH_CONCURRENCY`            | `2`       | Concurrent batch jobs per worker process.                                                                  |
| `LANGFUSE_TRACE_BATCH_IDLE_MS`                | `600000`  | Idle time before a trace is ready (10 minutes).                                                            |
| `LANGFUSE_TRACE_BATCH_PENDING_TTL_MS`         | `7200000` | Pending retention and inactivity expiry (2 hours).                                                         |
| `LANGFUSE_TRACE_BATCH_DISPATCH_INTERVAL_MS`   | `30000`   | Dispatcher cadence (30 seconds).                                                                           |

Producer, dispatcher and consumer can run independently. Sampling reuses the
evaluator's deterministic trace-ID sampler; every observation of the same trace
gets the same admission decision. Dispatch and consumption do not resample.
Cloud guards cover ingestion, dispatcher execution, worker registration and
processing, and the shared queue accessor, including admin queue inspection.

## Redis state and expiry

- `{trace-batch}:due`: sorted set, with JSON `[projectId, traceId]` members and
  Redis server time plus idle delay as the score.
- `{trace-batch}:state`: hash with the same members and JSON
  `{minStart, maxStart, revision, eventUpdateCount, serializedEventBytes}` values. Bounds describe observed event start
  times; revision protects newer ingestion from an older dispatch acknowledgment.
- `{trace-batch}:dispatcher`: renewable dispatcher lease.

No event payloads are stored here. Atomic Lua updates accumulate estimates and
refresh bounds, revision and readiness. Each admitted intake
sets a shared absolute expiry on both pending keys with `PEXPIREAT`, preserving
any later existing expiry using `PEXPIRETIME` (Redis 7+). With no further intake,
both keys expire after the retention period even if every application stops;
idle time is not added to this deadline.

This is a whole-key inactivity backstop, not native per-member expiry. During
continuous intake, bounded Lua cleanup removes members whose due time is older
than retention; ingestion and dispatcher both perform cleanup.

## Dispatch and reads

One dispatcher holds the renewable lease. It snapshots ready IDs, sorts them by
project, then hydrates and revalidates state in chunks of 1,000. Jobs contain up
to the configured trace cap; project leftovers can share a job. The dispatcher
enqueues before acknowledging matching revisions, so concurrent intake stays
pending and failed enqueueing can be retried. Stable job IDs limit duplicates.

### Pending-window size estimates

Accepted direct-v4 writes contribute their final serialized UTF-8 event size after
field overflow handling, reusing the writer's existing `event_bytes` calculation.
The accounting field itself is excluded. Acceptance means admission to the writer,
not confirmation of a ClickHouse flush. `eventUpdateCount` counts accepted updates,
including retries and repeated observation versions; neither counter represents
unique observations or a trace's lifetime total. Deletion after enqueue, readiness
and two-hour retention are unchanged. Later arrivals start another pending window.
Entries missing either counter remain unknown until dispatch or expiry removes them.

The dispatcher emits `estimated_event_update_count` and
`estimated_serialized_event_bytes` distributions under `langfuse.trace_batch`, tagged
with `scope:trace|batch` and `strategy`. Batch totals require known estimates for
every member; `estimates_unavailable` counts unknown traces and affected batches.
Estimates stay out of queue payloads and job IDs. With the byte budget enabled,
the dispatcher splits each selected batch in order after project/locality selection
and partial coalescing, before adding a trace that would exceed
`LANGFUSE_TRACE_BATCH_MAX_ESTIMATED_BYTES`.
Traces with unknown estimates or individually exceeding the budget dispatch alone;
no trace is dropped or truncated. Each resulting job is enqueued and acknowledged
separately, so failed enqueueing leaves the remaining traces pending. Dispatch
retries can emit another sample.

Serialized event bytes differ from the reader's `io_metadata_bytes` metric: they
include the serialized event fields and JSON encoding, and do not represent RAM,
network transfer or ClickHouse scan bytes. The budget is a packing estimate, not a
hard read limit: a query can also return older rows in the buffered trace interval,
and one oversized trace can still time out. Splitting cannot widen the selected
batch's outer time window, but does not rerun the locality optimizer for each split.
The budget defaults to disabled. For an initial experiment, explicitly set
`LANGFUSE_TRACE_BATCH_MAX_ESTIMATED_BYTES=33554432` (32 MiB), a provisional value.
Compare a stable hour with the budget disabled against one with it enabled, holding
sampling, trace cap, concurrency and reader settings fixed. Compare failures,
successful throughput, actual payload bytes, query CPU and queue age as well as
estimated batch bytes; smaller jobs increase query count. Previously queued jobs
retain their grouping.

The worker streams full `events_full` payloads and records batch observation,
trace, project and logical payload-byte metrics. The `input_bytes`, `output_bytes`
and `metadata_bytes` distributions under `langfuse.trace_batch` each report one
total per completed batch read; `io_metadata_bytes` retains their combined total.
Sizes count UTF-8 bytes, including metadata keys and values, excluding JSON
transport framing/escaping and compression. They do not measure ClickHouse bytes
scanned or per-trace ingestion size; retries can record another batch sample.
Exact `(projectId, traceId)`
pairs protect tenant boundaries; project, trace hash and a shared outer time
window prune reads. Each selected trace also gets its own interval, so unrelated
batch companions cannot widen the payload returned for that trace.
`TRACE_QUERY_BUFFER_MS` pads each recorded interval by two minutes on both sides.
This fixed margin neither waits for arrivals nor guarantees trace completeness;
repeated intervals for the same pair form a union without duplicating rows.
Queries use response compression and chunked multipart parameters for up to
10,000 UUID-sized trace/project IDs. The fixed 30-second timeout fails the job
rather than accepting partial results. This does not cap observation count,
query memory or dispatcher snapshot memory.

## Per-trace transcripts

The reader orders only by project ID and trace ID. The worker keeps
one trace's observations, assembles it when the pair changes, and flushes the last
trace only after a successful end of stream. A stream error discards the current
partial trace; earlier completed traces have already emitted samples. Each trace
uses the shared depth-first ordering and transcript assembler. Transcripts are
ephemeral: neither logs nor job results contain their content.

Completion means all rows returned for that pair's query window, not that no late
events can arrive. Event versions follow the current ClickHouse merge state;
the shared ordering function keeps one observation per ID. Retries can repeat
per-trace samples.

These distributions use the `langfuse.trace_batch` prefix:

| Metric | Sample |
| --- | --- |
| `transcript_assembly_duration_ms` | One trace's ordering and assembly time, excluding I/O conversion, stream waits and tokenization; `has_transcript:true\|false`. |
| `transcript_json_characters` | UTF-16 length of `JSON.stringify(assembleTranscript(...))`, including thread/message wrappers and provenance; zero for a null transcript. Same admitted traces as the Topics length metrics. |
| `transcript_json_tokens` | o200k estimate of that complete JSON string, tagged `tokenizer:o200k_base`; zero for a null transcript. Attempted on the same admitted traces as `topics_transcript_tokens`; unavailable estimates are omitted. |
| `generic_transcript_characters` | UTF-16 length of the previous generic plain-text layout, rendered with the same Topics block caps and inclusions. Tool definitions or errors may still render when assembly returns null. |
| `generic_transcript_tokens` | o200k estimate of that generic text, tagged `tokenizer:o200k_base`. |
| `transcript_message_tokens` | Sum of current-turn and history message-projection token estimates; zero when empty, omitted if either estimate is unavailable. Distinct from full-transcript JSON. |
| `transcript_current_turn_tokens` | Token estimate of current-turn messages across all threads, using role and parts only; zero when empty. |
| `transcript_history_tokens` | Token estimate of history messages across all threads, using the same role/parts representation; zero when empty. |
| `transcript_content_characters` | Sum of JSON-serialized message-part lengths across history and current turn, in UTF-16 code units; excludes message wrappers and provenance. |
| `transcript_tool_response_characters` | The subset of content characters belonging to tool-role messages or unmatched tool-result parts; zero when absent. |
| `transcript_thread_count` | Number of assembled conversation threads, or zero for a null transcript. |
| `transcript_observation_count` | Ordered, deduplicated observations passed to assembly and the Topics renderer. The `observation_count` span attribute is the raw row count before deduplication. |
| `transcript_history_message_count`, `transcript_history_part_count` | Replayed messages and their normalized parts across all assembled threads. |
| `transcript_current_turn_message_count`, `transcript_current_turn_part_count` | This-trace messages and their normalized parts across all assembled threads. |
| `transcript_current_turn_tool_call_count`, `transcript_current_turn_tool_result_count` | Tool-call parts and tool-result parts in this trace; a tool-role part also counts as a result. |
| `transcript_assembly_phase_duration_ms` | Two non-overlapping samples per trace tagged `phase:normalization` or `phase:matching`. Normalization includes initial message-key construction and partitioning; matching covers remaining assembly work, including tool matching, deduplication, any rebuilt keys and finalization. Observation ordering is outside these phases but remains in total assembly time. |
| `topics_transcript_characters` | UTF-16 length of the complete rendered Topics text, including labels, section headings and line breaks; admitted traces only. |
| `topics_transcript_tokens` | o200k estimate of that same text, tagged `tokenizer:o200k_base`; admitted traces only. |
| `transcript_comparison_render_duration_ms` | Time to serialize assembled JSON and render generic and Topics text, excluding tokenization. |
| `transcript_comparison_tokenization_duration_ms` | Wall time for the three sequential JSON, generic and Topics token estimates, excluding the existing current-turn/history estimates. |
| `topics_transcript_block_characters` | Present block content length tagged `block:user\|assistant\|system\|reasoning\|tool_calls\|tool_results\|tool_definitions\|errors\|run_io\|observations` and `stage:raw\|clipped`; absent blocks emit no sample. |
| `topics_transcript_blocks_cut` | Number of content blocks cut by their per-block character caps. |
| `topics_transcript_history_characters`, `topics_transcript_current_turn_characters`, `topics_transcript_history_share` | Rendered content-line characters from replayed input and this run, plus replayed input divided by their sum (0 when both are empty). This-run content includes fallback trace-level I/O, observation markers, and inline errors. |

Topics measurement uses the existing assembled transcript and the inclusive
Topics preset in `packages/shared/src/server/transcript/topics-renderer-config.ts`. It
does not call a model or store the text. The preset includes all block types and
history, caps fallback trace-level input and output at 10,000 characters each,
and caps each system message at 600 characters. These are separate per-block
limits, not a combined trace budget. The preset has no total token budget. It
omits no middle lines. The rendered text has
`<run_facts>`, optional `<tools>` and `<earlier_conversation source="replayed input">`,
`<this_run>`, and `<end_of_run>` sections in that order. Observation markers show
the Langfuse operation type and name in walk order; matched tool results already
identify their operation. Trace input appears as the request when no current-run
user message exists. If it differs from the rendered input messages, it appears
as trace context alongside the user request, capped at the user block limit
(2,000 characters in this preset). A trace output matching the last assistant
message or tool
result labels that message as final output; distinct application output appears
once as `[final output]`. Thread segments follow observation
order; the replayed prefix does not claim to come from a previous trace. Tool
calls and results share a number, and observation errors appear after the last
message emitted at or before their position in the observation walk. The facts
line counts rendered user entries and tool calls across threads; repeated
content in separate threads is not necessarily a distinct user turn. `raw` block
characters are counted after media redaction and whitespace collapse but before
a block cap; `clipped` counts the resulting content including any omission marker.
Block values exclude
role labels, section headings, run facts and line breaks; media placeholders
can add characters to the complete text without adding to a block metric. The
history share uses content lines including role labels, tool exchanges, fallback
root I/O, observation markers and inline errors, excluding section headings and
tool definitions. Keep
numerator and denominator on the same basis when calculating shares. Ingestion
applies `LANGFUSE_TRACE_BATCH_SAMPLING_RATE` by trace ID before the dispatcher
and worker; every admitted trace receives Topics measurements.

Transcript token counts use the existing local worker-thread pool and bundled
tiktoken WASM, without a network or model API call. The `gpt-4o` configuration
selects `o200k_base`, also used by GPT-5 mini and nano
([OpenAI mapping](https://github.com/openai/tiktoken/blob/main/tiktoken/model.py)); metrics are tagged
`tokenizer:o200k_base`. These are serialized-payload estimates, not provider
billing counts or a model's full request framing.
Current turn and history use identical `{ messages: [{ role, parts }] }` JSON
framing, without observation provenance. Only nonempty partitions are tokenized,
at most twice per trace. Their sum is `transcript_message_tokens`; it is not
directly comparable to the full assembled-transcript JSON or rendered text. The
`transcript_json_*`, `generic_transcript_*`, and `topics_transcript_*` length
distributions are attempted on the same admitted trace cohort and can be
compared at p50/p90/p99 after checking their sample counts. The generic
renderer preserves the previous plain-text layout under the same Topics
per-block preset; it has no trace-root I/O or run-state sections. Empty
transcripts have zero JSON length and tokens. Thread counts are numeric
samples, never metric tags.

To diagnose large Topics texts, compare `topics_transcript_tokens` with
`transcript_observation_count`, the history/current-turn message and part counts,
current-turn tool-call/result counts, `topics_transcript_history_share`, and
raw/clipped characters by block type. Structure counts describe the assembled
source, before the renderer's per-block character caps; they are not a count of
visible lines. A last-N history policy can use each thread's
`conversationHistory`, but a per-thread N would still grow with the number of
threads. A future total history budget should account for all threads; tool
loops should retain call/result pairs and errors when shortened.

For rough tool-response size share, divide `transcript_tool_response_characters`
by `transcript_content_characters` (when nonzero). Both sum serialized parts on
the same basis, including part JSON syntax but excluding message wrappers and
provenance. This is a character share, not a token share. For an overall traffic
share, divide the sums rather than averaging per-trace percentages. These metrics
are emitted before tokenization, including when it fails; no tool tokenizer runs.
Unknown estimates are omitted and counted in `token_estimation_unavailable`.
Rejected estimates increment `token_estimation_failed` and stop the remaining
estimates for that trace; successful earlier samples are retained. Unknown
estimates do not stop later estimates. The summed estimate is omitted unless
both partitions are known. Neither failure retries the batch.
Current-turn and history message projections are tokenized first. Each admitted
trace then adds one full-JSON, one generic plain-text, and one Topics plain-text
tokenization call.
Missing or failed JSON estimates increment `transcript_json_token_estimation_unavailable`
or `transcript_json_failed` without stopping later measurements. Generic text
rendering or token failures increment `generic_transcript_failed`, while an
unavailable token estimate increments
`generic_transcript_token_estimation_unavailable`. These do not stop Topics.
Topics rendering failures increment `topics_transcript_failed` and leave the
batch successful. An
unavailable Topics token estimate increments
`topics_transcript_token_estimation_unavailable`; a rejected estimate increments
`topics_transcript_failed`. Character metrics remain available in either case.

The worker submits one transcript for tokenization while streaming the next
trace's observations. Before submitting another transcript it awaits the previous
promise. Projections are tokenized sequentially, keeping at most one pending
tokenizer request per batch. Success and stream
failure both drain accepted promises; a stream failure never assembles its
partial final trace. Assembly itself remains synchronous. `read_duration_ms`
includes all this processing.

Memory includes the current trace, the previous transcript being tokenized and
stream buffers, multiplied by active batch jobs. Each trace also retains its
assembled JSON, generic text, and Topics text for sequential tokenizer calls.
A single trace remains unbounded. Each message belongs to one JSON partition;
there is no additional tool-response tokenization pass.
The default two-thread tokenizer pool is shared with ingestion; overlap hides
waiting time but does not remove CPU use or contention. Its existing 30-second
timeout rejects the promise without cancelling queued/running encoding, so the
pending-promise bound is not a cancellation guarantee. Watch tokenization failures
alongside `runtime.node.mem.rss`, `runtime.node.mem.heap_used`, worker
CPU and queue depth before raising batch concurrency.

ClickHouse must sort the filtered result, so compare query memory and latency against the unordered
baseline before increasing load.

Enable percentile aggregations for these distribution metrics in Datadog
Metrics Summary, then select p50, p75, p90, p95 and p99 in Metrics Explorer.
Datadog computes these across workers; do not average worker percentiles.
See [Datadog distributions](https://docs.datadoghq.com/metrics/distributions/).
Metric delivery and percentile configuration must be verified after deployment.

### Inspect individual transcripts in Datadog

Each completed trace emits a `trace-batch-transcript` child span under the batch
processing span. Its attributes include `langfuse.project.id`, `langfuse.trace.id`,
and `langfuse.trace.url` (a peek link using the configured product base URL).
Under `langfuse.trace_batch`, the span records `transcript_message_tokens`, `transcript_characters`,
`transcript_json_characters`, `transcript_json_tokens`,
`generic_transcript_characters`, `generic_transcript_tokens`,
`topics_transcript_characters`, `topics_transcript_tokens`,
`transcript_comparison_render_duration_ms`,
`transcript_comparison_tokenization_duration_ms`,
`transcript_assembly_duration_ms`, `observation_count` (rows before observation
deduplication), `has_transcript`, `tokenizer`, and `experiment_id`.
It also records the token breakdown and content/tool-response character metrics,
`transcript_thread_count`,
and each phase as `transcript_assembly_<phase>_duration_ms`.
It also records the remaining Topics metrics above. Block character attributes use
`topics_transcript_block_<block>_<stage>_characters`. Topics character metrics
are absent if rendering failed; the token metric can also be absent if its
estimate failed.
No transcript content is attached, and IDs are not distribution metric tags.
`transcript_characters` is the legacy span-only name for the same value as
`transcript_json_characters`. The full JSON includes syntax and provenance, so
use `transcript_content_characters` as the tool-response denominator. JSON
characters are recorded before tokenization and remain available if an estimate
fails. The JSON string is retained only until its sequential token count settles;
it is not included in the assembly-duration measurement.

The span stays open until token estimation settles, so its duration includes
tokenization and pool waits. Use the assembly-duration attribute for assembly
performance. Missing estimates have `token_estimation:unavailable|failed`; their
counts are omitted while successful earlier estimates remain. Null transcripts
have zero tokens. The child span does not become
active while the next trace streams, and failed streams do not emit a span for
their partial final trace.

In Datadog APM Trace Explorer, search for:

```text
env:prod-eu service:worker-cpu resource_name:trace-batch-transcript @langfuse.trace_batch.transcript_message_tokens:>=100000
```

Add token count as a numeric measure to sort largest first, display the project
and trace IDs, and open `langfuse.trace.url`. The peek view shows the current
source observations, not a saved copy of the measured transcript. Late arrivals
and retries can produce different or repeated samples for the same trace.

These spans follow existing APM ingestion sampling and retention. Configure a
[custom retention filter](https://docs.datadoghq.com/tracing/trace_pipeline/trace_retention/)
at 100% for the outlier query to keep matching ingested spans searchable. This
cannot recover spans dropped before ingestion. Distribution metrics remain
independent and cannot identify a historical sample's trace retroactively.

## Capacity measurements

The following metrics use the `langfuse.trace_batch` prefix. All additions are
inside the existing cloud experiment paths; normal ingestion with tracking
disabled performs no new aggregation or Redis calls.

| Metric | Kind / tags | Meaning |
| --- | --- | --- |
| `event_updates`, `serialized_event_bytes` | Counters; `stage:eligible\|sampled\|recorded` | Accepted, valid-start-time updates before sampling, after sampling, and in Redis-acknowledged chunks. Repeated updates count again. |
| `read_attempts` | Counter; `outcome:success\|failure\|discard` | One outcome per processor invocation, including retries, validation failures and disabled/expired discards. |
| `read_duration_ms` | Distribution; same outcome tags | Wall-clock processor duration, including failed and discarded attempts. |
| `active_reads` | Per-process gauge | Streams currently being consumed; failures decrement the count too. |
| `failed_read_observation_count`, `failed_read_input_bytes`, `failed_read_output_bytes`, `failed_read_metadata_bytes`, `failed_read_io_metadata_bytes` | Distributions | Partial logical rows/bytes consumed before a stream failure. Separate from successful throughput. |
| `queue_depth` | Gauge; `type:waiting\|active\|delayed\|failed` | Global BullMQ snapshots; waiting includes paused work. |
| `queue_waiting_head_age_ms` | Gauge | Maximum creation age of the next FIFO jobs in waiting/paused lists. Zero when empty. |
| `redis_key_bytes` | Gauge; `key:due\|state` | Estimated memory of each readiness key, including Redis overhead. |
| `redis_key_entries` | Gauge; `key:due\|state` | `ZCARD` / `HLEN` at the memory snapshot. |

The eligible/sampled counters reuse the already-computed serialized size and
per-trace aggregates. Recorded volume is emitted after each acknowledged Lua
chunk: earlier chunks remain counted if a later one fails. A timeout can mean
Redis applied an update without acknowledgement, so the stage difference includes
uncertain outcomes; it does not prove data loss. Writer acceptance still precedes
the ClickHouse flush. No additional serialization is performed.

`TraceBatchMetricsRunner` starts when either the dispatcher or consumer is
enabled in a cloud worker, independently of the generic queue-metrics flag.
It polls the queue every 30 seconds and map memory every 60 seconds per process,
plus collection time. No completed jobs or progressing dispatcher are required.
Queue-age collection reads only the next waiting/paused job IDs and their
timestamp fields; it never fetches or parses batch payloads.
One failed collection does not suppress the others; failed samples are not
reported as zero. Check `langfuse.periodic_runner.completed` and
`last_healthy_timestamp_seconds` with `runner:trace_batch_metrics` for freshness.

Memory collection uses one bounded two-key Lua call with `MEMORY USAGE ...
SAMPLES 5`, preserving the shared key prefix and Redis Cluster slot routing.
Missing keys report zero; there is no keyspace scan or exact full-hash traversal.
Memory sampling estimates storage, not process RSS or event payload size.

Queue/map snapshots are global and can be emitted by several workers: use
max/latest across reporters, never sum duplicates. For map totals, first
deduplicate reporters per `key`, then add the due/state estimates. In contrast,
`active_reads` is local to a worker; distinct live worker series may be summed.
It is emitted on stream start/finish and on each metrics-runner cycle, including
zero when idle, so unchanged long-running reads remain visible.
Instantaneous gauges can miss short-lived peaks. A retried job may re-enter
behind newer jobs, so waiting-head age is a bounded-cost backlog indicator, not
an exact oldest-created-job measurement across the entire queue.

With an experiment ID, start/completion logs include `jobId`, `attempt`,
`queryId` and `experimentId`, with the completion outcome. The per-read UUID is
forwarded to ClickHouse as `query_id` and remains the root correlation ID for
the stream. Discards and validation failures have no query ID. Identifiers are
not metric tags and logs contain no event payloads. Successful batch metrics and
job return values retain their existing meanings.

Completion logs also correlate the requested `batchTraceCount`, distinct
`batchProjectCount`, `eventTimeSpanMs` (outer event-time span, without query
buffering), and `maxTraceSpanMs` with the outcome and `durationMs`. These are
batch-locality proxies, not measured ClickHouse scan costs. `observationCount`,
`foundTraceCount`, `foundProjectCount` and separate `inputBytes`, `outputBytes`,
`metadataBytes` describe rows consumed by that attempt. `partial: true` marks
failed reads, including failures before any row arrives; zero then does not mean
the requested batch was empty. Successful counts cover the completed stream,
not unique ingested events. Discarded/unparsed jobs omit stream counters.
Use these existing logs to compare batch shape and volume across outcomes by
query ID; no payload contents, project-ID lists or per-batch metric tags are added.

With an experiment ID, the BullMQ processing span also carries attributes under
`langfuse.trace_batch.*`: `experiment_id`, `job_id`, `attempt` (one-based),
`query_id`, `batch_trace_count`, `batch_project_count`, `event_time_span_ms`,
and `max_trace_span_ms`. Shape and query ID are attached before reading, so they
remain available if the stream fails. Completion adds `outcome`, `duration_ms`,
`observation_count`, `found_trace_count`, `found_project_count`, `input_bytes`,
`output_bytes`, `metadata_bytes`, and `partial`, with the same semantics as the
logs. Discards and validation failures omit query/stream fields. These reuse
existing aggregates without additional queries or serialization. Payloads and
project/trace-ID lists are not attached. Dispatcher size estimates remain aggregate
metrics, not per-job span attributes; consumed bytes are not estimated total size.
Span availability follows the existing tracing sampling and retention settings.

For the initial scaling curve, use deterministic trace sampling at 10%, 20%,
50%, then 100% across the same project population. Annotate fixed UTC windows;
pause tracking and drain old readiness/queued work between settings. Warm up at
least 20 minutes and compare a settled hour at each stage, holding batch/query
settings fixed. Plot actual admitted updates/bytes and returned rows/bytes against
CPU, memory and backlog rather than assuming configured percentages equal load.
These additions do not generate amplified reads or change batching, query limits,
late-arrival behavior, queue payloads or retention.

Pair the metrics with per-worker RSS/CPU/event-loop and network telemetry, Redis
primary telemetry, and experiment-filtered ClickHouse query logs. Include failed
attempts in CPU cost, count successful root results once, and verify distributed
CPU-counter accounting before summing query parts. Query memory peaks are not
actual concurrent replica RAM. Validate live metric delivery and units before
raising production load.

## Compare reader settings

Establish a fresh control measurement after deploying this reader: both arms
must use the same per-trace windows and compression. Hold sampling, batch cap,
concurrency, threads, idle delay and traffic cohort constant; then change only
block size (and the identifying label):

| Variable                              | Control               | Treatment         |
| ------------------------------------- | --------------------- | ----------------- |
| `LANGFUSE_TRACE_BATCH_MAX_THREADS`    | `2`                   | `2`               |
| `LANGFUSE_TRACE_BATCH_MAX_BLOCK_SIZE` | unset                 | `512`             |
| `LANGFUSE_TRACE_BATCH_EXPERIMENT_ID`  | `trace-block-control` | `trace-block-512` |

Run these settings only in cloud workers with the existing four enablement
flags explicitly set to `true`. Changing a query setting does not enable any
part of the pipeline. `max_block_size` is a row-count hint, not a byte or memory
limit; large inputs may still dominate memory. Keep the initial cap at 120 when
comparing existing experiments; raising the supported ceiling is not a rollout
recommendation.

With an experiment ID, each read attempt logs its label, build ID, configured
threads/block size, batch size, concurrency, sampling and timing controls before
querying, including failed attempts. The same ID enters ClickHouse
`log_comment` alongside existing surface/route/project attribution. Leave the ID
unset to suppress these per-attempt logs. Strategy attribution uses the
dispatcher metrics described below. Compare
query memory/latency and worker memory as well as input/output/metadata byte
metrics. Redis storage load tests do not measure selector or query memory.

### Opt-in locality grouping

`LANGFUSE_TRACE_BATCH_STRATEGY=locality` changes grouping only after dispatch is
explicitly enabled in a cloud region. The default `project` strategy preserves
project ordering and carries unfinished jobs across hydration chunks.

Locality sorts each hydrated window by project, minimum start minute, maximum
start minute and `xxHash32(traceId)`. It finds the fewest feasible jobs under the
trace cap and an event-time envelope of at most one hour, or 125% of the first
trace's observed span if larger. Within that job count, it minimizes project
boundaries, then minute × trace count, then gaps between trace hashes. These are
read-locality proxies, not measured ClickHouse scan costs.

Locality combines each window of at most 1,000 hydrated candidates with retained
partials. Compatible same-project partials may merge when their buffered time
intervals overlap and the combined batch respects the cap and envelope limits.
At most `maxBatchSize - 1` traces are retained across all partials; oldest-due
partials dispatch first when that budget is exceeded. The last window flushes
all remaining partials, so carry never outlives the current dispatch run.

The full ready-ID snapshot remains unchanged; only selector input is bounded. Selector
cost is O(n × k × cap), where k is the fewest feasible jobs. Measure duration
before increasing scale, especially with distant event times that force many jobs.

Compare `dispatched_batches` (tags `strategy`, `fill`),
`event_time_envelope_ms`, `observed_start_span_ms`, `candidate_buffer_size` and
`selector_duration_ms` under `langfuse.trace_batch`. The envelope metric includes
the reader's two-minute margin on each side; the selector's envelope limit does
not. Payload and Redis state are unchanged.

## Monitor dispatcher memory

The baseline intentionally snapshots the complete ready cohort. Batch size limits
jobs, not snapshot memory. Retain this behavior for the initial experiment and
watch memory alongside backlog growth before deciding whether to add paging.

The worker enables Datadog Node runtime metrics. In Metrics Explorer, filter to
the experiment environment and worker service, and inspect the maximum per
worker/container rather than a fleet average:

- `runtime.node.mem.rss`: total process memory; compare with the container limit.
- `runtime.node.mem.heap_used`: JavaScript heap in use.
- `langfuse.trace_batch.snapshot_size`, `pending_traces`, `ready_traces` and
  `oldest_due_age_ms`: snapshot and backlog growth.
- `langfuse.periodic_runner.duration_ms` and `completed`, filtered by
  `runner:trace_batch_dispatcher`: run duration and outcome.

Runtime memory is shared with other work in the process, so correlation with
dispatch runs does not isolate the dispatcher's allocations. Periodic sampling
can miss short peaks, and `snapshot_size` is emitted only after parsing/sorting
finishes. Check worker restarts/OOM events as well. Verify live metric delivery
and available instance tags in Datadog before relying on these signals.

## Stop and drain

Disable ingestion and dispatch to stop new work. Leave the consumer enabled and
set the read flag to `false` to complete and remove jobs without querying or
parsing their payloads. Jobs at least two hours old are also discarded on pickup.
Reads already in progress finish under their query timeout.

On process shutdown, the dispatcher stops scheduling and waits up to five seconds
for its active dispatch. If Redis stalls, it logs a warning and lets the remaining
shutdown steps proceed. This timeout does not cancel an already issued Redis command.

BullMQ waiting jobs have no autonomous TTL: disabling all consumers leaves them
queued until consumption resumes. Draining requires an active, unpaused worker;
delayed jobs become eligible later. Normal completed jobs retain IDs for up to
one hour / 10,000 jobs, and failures retain up to 1,000 jobs under BullMQ's
lazy retention rules. Drain and expired jobs are removed immediately on success.

For an already enabled cloud experiment, explicitly set the new read flag to
`true` when deploying this version if reads should continue; leaving it unset
drains instead. Upgrade all producers before relying on native expiry: older
producers do not install or refresh that TTL.
