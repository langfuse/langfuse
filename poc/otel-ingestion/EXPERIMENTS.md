# Experiments, findings, and deep dives

Companion to [README.md](README.md): the full journey, the measured detail,
and the material worth keeping but not worth front-page space.

## Experiment log

Chronological. Format: what we tried — outcome — the call.

1. **v1 transform: per-field `JSONExtract` over raw strings** — every read
   re-parses; realistic attribute counts doubled cost; 3.34 CPU-s (~21/GB).
   → Superseded; appendix baseline.
2. **v2: parse-once `JSON` type + staged WITH-chain** — 2.7× cheaper,
   checksum-identical output; decode is O(paths touched). → The transform.
3. **`EXPLAIN PIPELINE` + stage ablations** — stages fuse into two
   ExpressionTransform layers. → Authoring in stages is runtime-free; keep.
4. **Attribute retention formats** — byte-faithful raw String +1.4 CPU-s;
   `Array(JSON)` moves the tax to the sink; parallel arrays ~free and match
   events_full. → `metadata_names/values`; byte fidelity stays in raw S3.
5. **Media extraction in SQL** — offsets/hashes manifest, verified by
   re-slicing raw files (258/258, offsets 50 MB deep). → Adopted; upload
   stays a separate async consumer.
6. **Typed DSL + nominal brands + de-raw** — the port caught a dropped
   `hex()` (checksum, not types); brands made that bug uncompilable; `raw()`
   32 → 0. → Adopted for Path A authoring.
7. **tsExpr (compile real TS lambdas to SQL)** — worked, checksum-equivalent,
   ~150 lines. → Removed; design sketch below.
8. **Path B: Rust worker, same scope** — checksum parity on all 38 columns,
   ~650 lines on boring crates. → Kept as the priced alternative.
9. **Single-run comparisons** — lied twice ("wall ties", "CPU halved").
   → `bench.mjs`: alternating runs, medians, warmup discarded — the only
   accepted comparison method.
10. **query_log accounting** — back-to-back sub-second runs double-counted
    under a second-granularity time filter. → `event_time_microseconds`.
11. **Where A's CPU goes** — fixed ~0.09 CPU-s/statement analysis tax
    (25.12); no PREPARE exists; parameterized VIEW measures 2× worse; 26.6
    cuts the tax 4.5×. → Batch bigger or upgrade; pure data work is at
    parity with the worker.
12. **Docker suspicion** — native `clickhouse local` measures higher than
    in-VM. → Docker exonerated.
13. **Version matrix + semantics drift** — 26.2 ≈ 25.12 on cost; 26.6
    inverts total CPU in A's favor; strict `.:Float64` semantics changed
    between 25.12 and 26.2 and broke A↔B parity. → `jsonTyped` numeric reads
    compile to `accurateCastOrNull`: neighbor- and version-independent.
14. **Size-skew stress (~50 MB I/O spans)** — A peaks 2.45 GiB/query;
    profiler stacks blame HOF captured-array replication; knob-proof; still
    on 26.8-head (upstream lazy-replication PRs in flight); zip-shape
    metadata halves it to 1.14 GiB. B's byte budget holds. → Open: zip-shape
    DSL change if giant spans matter before upstream lands.
15. **Concurrent `MOVE PARTITION` race** — 25.12 LOGICAL_ERROR when two
    slots commit the same partition id. → Commit is single-writer; INSERTs
    still shingle.
16. **Worker footgun review** — poison-pill files, file-count memory bounds,
    no deadline, UTF-16 slicing in the JS mini-uploader. → Lenient leaves +
    dead-letter note; byte-denominated budget; batch deadline; Buffer
    slicing.
17. **Download/CPU coupling** — chained stream combinators stall unpolled
    and share one knob. → VLDB'23 shape: spawned downloads, bounded
    prefetch, independent CPU width.
18. **Parse granularity for serde** — 512×128 KB files vs 1×67 MB: identical
    throughput; nothing to amortize. → File-by-file stays; web batches
    should be concatenated raw exports + offset index (parallel slicing,
    per-export isolation, same format feeds both engines).
19. **Chasing the RSS amplification** — streaming the model: no change;
    streaming rows: no change; real culprit: untagged `Lenient` buffering
    through serde's Content tree (~5× on a 47 MB value). Shape-dispatched
    visitor: transient 248 → 105 MB, RSS 430 → 328 MiB, parity held.
    → Untagged serde enums banned on big-payload paths.
