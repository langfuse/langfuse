# Ingestion Pipeline Architecture (State: 2026-02-19)

## Sequence Diagram: `/api/public/ingestion`

```mermaid
sequenceDiagram
    participant C as Client SDK
    participant Web as Web (Next.js)
    participant S3 as S3
    participant Redis as Redis (BullMQ)
    participant W as Worker
    participant CH as ClickHouse

    C->>Web: POST /api/public/ingestion { batch: [...] }
    Web->>Web: Auth, rate limit, validate
    Web->>Web: Sort events (creates first, then updates)
    Web->>Web: Group by entityBodyId + entityType

    par Upload + Enqueue per entity group
        Web->>S3: Upload per-entity files<br/>{prefix}{projectId}/{type}/{bodyId}/{eventId}.json
        Web->>Redis: Enqueue IngestionQueue job (5s delay)<br/>sharded by projectId-entityBodyId
    end

    Web-->>C: HTTP 207 { successes, errors }

    Note over Redis,W: After 5s delay

    Redis->>W: Dequeue IngestionQueue job
    W->>Redis: Dedup check (skip if seen in last 5min)
    W->>S3: List + download all files for entity prefix
    S3-->>W: Event payloads + firstS3WriteTime

    W->>CH: Read existing record for merge (traces/observations FINAL)
    W->>W: IngestionService.mergeAndWrite()<br/>Merge events, tokenize, calculate costs

    par Write to ClickHouse
        W->>CH: Write to traces table
        W->>CH: Write to observations table
        W->>CH: Write to observations_batch_staging<br/>(virtual traces as t-{trace_id} + all observations)
    end
```

## Sequence Diagram: `/api/public/otel/v1/traces`

```mermaid
sequenceDiagram
    participant C as Client SDK
    participant Web as Web (Next.js)
    participant S3 as S3
    participant Redis as Redis (BullMQ)
    participant W as Worker
    participant CH as ClickHouse

    C->>Web: POST /otel/v1/traces (ResourceSpans)<br/>JSON or Protobuf, optionally gzipped
    Web->>Web: Decode payload, auth, read x-langfuse-ingestion-version
    Web->>S3: Upload full batch as single file<br/>{prefix}otel/{projectId}/{yyyy/mm/dd/hh/mm}/{uuid}.json
    Web->>Redis: Enqueue OtelIngestionQueue job
    Web-->>C: HTTP 200

    Redis->>W: Dequeue OtelIngestionQueue job
    W->>S3: Download batch file
    W->>W: Parse ResourceSpans → trace-create,<br/>span-create, generation-create events
    W->>Redis: Deduplicate trace events (10min TTL per traceId)

    W->>W: Check SDK version

    alt New SDKs (py≥4.0, js≥5.0, ingestion-version≥4)
        Note over W,CH: Observations: direct merge + write
        W->>CH: Read existing observation (for merge)
        W->>W: mergeAndWrite(observations)
        W->>CH: Write to observations table

        Note over W,S3: Traces: re-enter via ingestion pipeline
        W->>S3: Upload trace events (via processEventBatch)
        W->>Redis: Enqueue to IngestionQueue (no delay)

        Note over W,CH: Events: direct write
        W->>W: processToEvent() — join trace attributes onto observations
        W->>CH: Write directly to events_full + events_core
    else Old SDKs
        Note over W,CH: Observations: merge + write + stage
        W->>CH: Read existing observation (for merge)
        W->>W: mergeAndWrite(observations)
        W->>CH: Write to observations table
        W->>CH: Write to observations_batch_staging

        Note over W,S3: Traces: re-enter via ingestion pipeline
        W->>S3: Upload trace events (via processEventBatch)
        W->>Redis: Enqueue to IngestionQueue (no delay)
    end
```

## Sequence Diagram: `observations_batch_staging` Flush

```mermaid
sequenceDiagram
    participant W as Worker (EventPropagationJob)
    participant Redis as Redis
    participant CH as ClickHouse

    Note over W: Job runs periodically (every 1min)

    W->>Redis: Read last processed partition cursor<br/>langfuse:event-propagation:last-processed-partition

    W->>CH: Query system.parts for oldest active partition<br/>in observations_batch_staging<br/>that is >10min old and after cursor

    alt No unprocessed partition found
        Note over W: Skip, wait for next run
    else Partition found (e.g. 2024-01-15 12:00:00)
        W->>CH: SELECT FROM observations_batch_staging FINAL<br/>WHERE partition = '2024-01-15 12:00:00'

        W->>CH: JOIN with traces table (±1 day window)<br/>→ populate user_id, session_id, tags,<br/>release, trace_name, environment

        W->>CH: INSERT INTO events_full → events_core_mv → events_core

        W->>Redis: Update partition cursor
    end

    Note over CH: Partition lifecycle
    Note over CH: 12:00-12:03 — Events written to partition
    Note over CH: 12:03-12:05 — Late writes (max 5min from partition start)
    Note over CH: ~12:10 — Flush (10min after partition start)
    Note over CH: TTL — Partition auto-dropped after 12 hours
```

## `observations_batch_staging` Flush Flow

