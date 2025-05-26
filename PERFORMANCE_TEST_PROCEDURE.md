# Performance Test Execution Procedure and Data Collection

This document outlines the procedure for executing performance tests on Langfuse instances configured with ClickHouse and GreptimeDB as OLAP backends. It also specifies the data points to collect for analysis.

## 1. Environment Setup

Two Langfuse instances are required, each with a distinct OLAP backend configuration. Both instances should be running the same version of the Langfuse application code.

*   **Instance A (ClickHouse Backend):**
    *   Configure the Langfuse server with the environment variable `LANGFUSE_OLAP_BACKEND=clickhouse`.
    *   Ensure ClickHouse is running and accessible to this Langfuse instance.
    *   The debug API endpoint `/api/debug/greptimedb-query` (or a similarly purposed debug endpoint) must be available. For testing with `targetDb=clickhouse`, this endpoint **must be temporarily adapted or configured to execute the ClickHouse versions of the analytical queries against its ClickHouse backend.** The `query_latency_test.ts` script will pass `targetDatabase: 'clickhouse'` to this endpoint.

*   **Instance B (GreptimeDB Backend):**
    *   Configure the Langfuse server with the environment variable `LANGFUSE_OLAP_BACKEND=greptimedb`.
    *   Ensure the GreptimeDB Docker container (using the image and `docker run` command from the PoC setup guide) is running and accessible to this Langfuse instance.
    *   The debug API endpoint `/api/debug/greptimedb-query` must be available and configured to execute GreptimeDB/DataFusion SQL queries against the GreptimeDB instance. The `query_latency_test.ts` script will pass `targetDatabase: 'greptimedb'` to this endpoint.

*   **Resource Allocation:** Both Langfuse instances, ClickHouse, and GreptimeDB should be run in comparable environments (e.g., similar CPU, RAM, network conditions) to ensure a fair comparison. If possible, dedicate resources to each setup to avoid interference.

## 2. Data Population

The goal is to populate both Instance A and Instance B with a substantial and **identical** dataset. This will be achieved using the `performance_tests/ingestion_test.ts` script.

*   **Generate Data File (Optional but Recommended for Identical Datasets):**
    1.  First, generate a large data file using `data_generator.ts` to ensure both instances receive exactly the same events.
        ```bash
        # Example: Generate data for 10,000 traces (will result in many more individual events)
        ts-node performance_tests/data_generator.ts 10000 > large_dataset.json
        ```
    2.  Modify `ingestion_test.ts` to read events from this file instead of generating them on-the-fly. This change is outside the current script's capability but is a recommendation for strict data parity.
    *   **Alternative (Using Ingestion Script Directly):** If modifying `ingestion_test.ts` to read from a file is not feasible, run it with the same `traceCount` parameter for both instances. While the data will be structurally similar, exact IDs and random values will differ. This is acceptable if the volume and general shape are the primary concerns.

*   **Execution:**
    *   Run `ingestion_test.ts` pointed at **Instance A** (ClickHouse).
    *   Run `ingestion_test.ts` pointed at **Instance B** (GreptimeDB).

*   **Example Parameters for `ingestion_test.ts` (use identical parameters for both instances):**
    ```bash
    # For Instance A (ClickHouse)
    ts-node performance_tests/ingestion_test.ts \
      --host http://localhost:3000 # Instance A URL \
      --traceCount 10000 \
      --concurrency 20 \
      --batchSizeApi 100

    # For Instance B (GreptimeDB)
    ts-node performance_tests/ingestion_test.ts \
      --host http://localhost:3001 # Instance B URL (assuming different port or host) \
      --traceCount 10000 \
      --concurrency 20 \
      --batchSizeApi 100
    ```
    Adjust `traceCount` based on desired data volume and test duration. A higher count (e.g., 10,000 to 100,000 traces) is recommended for meaningful performance data.

## 3. Running Ingestion Throughput Test

The data population step (Step 2) *is* the ingestion throughput test. Record the following metrics directly from the console output of `ingestion_test.ts` for both Instance A and Instance B:

*   Total number of individual ingestion events attempted.
*   Number of successfully sent API batches.
*   Number of failed API batches.
*   Total time taken (seconds).
*   Ingestion Throughput (events/second).

## 4. Running Query Latency Test

After data population, run the `performance_tests/query_latency_test.ts` script against both instances to measure analytical query performance.

*   **Execution:**
    *   Run `query_latency_test.ts` pointed at **Instance A** (ClickHouse), ensuring the `targetDb` parameter is set to `clickhouse`.
    *   Run `query_latency_test.ts` pointed at **Instance B** (GreptimeDB), ensuring the `targetDb` parameter is set to `greptimedb`.