20. **Allocation-churn suspicions** — Box-vs-unboxed channel rows: tie;
    mimalloc: no delta, +45 MiB RSS. → Unboxed rows, system allocator;
    ~35 allocs/row are a measured non-issue (re-check once on Linux glibc).
21. **Worker CPU decomposition** — dry-run / no-LZ4 / empty-window
    ablations: ~50% per-batch process spawn (harness artifact), LZ4 9%
    (keep: wire bytes cost more), serialize+HTTP 6%, marginal ~1.7 CPU-s/GB
    ≈ 3% of one core at prod rate. → Optimization closed; ablation knobs
    removed after measuring.
22. **Split: shared driver / engine-ch / engine-rust; commit protocol into
    the engines** — the worker became long-running (one process per run,
    windows over an internal slot pool), deleting the spawn tax from every
    number: total CPU 1.38 → 0.69, wall 226 → 557 MB/s @4, per-batch insert
    154 → 21 ms. Surfaced a real bug of the new shape — per-window pools
    silently multiplied budgets by the slot count (801 MiB RSS) — fixed by
    process-global pools. → This is the real worker shape; RSS is now
    process high-water, and the byte budget is the knob that trades memory
    for wall.
23. **Is A paying a spawn-tax twin?** — yes: same corpus, 10 windowed
    statements = 2.37 CPU-s vs one mega-statement = 1.39 (recovered ≈
    10 × 0.09 tax, ~41%), at the cost of a coarser commit unit and 343 →
    601 MiB peak. → A's fixed cost amortizes only through batch size (or
    26.6's 4.5× cheaper analyzer); B's was removable without touching
    commit granularity.
24. **S3-like latency simulation** — netem in the MinIO container's netns:
    `docker run --rm --cap-add NET_ADMIN --net container:<minio>
nicolaka/netshoot tc qdisc replace dev eth0 root netem delay 20ms rate
2gbit limit 100000` (delete: same command ending `tc qdisc del dev eth0
root`). First lesson: netem's default 1000-packet queue DROPS under
    high fan-out — 64 worker connections measured slower than 16 until
    `limit 100000` made the rate limiter queue instead of drop; deepen the
    queue before trusting the sim. Results (+20 ms, 2 Gbit aggregate, @4):
    A 0.60 → 2.05 s (87 MB/s, spread [61..111]); B 0.30 → 1.10 s
    (156 MB/s, spread [153..158]); CPU unchanged on both. Concurrency knobs
    (B net=64/128, A max_threads=32) measured flat or worse — the shaper's
    shared bandwidth bucket penalizes extra connections, which real S3
    (per-connection scaling) would not; TLS and throttling are also
    unsimulated. → B hides latency better and far more consistently;
    connection-count tuning needs the real cloud run.
25. **Go spike, same worker shape** (`engine-go/`, ~1.8k lines incl. tests) —
    to test whether the Path B verdict is about Rust or about owning a
    worker. Same architecture (one process per run, LIST once, byte-budget
    semaphore, download/CPU decoupling via goroutines+channels, streaming
    columnar INSERT through ch-go `OnInput`, single-writer MOVE), same
    lenient leaf semantics. It reached checksum parity on all 38 columns and
    verified 25/25 media offsets, using the Rust source as the behavior spec.
    The first cut used stdlib `encoding/json` with `UnmarshalJSON`
    shape-peeking: worker CPU 3.36 s vs Rust 0.42 s; pprof showed ~half of it
    in `checkValid`/`skip`/
    `stateInString` — every nested `UnmarshalJSON` re-validates its subtree,
    repeating work in CPU rather than buffering it in RAM. → The worker
    works, but stdlib JSON is the wrong tool for nested leniency.
26. **encoding/json/v2 port** (the `go-json-experiment` module, i.e. the
    experimental stdlib v2) — `UnmarshalJSONFrom(*jsontext.Decoder)` +
    `PeekKind()` is a true single-pass streaming visitor: the serde-visitor
    pattern in ~6 readable lines per lenient type, no hand-rolled
    `Visitor` impl. Worker CPU 3.36 → 1.00 s (median of 5), wall 652 MB/s —
    ties Rust's 631 on this corpus; total CPU 1.38 s vs Rust 0.73 s.
    Remaining gap decomposed by pprof: Go's NFA `regexp` on base64 runs
    ~21–31% (the equivalent Rust regex was not a material profile
    contributor), GC+scheduler syscalls most of the rest; JSON itself is down
    to ~5%. RSS 300 vs 88 MiB is GC
    headroom: `GOMEMLIMIT=128MiB` (env-only knob) pulls it to ~230–270 MiB
    at ~40% extra worker CPU — the input-byte semaphore stays the real cap,
    identical in shape to Rust's. → Go can own this worker: parity held and
    throughput matched Rust, but total CPU was ~2× and the faster parser
    depended on the experimental jsonv2 module. The remaining profile was in
    the runtime and `regexp`, not the worker architecture.
