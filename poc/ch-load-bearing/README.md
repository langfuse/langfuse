# PoC: ClickHouse-load-bearing OTel ingestion (Path A)

ClickHouse is the transform engine: raw per-request OTel JSON files (today's
production format) are read from object storage with `s3()`, parsed **once**
into the `JSON` type, exploded by a typed stage pipeline, and committed via
staging tables + `MOVE PARTITION` — exactly-once, no dedup tokens, no window
limits. Payload bytes never touch Node.

## Layout

```
gen-fixtures.mjs      corpus -> MinIO (both real encodings, ~28 attrs, media mix)
harness.mjs           batch loop: INSERT SELECT FROM s3() -> MOVE PARTITION
verify-retry.mjs      crash-after-insert-before-MOVE -> retry lands ONE copy
verify-media.mjs      mini-uploader: manifest -> raw file -> offsets -> SHA-256
sql/00_tables.sql     events_full-mirrored schema (engine, keys, ngram index)
sql/transform-v2.sql  THE transform — GENERATED from pipeline/, do not edit
pipeline/             typed stage compiler (core.ts), domain helpers (otel.ts),
                      pipeline definition (ingest.pipeline.ts), gen.mjs
```

## Run (dev stack: `clickhouse` + `minio` from docker-compose.dev.yml)

```bash
node gen-fixtures.mjs 200 10        # fresh corpus, fresh S3 prefix
node harness.mjs --concurrency 4
node verify-retry.mjs && node verify-media.mjs 25
node pipeline/gen.mjs               # regenerate sql/transform-v2.sql from the DSL
pnpm exec tsc --noEmit --strict --target es2022 --module nodenext \
  --moduleResolution nodenext --allowImportingTsExtensions pipeline/*.ts
```

Reset target between runs: `TRUNCATE TABLE poc_chlb.events_poc` (no dedup by
design — the ledger owns batch identity in the real system).

## How it executes, and where it fits

```
   SDKs ──OTLP──► web (lands raw batches in S3, enqueues keys — not this PoC)
                        │ batch key              │ raw batch PUT
                        ▼                        ▼
              ┌──────────────────┐    ┌────────────────────┐
              │   Redis ledger   │    │    S3 raw zone     │ immutable source of
              │ (stream/consumer │    │ otel/{proj}/{t}/.. │ truth; replay and
              │  group: pending  │    └─────────┬──────────┘ backfill start here
              │  →claimed→acked) │              │
              └────────┬─────────┘              │
                claim / ack                     │ s3() GET       DATA PLANE
                       │                   ─ ─ ─│─ ─ ─ ─ ─ ─ (bytes never transit
                       │                        ▼             the coordinator)
              ┌────────┴─────────┐    ┌────────────────────────────────┐
              │   coordinator    │    │           ClickHouse           │
              │  (control plane: │───►│ INSERT INTO staging_k          │
              │  a few SQL calls │SQL │   SELECT <fused stages>        │
              │  per batch)      │    │   FROM s3(<batch keys>)        │
              └──────────────────┘    │ then: MOVE PARTITION → events  │
                                      └───────────────┬────────────────┘
                                                      │ rows carry
                                                      │ media_manifest
                                                      ▼
   ┌───────────────┐  GET raw file, slice at offsets  ┌────────────────┐
   │  S3 raw zone  │◄─────────────────────────────────┤ media uploader │
   └───────────────┘                                  │  (separate,    │
   ┌───────────────┐  PUT blob (content-addressed id) │   async)       │
   │ S3 media      │◄─────────────────────────────────┤                │
   │ bucket        │            upsert media rows ──► │ Postgres       │
   └───────────────┘                                  └────────────────┘
```

