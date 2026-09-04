# PoC: OTel ingestion — ClickHouse transform (Path A) vs Rust worker (Path B)

**Path A** makes ClickHouse do the transform. Once the web tier has written a
raw per-request OpenTelemetry (OTel) JSON file to object storage, ClickHouse
fetches it directly with `s3()`, parses it once, and runs the generated SQL
pipeline. In the ClickHouse-service layout measured here, the coordinator
only sends SQL and ClickHouse reads the raw payload directly from S3.

**Path B** performs the same transform in a long-running Rust worker
(`engine-rust/`). It uses the same fixture dataset, output schema, test
harness, and commit protocol as Path A. Per-column checksums across the output
prove that both implementations produce the same rows.

Both paths load each batch into an isolated staging table, verify the row
count, and publish it atomically with `MOVE PARTITION`, so readers see either
the complete batch or none of it. The ledger tracks the batch identity
and whether it needs to be retried. In the proposed production design, these
two pieces provide exactly-once processing without depending on ClickHouse
deduplication tokens or their limited retention window.

## Layout

```
# shared driver + verifiers (engine-agnostic)
EXPERIMENTS.md        38-entry experiment log, findings, and deep dives
harness.mjs           run driver (--engine ch|rust): schedules commit batches, prints summary
bench.mjs             alternating multi-run comparison -> median [min..max] table
checksum.mjs          per-column cityHash64 sums: proves Path A output ≡ Path B output
verify-retry.mjs      crash after INSERT, before MOVE -> retry publishes one copy
verify-media.mjs      verifies manifest offsets and hashes against raw files
gen-fixtures.mjs      corpus -> MinIO (protobuf-decoded + OTLP/JSON, ~28 attributes, media)
transfer-bench.mjs    web->worker format shootout: raw archives vs protobuf vs parquet
# Path A (commit protocol in engine.mjs)
engine-ch/engine.mjs  TRUNCATE -> INSERT SELECT FROM s3() -> count -> MOVE
engine-ch/sql/        schema mirroring events_full + generated transform
engine-ch/pipeline/   typed stage compiler (core.ts), domain helpers (otel.ts),
                      pipeline definition (ingest.pipeline.ts), gen.mjs
# Path B (commit protocol inside the worker; one process per run)
engine-rust/          long-running worker: GET -> transform -> INSERT -> MOVE
```

## Run (dev stack: `clickhouse` + `minio` from docker-compose.dev.yml)

```bash
node gen-fixtures.mjs 200 10        # fresh corpus, fresh S3 prefix (3rd arg: N ~50 MB traces)
node harness.mjs --concurrency 4 && node checksum.mjs ch      # Path A
node verify-retry.mjs && node verify-media.mjs 25
# TRUNCATE poc_chlb.events_poc, then:
(cd engine-rust && cargo build --release && cargo test --release)
node harness.mjs --engine rust --concurrency 4
node checksum.mjs rust ch           # Path B + parity proof against Path A
node bench.mjs 6 4                  # alternating runs, median comparison
node engine-ch/pipeline/gen.mjs     # regenerate SQL from the typed pipeline
pnpm exec tsc --noEmit --strict --target es2022 --module nodenext \
  --moduleResolution nodenext --allowImportingTsExtensions engine-ch/pipeline/*.ts
```

Reset the target between runs with `TRUNCATE TABLE poc_chlb.events_poc`. There
is intentionally no row-level dedup in the PoC; the Redis ledger owns batch
identity in the real system.

The harness calls each commit batch a **window**: a group of raw files that is
staged, verified, and published as one unit.

## How it executes, and where it fits