*   **Example Parameters for `query_latency_test.ts` (use identical parameters for both instances, except `targetDb` and `host`):**
    *   `projectId`: Use a `projectId` that contains a significant portion of the populated data. If data was generated with random project IDs by `data_generator.ts` as-is, this might require either:
        *   Modifying `data_generator.ts` to use a fixed `projectId`.
        *   Running a preliminary query to identify a `projectId` with a good amount of data.
        *   For simplicity in this PoC, if the default random project ID generation was used in `data_generator.ts`, you might pick one such generated ID or accept that queries might run over less specific data if `projectId` is not a primary filter in the test queries themselves (though it is used in the example queries). The provided `query_latency_test.ts` generates a random projectId by default if not specified; ensure this is consistent or use a fixed one.
    *   `fromTimestamp`, `toTimestamp`: These should accurately span the period during which data was ingested. If ingestion took an hour starting at `YYYY-MM-DDTHH:MM:SSZ`, set `fromTimestamp` to this and `toTimestamp` to one hour later.
    *   `repetitions`: A value like `20` to `50` repetitions per query should provide a good sample of latencies.

    ```bash
    # For Instance A (ClickHouse)
    ts-node performance_tests/query_latency_test.ts \
      --host http://localhost:3000 # Instance A URL \
      --projectId "your_chosen_project_id" \
      --from "YYYY-MM-DDTHH:MM:SSZ" \ # Start of ingestion period
      --to "YYYY-MM-DDTHH:MM:SSZ" \   # End of ingestion period
      --repetitions 30 \
      --db clickhouse

    # For Instance B (GreptimeDB)
    ts-node performance_tests/query_latency_test.ts \
      --host http://localhost:3001 # Instance B URL \
      --projectId "your_chosen_project_id" \
      --from "YYYY-MM-DDTHH:MM:SSZ" \ # Start of ingestion period (same as above)
      --to "YYYY-MM-DDTHH:MM:SSZ" \   # End of ingestion period (same as above)
      --repetitions 30 \
      --db greptimedb
    ```

*   **Metrics to Record:** From the console output of `query_latency_test.ts`, for *each of the 3 analytical queries* on both Instance A and Instance B:
    *   Min Latency (ms)
    *   Max Latency (ms)
    *   Avg Latency (ms)
    *   p50 Latency (ms)
    *   p90 Latency (ms)
    *   p95 Latency (ms)
    *   Number of successful/failed runs for each query set.

## Data Points for Analysis

Collect and tabulate the following data for a comparative analysis:

**A. Ingestion Performance:**

*   **Instance A (ClickHouse):**
    *   Total time taken for ingestion (seconds).
    *   Overall ingestion throughput (events/sec).
    *   Number of failed API batches during ingestion.
*   **Instance B (GreptimeDB):**
    *   Total time taken for ingestion (seconds).
    *   Overall ingestion throughput (events/sec).
    *   Number of failed API batches during ingestion.

**B. Query Latency Performance (for each of the 3 analytical queries):**

*   **Query 1: Complex Trace Query**
    *   ClickHouse: Avg, P50, P90, P95 latencies (ms).
    *   GreptimeDB: Avg, P50, P90, P95 latencies (ms).
*   **Query 2: Observation Performance Analysis**
    *   ClickHouse: Avg, P50, P90, P95 latencies (ms).
    *   GreptimeDB: Avg, P50, P90, P95 latencies (ms).
*   **Query 3: Score Analysis**
    *   ClickHouse: Avg, P50, P90, P95 latencies (ms).
    *   GreptimeDB: Avg, P50, P90, P95 latencies (ms).

**C. Qualitative Observations:**

*   **Errors:** Any errors or warnings logged by the Langfuse server, ClickHouse instance, or GreptimeDB instance during ingestion or querying phases.
*   **Resource Usage (Manual Observation):** If monitored during tests, note any significant differences in CPU utilization, memory usage, or disk I/O for ClickHouse vs. GreptimeDB processes. This is particularly relevant during sustained ingestion and complex query execution.
*   **Ease of Setup & Operation:** Subjective assessment of the effort required to set up, configure, and operate ClickHouse vs. GreptimeDB for the PoC. Include notes on Docker deployment, schema application, and any operational challenges encountered.
*   **Stability:** Note any crashes, restarts, or periods of unresponsiveness for either database during the testing period.

This structured approach will help in gathering comparable data points to evaluate the performance characteristics of Langfuse with ClickHouse versus GreptimeDB.