**One batch, step by step.** (1) The web tier lands raw batches in the S3
raw zone and enqueues keys to the Redis ledger (today it also opens
payloads; the future direction is aggressive batching — either way, out of
scope for this PoC). (2) A coordinator
claims a batch atomically (Redis stream consumer group — N coordinators
shard by claiming, crashed claims are reclaimed from the pending list),
picks a staging table from its pool, and issues a single `INSERT INTO staging_k
SELECT … FROM s3(<keys>)`. ClickHouse fetches the files, parses each
document once, and runs every stage fused — the coordinator sends a few
hundred bytes of SQL and never touches payload bytes. (3) After a row-count
check, `MOVE PARTITION TO TABLE` publishes atomically (metadata-level;
2–3ms here). (4) The ledger entry is acked. A crash at any point means:
truncate the staging table, rerun — the raw file is immutable and the
transform deterministic, so the retry is exactly-once (`verify-retry.mjs`
proves the worst-case window). Even a lost ledger is recoverable: every row
records its source file (`blob_storage_file_path`), so anti-joining an S3
listing against the events table rebuilds the pending set. The harness in
this PoC plays the coordinator role with the ledger stubbed out.

**Batches shingle.** The staging pool exists so phases overlap rather than
serialize: while batch N's partition is being MOVEd, batch N+1 is already
INSERTing into another staging table, and web is writing N+2 to the raw
zone. `harness.mjs --concurrency` is exactly this — each slot owns one
staging table, so in-flight batches never share a truncate domain.

**Execution venue is a deployment choice, not a design one.** The same
generated SQL runs on a ClickHouse Cloud service (this prototype's target)
or inside chDB embedded in the coordinator process — which isolates ingest
CPU from the production query service and scales by adding coordinator
containers. Swapping venues changes connection config, not the transform.

**The media uploader is a separate, fully asynchronous consumer.** The
transform never carries blob bytes to the media bucket — it only _records_
them: each row's `media_manifest` lists `(media_id, content_type, field,
byte_offset, byte_length)` per extracted blob, where `media_id` is the
SHA-256 of the decoded content. The uploader's loop: take the manifest work
list (`ARRAY JOIN media_manifest` on fresh batches, or a ledger-enqueued
task per media-bearing batch), group by `blob_storage_file_path`, GET each
raw file once, slice the decoded attribute value at the recorded offsets,
decode, verify the hash, PUT to the media bucket at the content-addressed
key (HEAD-skip if present), and upsert the Postgres media/link rows.
Content-addressing makes every step idempotent — crashes and duplicate
deliveries are harmless — and there is no ordering constraint against event
publish: events become queryable immediately, media resolves eventually
(same contract as today's client-side uploads). `verify-media.mjs` is this
uploader minus the PUT.

## Results (162MB / 5,536 realistic spans, laptop Docker CH 25.12)

Full-corpus insert: **1.25 CPU-s (~7.7 CPU-s/GB)**, peak 586 MiB; harness at
concurrency 4: ~240–330 MB/s (laptop-noisy). Prod-EU averages ~16 MB/s. The
@4 run is bounded by per-batch round trips, not compute (~1.3 GB/s CPU
ceiling). Retry, media, and semantic checks pass.

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
- **Gotchas**: `count()` over s3 hits the row-count cache; fixture regens
  need fresh prefixes or corpora mix silently.

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

## Swapping to Cloud

Dev service only. Corpus: internal-project raw files to a scratch prefix;
adjust the `_path` project regex to `otel/{projectId}/...`. Auth: scoped
read-only key or Cloud S3 role. Run in-region; watch `query_log`
(`log_comment='poc-chlb-transform-v2'`) and Keeper at the MOVE cadence —
MOVE-on-SharedMergeTree is the main unknown.

## Deliberate simplifications

Data-URI media only (structured provider shapes need per-shape stages);
uploader out of scope; no ledger/claiming (Redis streams own it in the real
design); span `events[]`, `links`, tools, cost enrichment unmapped;
`usage_details := provided_usage_details`.

## Appendix: the v1 baseline (removed)

The first transform read files as strings and decoded with `JSONExtract*`
calls — each call re-parses the document, so cost scaled with span size
(realistic attribute counts alone doubled it: 3.02 -> 6.24 CPU-s) for
**3.34 CPU-s / ~21 CPU-s/GB / 974 MiB peak** on the final corpus — 2.7×
slower than parse-once with identical output (checksum-verified). Kept here
as a number, not as code.