```
   SDKs ──OTLP──► web (lands raw batches; outside this PoC)
                        │ batch key                     │ raw batch PUT
                        ▼                               ▼
              ┌──────────────────┐            ┌──────────────────────┐
              │   Redis ledger   │            │     S3 raw zone      │
              │ pending → acked  │            │ immutable source     │
              │                  │            │ for replay/backfill  │
              └────────┬─────────┘            └──────────┬───────────┘
                       │ claim / ack                     │ GET raw objects
                       ▼                                 │
              ┌──────────────────┐  keys + staging slot  │
              │   coordinator    │────────────────┐      │
              │ lightweight      │                ▼      ▼
              │ control plane    │       ┌────────────────────────────┐
              └────────┬─────────┘       │ transformation compute     │
                       │                 │ A: ClickHouse (native C++) │
                       │                 │ B: native Rust             │
                       │                 └─────────────┬──────────────┘
                       │ count / publish               │ transformed rows
                       └──────────────────┐  ┌─────────┘
                                          ▼  ▼
                               ┌──────────────────────────────┐
                               │      ClickHouse storage      │
                               │ staging → count → MOVE       │
                               │              → events        │
                               └──────────────┬───────────────┘
                                              │ media_manifest
                                              ▼
                                     ┌────────────────┐
              S3 raw zone ◄── GET ────┤ media uploader ├──── PUT ──► S3 media
                                     └────────┬───────┘
                                              │ create/update links
                                              ▼
                                           Postgres
```

These are logical roles, not necessarily separate services:

- **Path A (the ClickHouse-service layout measured here)** groups
  transformation compute and storage in ClickHouse. The coordinator stays
  separate and sends batch keys plus a small number of SQL statements. Raw
  bytes flow directly from S3 to ClickHouse.
- **Path B** groups coordination and transformation compute in the
  long-running Rust worker. ClickHouse only receives transformed rows and
  handles storage and publication. Raw bytes flow from S3 through the Rust
  worker to ClickHouse.
- **Path A with embedded chDB** can instead group coordination and ClickHouse
  compute in one process, while keeping production ClickHouse as storage.

The physical grouping changes, but the split of responsibilities does not:
coordination remains lightweight, while parsing and transformation run in a
native execution engine—ClickHouse's C++ engine for Path A or Rust for Path B.
The TypeScript pipeline generates SQL; it is not in the runtime data path.

One batch follows five steps:

1. **Land:** The web tier writes the raw batch to S3 and adds its object keys
   to the Redis ledger. How it assembles those batches is outside this PoC;
   the proposed object format is described below.

2. **Claim:** A coordinator claims the batch through a Redis stream consumer
   group. Multiple coordinators can share the stream, and claims left by a
   crashed coordinator can be recovered from the pending list. The coordinator
   assigns an unused staging table and passes the batch keys to the
   transformation engine.

3. **Transform and stage:** In Path A, the coordinator issues one
   `INSERT INTO staging_k SELECT … FROM s3(<keys>)`. ClickHouse fetches,
   transforms, and stages the rows internally. In Path B, the Rust engine
   fetches and transforms the raw files, then streams the resulting rows into
   the same kind of ClickHouse staging table.

4. **Publish:** The coordinator verifies the staged row count, then uses
   `MOVE PARTITION TO TABLE` to make the rows visible atomically. The move is
   metadata-only and took 2–3ms in this PoC.

5. **Acknowledge:** The coordinator marks the ledger entry as complete.

A retry truncates its staging table and repeats the deterministic transform
against the immutable raw file. `verify-retry.mjs` simulates a crash after the
staging insert but before the atomic move, and verifies that the retry
publishes one copy. Each output row also stores its source object path in
`blob_storage_file_path`. If the ledger is lost, comparing the objects in S3
with the source paths already present in the events table reconstructs the
pending work. In this PoC, the harness acts as the coordinator and the ledger
is stubbed out.

**Batches overlap.** While batch N is being published, batch N+1 can load into
a different staging table and the web tier can write batch N+2 to S3. Each
`harness.mjs --concurrency` slot owns one staging table, so clearing a failed
batch cannot affect another batch that is still running.

Only the final `MOVE PARTITION TO TABLE` calls are serialized. ClickHouse
25.12 can race when concurrent moves target the same table. Since each move
takes only milliseconds, the lock has negligible cost; the slower INSERTs
still run concurrently.

**The raw-zone object format.** Today the web tier decodes protobuf and JSON
exports and rewrites both as JSON before storing them in S3. The proposed flow
keeps each validated payload unchanged and packs payloads into 16–32 MB
tar.zst objects. This removes the re-encoding step and, in our comparison, cut
the object count from 202 to 2.

