# Langfuse Storage Growth Load Test

This directory contains two scripts used together to check that
ClickHouse storage grows **proportionally** to the volume of traces
actually ingested by Langfuse, rather than growing faster than
expected (e.g. due to internal logs).

Context: https://github.com/orgs/langfuse/discussions/5687

## Files

| File | Role |
|---|---|
| `langfuse-load-test.js` | k6 script that generates synthetic traffic by pushing fake traces to the Langfuse ingestion API at a controlled, steady rate. |
| `monitor-clickhouse-growth.sh` | Bash script that samples ClickHouse disk usage at a fixed interval while the load test runs, and logs it to a CSV alongside the trace count. |

Run them together: the k6 script produces the load, the monitoring
script observes its effect on storage.

## How the load test works

Each virtual user iteration in `langfuse-load-test.js` builds one
**batch** that mimics a realistic conversation trace:

- 1 `trace-create` event (the parent trace, with a synthetic user/session id)
- N `generation-create` events (`GENERATIONS_PER_TRACE`, default 2) — each simulating one LLM call, with randomized prompt/completion sizes (`PROMPT_TOKENS_AVG` / `COMPLETION_TOKENS_AVG`, ±40% jitter for realism)
- 1 `score-create` event per generation (a synthetic quality score)

The batch is POSTed as a single request to `/api/public/ingestion`,
authenticated with the project's public/secret key pair (Basic Auth).

The k6 `constant-arrival-rate` executor is used instead of a simple
loop so the throughput (`TRACES_PER_SEC`) stays constant regardless of
how fast/slow each request completes — this is what makes the test
reproducible and comparable across runs.

All synthetic traces are tagged `load-test`, which makes it easy to find and delete
them afterwards without touching real data.

## How the monitoring script works

`monitor-clickhouse-growth.sh` polls the ClickHouse pod every
`interval_sec` seconds (default 300s) and logs one CSV row per sample:

- `total_bytes_on_disk` / `total_bytes_gb`: sum of `bytes_on_disk` from `system.parts` (active parts only) across all Langfuse tables — the ClickHouse-reported logical size.
- `trace_count`: current row count in the `traces` table.
- `gb_per_1000_traces`: the key metric — total storage divided by trace count, normalized per 1000 traces. If ingestion is proportional, this ratio should stay roughly flat over time.
- `pvc_used_kb`: actual disk usage (`du`) on the mounted volume, as a sanity check against ClickHouse's own accounting (which excludes things like WAL files and temp/system logs).

## Running the test

1. **Get dedicated API keys.** In the Langfuse UI, create (or reuse) a
   non-production project — e.g. `loadtest` — and grab its
   public/secret key pair from **Project → Settings → API Keys**.
   Ingested data is scoped to whichever project the keys belong to, so
   using a dedicated project keeps synthetic data out of production.

2. **Start the monitor** (in one terminal, or as a sidecar/background Job):

   ```bash
   ./monitor-clickhouse-growth.sh <namespace> <clickhouse-pod-name> 300 growth.csv
   ```

3. **Run the load test:**

   ```bash
   k6 run \
     -e LANGFUSE_URL=https://<your-langfuse-host> \
     -e LANGFUSE_PUBLIC_KEY=pk-lf-xxx \
     -e LANGFUSE_SECRET_KEY=sk-lf-xxx \
     -e TRACES_PER_SEC=5 \
     -e DURATION_MIN=60 \
     -e GENERATIONS_PER_TRACE=3 \
     -e PROMPT_TOKENS_AVG=800 \
     -e COMPLETION_TOKENS_AVG=250 \
     langfuse-load-test.js
   ```

   Both scripts can also run as Kubernetes Jobs using the same image as
   the existing k6 load-test pipeline, for easy replay in CI.

4. **Let it run past the test duration.** Storage may keep changing
   for a bit after ingestion stops (compaction, background merges), so
   let the monitor keep sampling for a few extra intervals before
   stopping it.

## Interpreting the results

Open `growth.csv` and look at `gb_per_1000_traces` over time:

- **Flat / stable** → storage growth is proportional to ingestion, as expected.
- **Steadily increasing** → something is consuming disk faster than trace volume justifies (worth comparing `total_bytes_gb` against `pvc_used_kb` — a growing gap between the two points at non-ClickHouse-tracked files, e.g. leftover logs).

## Cleanup

Once you're done, delete the synthetic data using the `load-test` tag (via the Langfuse UI filters or the
public API) rather than dropping tables directly, to avoid affecting
any other data in the same project.