27. **The call on the Go spike** — weighed the benchmark against the source
    and ongoing maintenance. Go's lenient wire model was shorter
    (`otel.go` 310 lines vs `otel.rs` 426), but its ClickHouse row mapping was
    226 lines vs 53 in Rust because the Go client had no equivalent derive.
    The Go worker also carried explicit release plumbing on abort paths where
    Rust uses ownership and `Drop`. Reducing the mapping would require codegen
    or a different client API rather than routine cleanup. Throughput was
    adequate, but CPU and RSS were higher, with the remaining profile in
    GC/scheduler work and NFA regexp. Keeping it would also turn every
    transform change into a three-way parity recertification. → Removed from
    HEAD and preserved in history
    (`git log -- poc/otel-ingestion/engine-go` finds it). The lasting result is
    a measured fallback: Go achieved parity and comparable throughput, with
    quantified CPU, memory, dependency, and maintenance costs.

## Key findings (measured)

- **Parse-once decode is O(paths touched)** — widening from 5 to 29
  extracted columns cost ±0.00 CPU-s (see appendix for the re-parse
  baseline this replaced).
- **Unnest**: `json.a[].b[]` yields _nested_ arrays — use two `arrayJoin`s.
- **Attribute retention**: byte-faithful raw costs more than it returns;
  `Array(JSON)` moves the serialize tax into the sink. Parallel arrays
  (`metadata_names/values` — what `events_full` already does) are ~free, and
  filtering lifted payload keys fixes the media-bytes-in-raw leak. Byte
  fidelity lives in raw S3 (`blob_storage_file_path` on every row).
- **Media extraction is ~free** on the prefiltered minority: token splice +
  content-addressed SHA-256 ids + an offsets manifest the uploader consumes.
- **Sink**: `min_insert_block_size_bytes=64Mi` cut peak memory ~40% free;
  `max_insert_threads` gained nothing at this batch size.
- **The commit protocol is engine-independent**: staging + row-count +
  `MOVE PARTITION` + truncate-and-rerun retries drive Path A and Path B
  identically; swapping the transform engine is a fill-step swap.
- **Parse granularity is free in the worker** (measured):
  512×128 KB files vs 1×67 MB file through the full transform — identical
  throughput (~6 GB/s on synthetic content). serde is a stateless
  recursive-descent parser; there is nothing to amortize by filling fixed
  buffers, and insert/commit batching is already decoupled from file count.
  The transform now streams the model (a `SeqAccess` visitor converts each
  resourceSpan to rows and drops it — no whole-file `Vec<ResourceSpan>`),
  which also made parsing ~20% faster.
  The only real per-file cost is the S3 GET itself — that is web-batching's
  job, not a worker buffer's.
- **Worker CPU decomposed** (ablations; knobs removed after measuring):
  ~50% was per-batch process spawn — eliminated by making the worker
  long-running with the commit protocol inside (total CPU 1.38 → 0.69 on
  the standard corpus, per-batch insert 154 → 21 ms). Of what remains: LZ4
  ~9% (keep it: wire bytes cost more), RowBinary+HTTP ~6%, transform ~22%,
  kernel copies the rest. Marginal cost ≈ 1.7 CPU-s/GB ⇒ ~3% of one core at
  prod ingest rate: code-level optimization past this point buys nothing
  that matters.
- **A long-running native worker** (post-split): identical output, 2× wall,
  ~1/3 of A's total CPU, ~85% of server CPU moved out of the database — but
  every payload byte transits it, and every ClickHouse semantic it mirrors
  (dynamic JSON typing, float printing) is a divergence risk that only a
  golden checksum corpus keeps honest.
- **Gotchas**: `count()` over s3 hits the row-count cache; fixture regens
  need fresh prefixes or corpora mix silently; a stale `cargo` binary after
  a source edit looks exactly like a semantic bug — rebuild before comparing.

## Path A CPU decomposition

The CPU gap is batching overhead, not data-plane speed:

- Pure data work is at **parity**: bare SELECT 0.92 CPU-s in-server vs 1.04
  in-worker (incl. its own per-batch spawn/connections); part writes ~1%.
