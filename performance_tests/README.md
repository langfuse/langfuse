# Langfuse Performance Testing Scripts

This directory contains scripts for performance testing a Langfuse instance, focusing on data ingestion throughput.

## Scripts

1.  **`data_generator.ts`**:
    *   Generates sample Langfuse ingestion events (traces, observations, scores).
    *   Can be run directly to output JSON data to stdout.

2.  **`ingestion_test.ts`**:
    *   Sends generated data to a Langfuse instance's `/api/ingestion` endpoint.
    *   Measures and reports ingestion throughput (events/second).

## Prerequisites

*   **Node.js**: Ensure Node.js is installed (preferably a recent LTS version).
*   **TypeScript**: The scripts are written in TypeScript. You'll need `typescript` and `ts-node`.
    ```bash
    npm install -g typescript ts-node
    ```
*   **Axios**: The ingestion test script uses `axios` to make HTTP requests.
    ```bash
    npm install axios
    # Or, if managing dependencies for these scripts separately:
    # cd performance_tests
    # npm init -y
    # npm install axios
    ```
*   **Langfuse Instance**: A running Langfuse instance (local or remote) accessible from where you run the test script.

## Setup

1.  Clone the repository (if you haven't already).
2.  Navigate to the `performance_tests` directory or ensure your Node.js environment can resolve modules if running from the project root.
3.  Install dependencies as listed above (especially `axios` if not already a project dependency).

## `data_generator.ts` Usage

This script can be used to generate test data and inspect its structure.

**Command:**

```bash
ts-node performance_tests/data_generator.ts <traceCount> [observationsPerTraceMin] [observationsPerTraceMax] [includeScores] > output_events.json
```

**Parameters:**

*   `<traceCount>`: (Required) The number of traces to generate. Each trace will have associated observations and potentially scores.
*   `[observationsPerTraceMin]`: (Optional) Minimum number of observations per trace. Default: 1.
*   `[observationsPerTraceMax]`: (Optional) Maximum number of observations per trace. Default: 5.
*   `[includeScores]`: (Optional) Whether to include scores. `true` or `false`. Default: `true`.

**Example:**

Generate data for 50 traces and save it to `sample_data.json`:

```bash
ts-node performance_tests/data_generator.ts 50 > sample_data.json
```

Generate data for 10 traces, with 2 to 3 observations per trace, and no scores:
```bash
ts-node performance_tests/data_generator.ts 10 2 3 false > sample_data_no_scores.json
```

The output is a JSON object with a single key `batch`, which contains an array of Langfuse ingestion events.

## `ingestion_test.ts` Usage

This script runs the actual ingestion performance test.

**Command:**

```bash
ts-node performance_tests/ingestion_test.ts [options]
```

**Options (can also be set via environment variables):**

*   `--traceCount <number>` or `-t <number>`:
    *   Number of traces to generate for the test. The total number of ingestion events (traces, observations, scores) will be higher.
    *   Default: `100`.
    *   Env: `TRACE_COUNT`
*   `--host <url>` or `-h <url>`:
    *   URL of the Langfuse server.
    *   Default: `http://localhost:3000`.
    *   Env: `LANGFUSE_HOST`
*   `--concurrency <number>` or `-c <number>`:
    *   Number of parallel HTTP requests to send to Langfuse.
    *   Default: `10`.
    *   Env: `CONCURRENCY`
*   `--batchSize <number>` or `-b <number>`:
    *   Number of individual ingestion events (trace-create, observation-create, etc.) to bundle in a single POST request to `/api/ingestion`. This simulates how the Langfuse SDKs batch events.
    *   Default: `50`.
    *   Env: `BATCH_SIZE_API`

**Examples:**

Run a test with default settings (100 traces, targetting `http://localhost:3000`, 10 concurrent requests, 50 events per API batch):

```bash
ts-node performance_tests/ingestion_test.ts
```

Run a larger test with 1000 traces, 20 concurrent requests, and 100 events per API batch, targeting a remote Langfuse instance:

```bash
ts-node performance_tests/ingestion_test.ts \
  --traceCount 1000 \
  --host https://your-langfuse-instance.com \
  --concurrency 20 \
  --batchSize 100
```

Using environment variables:
```bash
export TRACE_COUNT=500
export LANGFUSE_HOST="http://127.0.0.1:3000"
export CONCURRENCY=15
export BATCH_SIZE_API=75
ts-node performance_tests/ingestion_test.ts
```

**Output:**

The script will print:
*   The configuration being used.
*   The total number of individual ingestion events generated and attempted.
*   The number of successful and failed API batches.
*   Total time taken for the test.
*   Calculated ingestion throughput in events/second (approximate).
*   Warnings for any failed batches.

## Notes

*   The `data_generator.ts` produces a flat list of ingestion events (e.g., `trace-create`, `observation-create`). The `ingestion_test.ts` script then batches these flat events according to the `batchSizeApi` parameter before sending them to the `/api/ingestion` endpoint.
*   Ensure the target Langfuse instance is configured to handle the load, especially regarding database connections and processing capacity.
*   If your Langfuse instance requires authentication, you'll need to modify the `sendBatch` function in `ingestion_test.ts` to include the appropriate `Authorization` header.
*   The throughput calculation is approximate, based on the number of successfully acknowledged batches and the total time. For more precise event-level accounting, the script would need to track individual events within batches.

## `query_latency_test.ts` Usage

This script measures the latency of pre-defined analytical queries executed against a Langfuse debug API endpoint. It's designed to test query performance against different OLAP backends (GreptimeDB or ClickHouse) via this endpoint.

**Command:**

```bash
ts-node performance_tests/query_latency_test.ts [options]
```

**Options (can also be set via environment variables):**

*   `--host <url>` or `-h <url>`:
    *   URL of the Langfuse server hosting the `/api/debug/greptimedb-query` endpoint.
    *   Default: `http://localhost:3000`.
    *   Env: `LANGFUSE_HOST` (reuses the same env var as `ingestion_test.ts`)
*   `--projectId <string>` or `-p <string>`:
    *   The Project ID to use as a filter in the queries.
    *   Default: A randomly generated project ID string.
    *   Env: `PROJECT_ID`
*   `--from <ISO_timestamp>` or `-f <ISO_timestamp>`:
    *   The start timestamp (inclusive) for the query date range.
    *   Default: 24 hours ago from the current time.
    *   Env: `FROM_TIMESTAMP`
*   `--to <ISO_timestamp>` or `-t <ISO_timestamp>`:
    *   The end timestamp (exclusive) for the query date range.
    *   Default: Current time.
    *   Env: `TO_TIMESTAMP`
*   `--repetitions <number>` or `-r <number>`:
    *   Number of times to run each of the pre-defined analytical queries.
    *   Default: `10`.
    *   Env: `REPETITIONS`
*   `--db <greptimedb|clickhouse>` or `-d <greptimedb|clickhouse>`:
    *   The target database backend the debug API should ideally query against.
    *   Default: `greptimedb`.
    *   Env: `TARGET_DB`

**Examples:**

Run latency test with default settings against GreptimeDB (10 repetitions per query, default project/timestamps):
```bash
ts-node performance_tests/query_latency_test.ts --db greptimedb
```

Run latency test against a ClickHouse backend (via the same debug API), with 50 repetitions and specific project/timestamps:
```bash
export LANGFUSE_HOST="http://localhost:3000"
export PROJECT_ID="your-actual-project-id"
export FROM_TIMESTAMP="2023-01-01T00:00:00Z"
export TO_TIMESTAMP="2023-02-01T00:00:00Z"
export REPETITIONS=50
export TARGET_DB="clickhouse"

ts-node performance_tests/query_latency_test.ts
```
Or using CLI flags:
```bash
ts-node performance_tests/query_latency_test.ts \
  --host http://localhost:3000 \
  --projectId your-actual-project-id \
  --from 2023-01-01T00:00:00Z \
  --to 2023-02-01T00:00:00Z \
  --repetitions 50 \
  --db clickhouse
```

**Output:**

The script will:
*   Print the configuration being used.
*   For each of the 3 pre-defined conceptual analytical queries:
    *   Indicate which query is being tested.
    *   Print latency for each repetition.
    *   After all repetitions, print min, max, average, p50, p90, and p95 latencies for that query.
*   Indicate if any runs failed.

**Assumptions for `targetDb` parameter:**

*   The `query_latency_test.ts` script **always calls the same debug API endpoint** (`/api/debug/greptimedb-query`).
*   **When `targetDb` is 'clickhouse'**:
    *   The script still calls this endpoint. The expectation is that the endpoint itself is either:
        1.  Manually reconfigured on the server-side to use a ClickHouse client for these test runs.
        2.  (Future Enhancement) The debug API endpoint is enhanced to accept a parameter (e.g., `targetDatabase: 'clickhouse'`) which tells it to switch its internal OLAP client. The `query_latency_test.ts` script *does* send a `targetDatabase` field in its payload, anticipating such an enhancement.
    *   The conceptual query logic (e.g., "Complex Trace Query") remains the same, but the debug API would execute it against ClickHouse using appropriate ClickHouse SQL.
*   **When `targetDb` is 'greptimedb'**:
    *   The debug API endpoint is assumed to be configured to use GreptimeDB and will execute the GreptimeDB-compatible SQL versions of the queries.

The primary role of the `targetDb` flag in *this script* is to allow for organized testing and reporting if the backend debug API can indeed switch its data source. The script itself does not change the SQL it expects the API to run based on this flag; it only passes the `queryId` and associated parameters.
