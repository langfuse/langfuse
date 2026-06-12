# Langfuse on GreptimeDB (work in progress)

A hard fork of [Langfuse](https://github.com/langfuse/langfuse) that swaps the
analytics storage backend from **ClickHouse** to **GreptimeDB**. The aim is a
drop-in-compatible LLM engineering platform (tracing, evals, prompt management,
metrics) whose telemetry store is GreptimeDB — roughly the relationship
OpenSearch has to Elasticsearch.

> **Status: early, actively changing.** Only the ingestion **write path** is
> implemented so far. Do not run this in production. The upstream Langfuse
> product features are inherited as-is; the storage layer is being rebuilt
> incrementally.

## Why GreptimeDB

LLM traces are observability data — timestamped wide events with
high-cardinality context — which is exactly what [GreptimeDB](https://github.com/GreptimeTeam/greptimedb),
an open-source Rust observability database, is built for. It's a natural backend
for Langfuse's OpenTelemetry-shaped ingestion, and brings:

- **Cheap at scale** — columnar storage on object storage (S3-class) with
  compute/storage separation and heavy compression; compute scales independently
  of storage, with no vendor lock-in.
- **SQL as the control plane** — retention (TTL), schema, and indexing
  (inverted / skipping / full-text) are all managed in plain SQL. This fork
  leans on exactly that: TTL-based retention and indexed EAV subtables for
  metadata/tag filtering.
- **One engine for observability** — metrics, logs, and traces in a single
  system, so the LLM-analytics store stops being a separate ClickHouse
  dependency.

## Goals

- Replace ClickHouse with GreptimeDB as the analytics store, behind the same
  domain/repository contracts so the app and APIs are unchanged.
- Use GreptimeDB as the source of truth (an append-only `raw_events` table)
  plus merge-mode projection tables.
- **Make object storage optional, not mandatory.** With the event store living
  in GreptimeDB, a separate S3/blob store is no longer a hard dependency for
  ingestion — it stays *recommended* (GreptimeDB itself is happiest backed by
  object storage, and large media blobs still belong there), but self-hosting
  no longer requires standing up S3 just to ingest.
- Keep cost/usage precision (`DECIMAL(38,12)`), EAV filtering for
  metadata/tags, and faithful Langfuse merge semantics.

## Progress

| Area | Status |
| --- | --- |
| Schema (raw_events + traces/observations/scores projections + EAV subtables) | ✅ |
| Write path: ingest → raw_events → worker full-history rebuild → projections + EAV | ✅ |
| `@greptime/ingester` TypeScript SDK with `Decimal128` support | ✅ (upstream branch) |
| Delete semantics (tombstones, no resurrection on replay) | ✅ |
| Read path (query builder ClickHouse → GreptimeDB) | ⬜ planned (04) |
| Flow / second-level aggregations | ⬜ planned (03) |
| OTel write path fully flipped | ⬜ partial |
| EE features | ⬜ later |

## Design docs

Living design notes for the migration are in
[`docs/greptimedb-migration/`](docs/greptimedb-migration/):

- `00-feasibility.md` — feasibility analysis and architecture options
- `01-schema-design.md` — raw_events + projection + EAV schema
- `02-write-path.md` — ingestion write path (implemented)
- `03-flow-decision.md` — second-level aggregation design
- `poc-results.md` — merge / EAV / pipeline proof-of-concept results

## Local development

Infra (Postgres, Redis, ClickHouse, MinIO) comes up with the dev compose file;
GreptimeDB runs separately (gRPC `:4001`, MySQL `:4002`).

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d   # Postgres/Redis/ClickHouse/MinIO
pnpm run db:deploy                                # Postgres migrations
pnpm --filter shared run ch:up                    # ClickHouse migrations (transition period)
# GreptimeDB schema:
mysql -h127.0.0.1 -P4002 -uroot openfuse < packages/shared/greptime/migrations/0001_init.sql
pnpm run dev
```

See [`AGENTS.md`](AGENTS.md) / [`CLAUDE.md`](CLAUDE.md) for the repo layout and
contributor guidelines inherited from upstream Langfuse.

## License

Inherited from upstream Langfuse (MIT core; `ee/` under the Langfuse EE
license). See [LICENSE](LICENSE).