Re-encoding did not save enough space to justify the extra format. On this
corpus, uncompressed protobuf was only 2% smaller than JSON; after zstd, the
archive of unchanged JSON was 43.9 MB, versus 44.5 MB for protobuf and 44.2 MB
for parquet. ClickHouse can read JSON members directly from tar.zst, so Path A
does not need an unpacking step. Reading protobuf members from SQL remains
untested. The engine *benchmarks below still use one file per request*; entry 38
in [EXPERIMENTS.md](EXPERIMENTS.md) has the transfer-format results.

**Path A compute placement.** The measured layout runs the generated SQL on
the ClickHouse service that also stores the events. The same SQL can instead
run in chDB (embedded ClickHouse) inside the coordinator. That would move
ingestion CPU off the production query service and scale it by adding
coordinator containers. The placement changes; the transform does not.

**The media uploader is a separate asynchronous consumer.** During the
transform, each base64 data URI is replaced with a content-addressed token.
The event row stores a `media_manifest` entry with the source field, its byte
range in the original value, the content type, and a `media_id` derived from
the decoded content's SHA-256 hash.

The uploader later reads the original file, uses the manifest to recover and
decode the blob, verifies its hash, writes it to the media bucket, and creates
or updates the Postgres media/link rows. The offsets are UTF-8 **byte**
offsets, not character positions; JavaScript string slicing would be wrong
after non-ASCII text. Grouping work by source file means each raw file only
needs to be fetched once per uploader run.

Content-addressed keys make retries and duplicate deliveries safe. Events can
be queried before their media upload finishes, matching today's client-side
upload contract. `verify-media.mjs` implements the same flow without writing
the blob to the media bucket.

## The engines

**Path A.** ClickHouse fetches, transforms, and stages a batch as one native
query. The typed TypeScript pipeline only generates that SQL; each stage
becomes a named subquery that can be run independently for testing or
production debugging. Runtime scheduling and memory rely on ClickHouse's
query-level controls; there is no separate ingestion-specific budget.

**Path B.** `engine-rust/` is a roughly 800-line, long-running worker that
overlaps S3 downloads, JSON parsing, and ClickHouse writes without allowing
downloads to run arbitrarily far ahead. Process-wide limits cap network
concurrency and the total bytes held from download through the final row
write; a batch timeout turns stalls into retryable failures. One INSERT per
batch avoids creating many small ClickHouse parts. A wrong-typed optional
field falls back to an empty or zero value instead of rejecting the whole raw
file.

After every change to Path B, we compare all 38 output columns with
order-independent checksums and run the retry and media verifiers. Compiler,
type-system, and worker details are in [EXPERIMENTS.md](EXPERIMENTS.md).

## Results

### Standard corpus

The seeded 329 MB corpus contains ~5.6k spans in 10 batches. Event sizes follow
measured production quantiles and payloads compress ~8.7×. Two batches contain
a ~60 MB single-span trace to test whether one unusually large object causes
disproportionate memory use. These are median [min..max] results from
alternating runs on laptop Docker ClickHouse 26.2 (the production version),
excluding the warmup pair.

|                      | Path A (SQL in ClickHouse)      | Path B (Rust worker)                               |
| -------------------- | ------------------------------- | -------------------------------------------------- |
| wall @ concurrency 4 | 0.90 s [0.80..0.90] → 366 MB/s  | 0.50 s [0.50..0.60] → 693 MB/s                     |
| total CPU            | 3.16 s [3.14..3.24] (all in CH) | 1.36 s [1.30..1.43] (0.63 worker + 0.71 CH insert) |
| peak memory          | 2.52 GiB server [2519..2529]    | 487 MiB worker + 554 MiB CH insert                 |
| per-batch insert     | 221 ms [169..521]               | 73 ms [42..323]                                    |