- The rest of A's 1.92 is a fixed **~0.09 CPU-s per-statement analysis tax**
  on the ~10 KB generated SQL (same statement, empty glob: 0.09; trivial
  query, same glob: 0.006) × 10 batches. It scales with statement count ×
  SQL size — bigger batches or leaner codegen buy it back directly. Measured
  head-on (same corpus): 10 windowed statements = 2.37 CPU-s vs one
  mega-statement = 1.39 — the statement tax is A's twin of B's spawn tax.
  The asymmetry: B's fix (long-running process) kept per-window commits,
  while amortizing A's tax coarsens the commit unit and doubles the
  per-query peak (343 → 601 MiB).
- No PREPARE-style escape: ClickHouse has no plan cache, and a parameterized
  VIEW measures ~2× _worse_ (stored AST is still re-analyzed, plus expansion).
- Not Docker: the container is native arm64, and the same SELECT measures
  _lower_ in-VM than in native `clickhouse local`.
- With the worker long-running (commit protocol inside, one process per
  run), Path B wins wall 2× @4 and per-batch latency 6× — the earlier "A
  wins wall" held only while B paid a process spawn per batch. B's wins:
  placement (0.30 CPU-s on the server, −85%), ~1/3 of A's total CPU on
  25.12, and a small repeatable footprint. Both clear prod-EU (~16 MB/s) by
  > 17×. (Numbers above predate the long-running split where marked; the
  > version matrix's B row still includes the spawn tax.)

## Version matrix

Same alternating benches against throwaway containers of each version; medians:

|                                   | 25.12                | 26.2 (prod today) | 26.6        |
| --------------------------------- | -------------------- | ----------------- | ----------- |
| Path A total CPU @4 / @1          | 1.92 / 1.82          | 1.91 / 1.83       | 1.46 / 1.19 |
| Path A wall @4                    | 295 MB/s             | 302 MB/s          | 424 MB/s    |
| Path A per-batch insert @1        | 128 ms               | 128 ms            | 59 ms       |
| Path B total CPU (see note)       | 1.24                 | 1.27              | 1.31        |
| per-statement analysis tax        | 0.090                | 0.094             | 0.021       |
| `top_p: 1` via strict `.:Float64` | `"1"` (array-scope   | `''` (no          | `''`        |
|                                   | Float64 unification) | unification)      |             |

Note: the matrix's B row was measured with one process per batch — the
spawn tax since eliminated (B total on 25.12 is now ~0.69); the 26.x cells
were not re-run. 26.6's analyzer cuts A's tax 4.5× (A @1: 1.19). The last row is semantic
drift — 26.2 already dropped 25.12's array-scope unification, which broke
A↔B parity on 26.x until `jsonTyped` switched numeric reads to
`accurateCastOrNull`; parity is re-certified on 25.12 and 26.2, and the
SQL's output is now checksum-identical across versions.

## Size-skew stress: the full story

Both stay correct: parity 38/38, and all 258 media manifest entries verify
end-to-end, including data URIs 50 MB deep into the value. The memory story
diverges hard, and it is profiled, not guessed: memory-profiler stacks
(`system.trace_log`) put the peak inside higher-order array functions —
`arrayMap` replicating lambda-**captured** arrays per element
(`ColumnFunction::replicate → replicateString`: the metadata lambdas index
into captured `attr_vals`, whose data embeds the 40 MB input), full
`ColumnString` clones in `arrayMap`, and `if`/`ifNull` string copies. The
peak is version-stable (2.45–2.6 GiB on 25.12, 26.2-era 26.6, native 26.7,
and 26.8 master-head) and knob-proof: download threads, parallel parsing,
prefetch pool, `max_threads=1`, and block-size settings were all ablated to
no effect — block cutting doesn't reach HOFs (known upstream; lazy
lambda-capture replication PRs are in flight behind
`enable_lazy_columns_replication`, not yet effective for this shape on
head). The shape-level fix works today: building metadata arrays
capture-free — arrays as zip-style lambda **arguments** instead of indexed
captures — halves the peak to **1.14 GiB** with identical output; candidate
DSL change. Path B's RSS took three measurements to crack: streaming
the parse model changed nothing, streaming rows to the writer changed
nothing — the real hog was `Lenient`'s untagged enums, which buffer values
through serde's private Content tree (~5× a 47 MB value transiently,
invisible to the byte budget). Rewritten as a shape-dispatched visitor
(maps stream via `MapAccessDeserializer`, strings materialize once):
transform transient 248 → 105 MB on a 57 MB file (the residual ~2× is
serde_json's escaped-string scratch — the floor for JSON-in-JSON), and
huge-window worker RSS 430 → 328 MiB. Eager flushing costs nothing
server-side: one INSERT per batch plus server-side squashing means 10
row-streamed windows land as exactly 10 batch-sized parts (460–610 rows) —
part size is batch size and server settings, never client chunk
boundaries. Giant strings also hand CPU back
to Path B — a single-pass splice beats pushing 40 MB strings through
`splitByRegexp`/`arrayStringConcat`.

## The typed pipeline DSL

A pipeline is a chain of named stages. Each stage is an ordinary TypeScript
function: it receives the previous stage's columns as typed expressions and
returns a record of named expressions, which becomes the next stage's column
set. `compile()` fuses the chain into a single WITH-chained `INSERT SELECT` —
and `EXPLAIN PIPELINE` confirms the fusion is real: all stages collapse into
two expression layers, so splitting logic into stages costs nothing at
runtime.

```ts
.stage("spans", (s) => ({
  ...pick(s, "source_file", "project_id", "res_keys", "res_vals"),
  scope_name: ifNull_(jsonTyped(s.ss, "scope.name", "String"), lit("")),
  sp: arrayJoin(jsonArr(s.ss, "spans")),
}))
.stage("parsed", (s) => ({
  trace_id: otelId(s.sp, "traceId"),      // s.sp exists and is JSON-typed,
  start_ns: otelNanos(s.sp, "startTimeUnixNano"),  // or this won't compile
  ...
```

Every expression carries its ClickHouse type as a string-literal phantom:
`s.attrs` is `Expr<"Map(String, String)">`, `arrayJoin` infers its element
type out of the `Array(...)` literal, and referencing a column the previous
stage didn't produce — or feeding a Map where a String is expected — is a
compile error, not a ClickHouse exception at run time.

Ergonomics, so expressions read like code rather than nested prefix calls:
comparison and arithmetic are fluent methods that auto-lift JS literals
(`v.neq(0)`, `x.isEmpty()`, no `lit()` noise), conditionals use
`when(cond).then(a).otherwise(b)`, and `locals()` handles the one genuinely
SQL-ish idiom — aliases that reference sibling aliases within the same
SELECT. Instead of stringly `raw("media_matches")` references, `locals({...})`
returns typed handles whose SQL names derive from the record keys, so a typo
in a sibling reference is also a compile error.

Where the ClickHouse type alone is too coarse — many semantically different
values are all just `String` — `Expr<T, B>` carries a second phantom
parameter as a nominal refinement. `hexOf` returns `Expr<"String", "hex">`,
`lower` preserves the refinement, and `otelId` declares it in its return
type, with an explicit `asHex()` blessing where hex-ness is an input
assumption rather than something the code establishes. The payoff is
concrete: this PoC once shipped an `otelId` missing its `hex()` step —
binary bytes instead of hex text, identical `String` type, invisible to the
checker. With the refinement in place, re-introducing that bug fails
compilation at the exact call site. `raw()` no longer appears outside
`core.ts` — SQL strings live only inside combinator implementations.

**Safety stack** (each layer caught a real defect here): types → wiring;
brands → named invariants; unused-symbol lint → un-applied intent; golden
checksum → semantics. The checksum harness is load-bearing.

**Testing SQL stages is the point**: every stage is a named relation you can
`SELECT` against fixtures; the SQL is dialect-identical to prod (debug a
stage in the prod console, unit-test it in chDB in-process — no service);
refactors are certified by `cityHash64` content checksums over the corpus;
`EXPLAIN PIPELINE` assertions can pin plan properties in CI.

**tsExpr (design sketch, not implemented)**: for dense scalar logic, compile
a _real_ TS arrow — `tsExpr("String", { env }, ({ env }) => env === "" ?
"default" : env)` — by parsing the lambda's `toString()` source with a tiny
throw-loudly grammar (ternary, `===`, comparisons, literals, bound idents);
bindings map CH types to native TS types so the lambda typechecks as plain
TS. Prototyped at ~150 lines, verified checksum-equivalent, removed to keep
the surface small. Build-step technique only; industrial version = TS
compiler-API transform. True "lambda is the execution" inside the engine =
26.3+ WASM UDFs (Rust scalar kernels; chDB controls the flag, Cloud not yet).

## Appendix: the v1 baseline (removed)

The first transform read files as strings and decoded with `JSONExtract*`
calls — each call re-parses the document, so cost scaled with span size
(realistic attribute counts alone doubled it: 3.02 -> 6.24 CPU-s) for
**3.34 CPU-s / ~21 CPU-s/GB / 974 MiB peak** on the final corpus — 2.7×
slower than parse-once with identical output (checksum-verified). Kept here
as a number, not as code.