```mermaid
flowchart TD
    subgraph Writes["Incoming Writes"]
        VT["Virtual traces<br/><i>id = t-{trace_id}</i>"]
        OBS["All observations<br/>(old SDK path)"]
    end

    VT --> STAGING
    OBS --> STAGING

    STAGING["observations_batch_staging<br/><i>ReplacingMergeTree(event_ts, is_deleted)</i><br/><i>PARTITION BY toStartOfInterval(s3_first_seen_timestamp, 3 min)</i>"]

    subgraph PartitionLogic["Partition Assignment"]
        direction LR
        CHECK{"(now - s3_timestamp)<br/>< 2 minutes?"}
        CHECK -- "Yes" --> USE_S3["Use s3_first_seen_timestamp"]
        CHECK -- "No" --> USE_NOW["Use now()<br/><i>(prevents writes to<br/>already-flushed partitions)</i>"]
    end

    STAGING --- PartitionLogic

    subgraph Timeline["Partition Lifecycle (example: partition 12:00-12:03)"]
        direction LR
        T1["12:00 - 12:03<br/>Events written<br/>to partition"]
        T2["12:03 - 12:08<br/>Late writes accepted<br/>(max 5min from start)"]
        T3["12:13<br/>EventPropagationJob<br/>flushes partition<br/>(10min after close)"]
        T4["00:00 next day<br/>TTL drops partition<br/>(12h after creation)"]
        T1 --> T2 --> T3 --> T4
    end

    subgraph Flush["EventPropagationJob"]
        CURSOR["Read last processed<br/>partition from Redis"]
        FIND["Find oldest unprocessed<br/>partition older than 10min"]
        JOIN["SELECT FROM staging FINAL<br/>JOIN traces table<br/>(populate user_id, session_id,<br/>tags, release, trace_name)"]
        INSERT["INSERT INTO events"]
        UPDATE["Update Redis cursor"]
    end

    STAGING -.-> CURSOR --> FIND --> JOIN --> INSERT --> UPDATE

    INSERT --> EF["events_full"]
    EF -- "events_core_mv" --> EC["events_core"]
```

## Data Schema: `events_full`, `events_core`, and Materialized View

```mermaid
erDiagram
    events_full {
        String project_id PK
        String trace_id
        String span_id PK
        String parent_span_id
        DateTime64_6 start_time PK
        DateTime64_6 end_time
        String name
        String type
        String environment
        String version
        String release
        String trace_name
        String user_id
        String session_id
        Array_String tags
        String level
        String status_message
        DateTime64_6 completion_start_time
        Bool bookmarked
        Bool public
        String prompt_id
        String prompt_name
        UInt16 prompt_version
        String model_id
        String provided_model_name
        String model_parameters
        Map provided_usage_details
        Map usage_details
        Map provided_cost_details
        Map cost_details
        Decimal calculated_total_cost "MATERIALIZED"
        String input "FULL - ZSTD compressed"
        UInt64 input_length "MATERIALIZED"
        String output "FULL - ZSTD compressed"
        UInt64 output_length "MATERIALIZED"
        Array_String metadata_names
        Array_String metadata_values "FULL values"
        DateTime64_6 event_ts "ReplacingMT version"
        UInt8 is_deleted "ReplacingMT delete flag"
    }

    events_core {
        String project_id PK
        String trace_id
        String span_id PK
        DateTime64_6 start_time PK
        DateTime64_6 end_time
        String name
        String type
        String environment
        String trace_name
        String user_id
        String session_id
        Array_String tags
        Map usage_details
        Map cost_details
        Decimal calculated_total_cost "MATERIALIZED"
        String input "TRUNCATED to 200 chars"
        String output "TRUNCATED to 200 chars"
        Array_String metadata_names
        Array_String metadata_values "TRUNCATED to 200 chars each"
        DateTime64_6 event_ts
        UInt8 is_deleted
    }

    events_full ||--|| events_core : "events_core_mv (Materialized View)"
```

```
events_core_mv transformation:
  - input       = leftUTF8(input, 200)
  - output      = leftUTF8(output, 200)
  - metadata_values = arrayMap(v -> leftUTF8(v, 200), metadata_values)
  - All other columns pass through unchanged
```

### Query Patterns

| Query Type | Table Used | Rationale |
|---|---|---|
| List/filter/sort | `events_core` | Smaller rows, faster scans |
| Detail view (full I/O) | `events_full` | Has untruncated input/output |
| Split query | `events_core` + `events_full` | Filter on core, fetch full I/O for matched rows only |

## Limitations

1. **Virtual Root Traces (`t-{trace_id}`)**: Old SDKs don't emit a root span, so the ingestion pipeline creates a synthetic observation with `id = t-{trace_id}` to represent the trace as a span. This preserves trace-level input/output/metadata in the events tables. Once users upgrade to new SDKs (which emit proper root spans), this virtual trace disappears.

2. **Late Trace Updates**: Trace updates arriving after the `observations_batch_staging` partition has been flushed (e.g., a `session_id` set 20+ minutes after ingestion) will NOT be reflected in `events_full` / `events_core`. The flush is a point-in-time JOIN with the traces table, and there is no re-processing mechanism for late-arriving trace metadata.