The large traces are what push Path A to 2.52 GiB. Profiles point to
ClickHouse copying large arrays while evaluating the generated SQL, and the
settings we tried did not cap those allocations. Path B peaked at 487 MiB in
the worker, with another 554 MiB used by ClickHouse to store its output. The
[full size-skew analysis](EXPERIMENTS.md#size-skew-stress-the-full-story) has
the profiles and mitigations.

The transform work itself is at parity. The CPU difference comes from setup
performed once per batch. Path B originally started a new process for every
batch; keeping one worker alive for the full run removed that cost without
changing the commit size. Path A makes ClickHouse parse and plan the generated
SQL for every batch. On the same corpus, 10 statements used 2.37 CPU-s versus
1.39 CPU-s for one combined statement.

ClickHouse has no plan cache that lets Path A reuse that work, and
parameterized views measured worse. Larger batches amortize the planning cost
but also create coarser commits and roughly double peak memory. ClickHouse
26.6 reduces the planning cost by 4.5×; 26.2 behaves roughly like 25.12.

Both paths exceed the current EU production ingestion rate (~16 MB/s) by more
than 20× on this local benchmark.

### Cloud (staging, real S3, ClickHouse Cloud 26.2)

The same harness ran against real S3 and a pinned ClickHouse Cloud 26.2
SharedMergeTree service, first at 8 vCPU / 32 GB and then at 16 vCPU / 64 GB.
The driver and Rust worker shared an in-region 8 vCPU host. The seeded 1.35 GB
corpus has 40 windows, four with a ~60 MB single-span file. Checksums and media
offsets held on the first run.

|                            | Path A                | Path B                              |
| -------------------------- | --------------------- | ----------------------------------- |
| wall @ 16, 8 vCPU service  | 6.6 s → 205 MB/s      | 3.9 s → 344 MB/s                    |
| wall @ 16, 16 vCPU service | 4.6 s → 297 MB/s      | 3.7 s → 367 MB/s                    |
| total CPU                  | 26.8 s                | 16.9 s (7.1 worker + 9.8 CH insert) |
| peak memory                | ~2.6 GiB server/query | 469 MiB CH insert + ~0.8 GiB worker |

Both engines are shown with their best settings. On the 8 vCPU service, Path B
finished in 3.9 s versus Path A's 6.6 s. Across the best runs, Path A used
roughly 1.6× as much total CPU. Doubling the ClickHouse service narrowed Path
A's wall-time gap from 69% to 24%, but did not reduce its CPU use. Path A can
therefore buy back wall time with a larger service; Path B avoids the
query-analysis and large-array-copy work.

**S3 economics.** On SharedMergeTree, `MOVE PARTITION` moved metadata rather
than copying parts: `S3CopyObject` stayed at ~0 across full runs, and concurrent
moves were error-free across hundreds of commits. Both paths therefore pay one
GET per raw file, one packed-part PUT per window, and the eventual
background-merge rewrite; publishing adds no requests.

## Developer experience

**Input formats.** Production raw files contain two ID representations:
OTLP/JSON uses hex strings, while protobuf-decoded JSON uses byte arrays. Path
A normalizes both through a typed SQL helper; Path B represents the two forms
as a Rust enum. Both keep this compatibility logic in one place.

Path A:

```ts
export const otelId = (container: Expr<"JSON">, field: string): HexId =>
  ifNull_<"String", "hex">(
    asHex(jsonTyped(container, field, "String")),
    lower(
      hexOf(
        arrayStringConcat(
          arrayMap(
            (b) => charF(b),
            castTo(jsonPath(container, field, "data"), "Array(UInt8)"),
          ),
        ),
      ),
    ),
  );
```

Path B:

```rust
#[serde(untagged)]
pub enum Id { Hex(String), Buffer { data: Vec<u8> }, Other(IgnoredAny) }

impl Id {
    pub fn into_hex(self) -> String {
        match self {
            Id::Hex(s) => s,
            Id::Buffer { data } => hex_lower(&data),
            Id::Other(_) => String::new(),
        }
    }
}
```

**Media offsets.** The uploader needs the byte position and length of every
data URI in the original field. ClickHouse's regex functions return matches
but not their positions, so Path A has to derive them from the lengths of the
preceding text:

```sql
arrayCumSum(arrayMap(x -> length(x), frags)) AS cum_frag_lens,
arrayCumSum(match_lens) AS cum_match_lens,
arrayMap(x -> toUInt32(cum_frag_lens[x] + if(x > 1, cum_match_lens[x - 1], 0)),
         arrayEnumerate(media_matches)) AS offsets
```

Rust's regex iterator returns those positions directly:

```rust
for caps in MEDIA_RE.captures_iter(&input) {
    let m = caps.get(0).unwrap();
    manifest.push((media_id, content_type.to_owned(), "input".to_owned(),
                   m.start() as u32, m.len() as u32));
}
```

This is the clearest case where the Rust implementation is simpler.

**Production debugging.** Every Path A stage is a named SQL relation in the
same dialect that runs in production. We can query any stage against the
original S3 file from the ClickHouse console:

```sql
SELECT metadata_names, metadata_values FROM enriched -- any stage by name
WHERE span_id = 'deadbeef...'                        -- exact raw file via s3()
```

Path B requires downloading the file and using a debugger or unit test
instead.

**Runtime tuning.** Before Path B downloads an object, it reserves that
object's size from a process-wide memory budget. The reservation is released
only after all resulting rows have been written, so a few unusually large
files cannot bypass the limit:

```rust
let mem = memory.acquire_many_owned(kib).await?; // bytes admitted, not files
// ...GET, transform, write rows... permit drops after the last row
```

Path A is limited to the controls exposed by ClickHouse, and none of them
addressed the stress-test peak seen here.

The implementation and profiling details are in
[EXPERIMENTS.md](EXPERIMENTS.md).

## Where we lean, and why

**We lean toward Path B (Rust).** We expected authoring DX to be the deciding
factor, with Rust having some advantage because it uses a straight-line
function with unit tests instead of generated SQL. In practice, the difference
was modest: the typed pipeline compiler made Path A safe and testable, and
both transforms required comparable effort. **Runtime control** was the
meaningful difference:

- **Memory limits:** Path B implements a process-wide byte budget in the
  worker. In Path A, the equivalent problem is inside the engine: we measured
  2.46 GiB peaks that no setting could control, and the general fix depends on
  a future ClickHouse release.
- **Sharing setup costs across batches:** In Path B, making the process
  long-running reused its initialized state and connections without making
  commit batches larger. ClickHouse analyzes each Path A INSERT independently,
  so its setup cost can only be amortized with larger batches.
- **Reusing S3 downloads for media:** Path B lets us integrate the media
  uploader with the worker's S3 download cache. On a cache hit, transformation
  and media extraction can share the same raw-object download instead of
  issuing a second `GET`, further reducing S3 costs.
- **Fixability:** We fixed the worker-side issues found by this PoC, including
  malformed input handling, large-file memory spikes, parser buffering, and
  streaming writes. Our checksums verified that the fixes preserved the
  output. We control that work directly; fixes for engine-level Path A issues
  depend on the ClickHouse roadmap.
- **Upstream leverage and risk:** That dependency cuts both ways. Path A can
  inherit engine fixes and performance improvements without us implementing
  them; the 4.5× cheaper analyzer in 26.6 is the positive case. It can also
  inherit unexpected semantic changes. ClickHouse 26.2 changed strict numeric
  JSON reads and broke Path A↔B parity until we made those reads
  version-independent. ClickHouse upgrades therefore need to run through the
  version matrix and checksum corpus before rollout.

Path A still has real advantages. ClickHouse reads the raw payloads directly
from S3 without a worker hop, SQL stages are easy to test, production debugging
uses the same dialect, and the stack has one less language. It also avoids
maintaining a Rust version of the transform alongside the generated SQL;
checksums reduce that divergence risk for Path B but do not remove the
maintenance cost. I think those are useful operational properties, but Path
B's measured control over memory, latency, and cost matters more.

## Why not Node or Go?

The evidence is different for each option: Node was assessed but not built;
Go was implemented against the same harness and benchmarked.

**Node.** Embedding chDB is credible: TypeScript remains the coordinator while
chDB owns the payload, transforms it on native threads, and writes the result to
ClickHouse. That keeps the Node event loop light and large payloads outside V8,
but architecturally it is embedded Path A. A native Rust/C++ add-on would be
Path B behind an extra Node boundary. In either case, the memory guarantee comes
from the native engine; Node's worker limits
[do not cover external memory](https://nodejs.org/api/worker_threads.html#new-workerfilename-options).

A pure Node transform is a poorer fit. In the
[large-file experiment](EXPERIMENTS.md#size-skew-stress-the-full-story), Rust's
first parser used 248 MB of transient memory for a 57 MB file. Removing one
buffered intermediate representation cut that to 105 MB. Node would start with
the downloaded string and `JSON.parse` object graph, then add normalized events
and serialized rows. Matching Path B's bound would require custom streaming
throughout while V8 still controls when intermediate objects are reclaimed.

The current Node workers also regularly see `socket hang up` and `ECONNRESET`
on both S3 and ClickHouse requests. CPU work blocking the event loop is one
plausible cause, although remote closes and stale keep-alive sockets produce the
same errors. Worker threads address the CPU case, but not the memory result: a
useful implementation would still need an end-to-end byte budget and enough CPU
headroom to keep the coordinator responsive. At that point it has recreated
Path B's shape in Node.

We did not benchmark that implementation, so the comparison with Go is an
inference. Still, Go is the closest measured baseline: it matched Rust's
throughput, but used roughly twice the CPU and over three times the worker
memory. A pure Node version carrying the object graph above plus a worker pool
seems unlikely to beat it materially. Matching Go would not be enough; Go was
already the weaker option against Rust.

I do not think a pure Node spike is worth doing now. TypeScript familiarity is
useful, but much of that advantage disappears once we need custom streaming,
worker orchestration, and memory accounting across workers. That is too little
upside to accept unproven CPU and memory costs plus a shared process failure
domain. Embedded chDB remains worth revisiting if we choose Path A; for Path B,
Rust is the strongest candidate measured here.

**Go.** The Go spike used the same long-running worker shape, lenient field
semantics, commit protocol, and harness. It reached checksum parity across all
38 columns and verified all 25 sampled media offsets.

Median results from five alternating runs on the standard corpus:

|            | Go       | Rust     |
| ---------- | -------- | -------- |
| throughput | 652 MB/s | 631 MB/s |
| total CPU  | 1.38 s   | 0.73 s   |
| worker RSS | 300 MiB  | 88 MiB   |

Go matched Rust's throughput, but used roughly twice the total CPU and more
worker memory. After replacing `encoding/json` with the experimental json/v2
implementation from `github.com/go-json-experiment/json`, Go worker CPU fell
from 3.36 s to 1.00 s. In the final profile, JSON parsing was about 5%; base64
regex scans accounted for 21–31%, with GC and scheduler work behind most of
the remaining gap.

The source comparison was mixed. Go's lenient JSON model was shorter, but its
ClickHouse row mapping was 226 lines versus 53 in Rust because the Go client
had no equivalent to Rust's row derive. Go also carried an explicit release
function with each memory reservation, while Rust releases the reservation
automatically when its owner is dropped. Those differences matter as the row
schema grows and if the media uploader starts sharing cached downloads with
the transform.

Go is a viable fallback, but the measured CPU and memory cost, the experimental
JSON dependency, and the cost of maintaining a third transform implementation
did not justify keeping it. The spike was removed from the working tree but
remains in Git history (`git log -- poc/otel-ingestion/engine-go`). Entries
25–27 in [EXPERIMENTS.md](EXPERIMENTS.md) contain the implementation and
profiling details.

## Deliberate simplifications

This PoC extracts only media embedded as data URIs. Provider-specific media
objects would need separate mappings. The uploader is represented by a
verifier but is not implemented. Redis claiming and recovery are also stubbed
out; the real design uses Redis streams.

Span `events[]`, `links`, tools, and cost enrichment are not mapped.
`usage_details` is copied directly from `provided_usage_details`. Path B lists
the corpus prefix once per run; in the real system, the ledger would provide
the exact object keys.

[EXPERIMENTS.md](EXPERIMENTS.md) contains the remaining detail:
experiment log, measured findings, CPU decomposition, version matrix, stress
profiling, DSL deep dive, and v1 appendix.
