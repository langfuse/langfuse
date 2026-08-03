# Replay Ingestion Events from S3 (v2)

Replays failed ingestion events by reading S3 keys from a CSV and submitting them to Langfuse via an admin API endpoint. This replaces the [v1 script](../replayIngestionEvents/README.md), which required direct Redis, ClickHouse, and PostgreSQL access plus a full repo clone.

v2 only requires the Langfuse host URL, an admin API key, and a CSV file exported from Athena.

```
Athena (S3 access logs)
  │
  ▼
events.csv ──► replay script ──► POST /api/admin/ingestion-replay
                                        │
                                        ▼
                                  Redis queues (IngestionSecondaryQueue / OtelIngestionQueue)
                                        │
                                        ▼
                                  Worker processing
```

## Prerequisites

- **S3 server access logging** enabled on the Langfuse events bucket (see [Initial setup](#1-initial-setup-one-time))
- **Athena** configured to query the access logs (see [Initial setup](#1-initial-setup-one-time))
- **Node.js 18+** with `npx tsx` available (no repo clone or `pnpm` needed)
- **`events.csv`** exported from Athena (see [Export events](#2-export-events-from-athena))
- **`LANGFUSE_HOST`** URL of the target Langfuse instance (e.g. `https://cloud.langfuse.com`)
- **`ADMIN_API_KEY`** for authenticating against the admin API
- Network access from your machine to the Langfuse host

## 1. Initial setup (one-time, on AWS)

Before you can query S3 access logs via Athena, you need to configure S3 server access logging and set up Athena.
Skip this section if your environment already has Athena configured for the events bucket.
If you're not using AWS as a cloud vendor, consult your cloud provider's documentation on how to store blob storage access logs and efficiently retrieve the events.csv.

### 1a. Enable S3 server access logging

Create a dedicated S3 bucket to store access logs for your Langfuse events bucket.
Then enable server access logging on the events bucket with the new bucket as the destination.

AWS docs: [Enabling Amazon S3 server access logging](https://docs.aws.amazon.com/AmazonS3/latest/userguide/enable-server-access-logging.html)

Set a key prefix (e.g. `logs/<events-bucket-name>/`) to keep logs organized if you reuse the bucket for multiple sources.

### 1b. Set up Athena query result location

Athena requires an S3 location to store query results. Configure this in the Athena console under **Settings → Query result location**.

AWS docs: [Specifying a query result location](https://docs.aws.amazon.com/athena/latest/ug/querying.html#query-results-specify-location)

### 1c. Create an Athena database

```sql
CREATE DATABASE s3_access_logs_db
```

### 1d. Create the S3 access logs table

Create an external table that maps the S3 server access log format. Replace the `LOCATION` with the S3 URI of your access log bucket and prefix from step 1a.

AWS docs: [Querying access logs for requests using Amazon Athena](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-s3-access-logs-to-identify-requests.html)

```sql
CREATE EXTERNAL TABLE `s3_access_logs_db.events_bucket_logs`(
  `bucketowner` STRING,
  `bucket_name` STRING,
  `requestdatetime` STRING,
  `remoteip` STRING,
  `requester` STRING,
  `requestid` STRING,
  `operation` STRING,
  `key` STRING,
  `request_uri` STRING,
  `httpstatus` STRING,
  `errorcode` STRING,
  `bytessent` BIGINT,
  `objectsize` BIGINT,
  `totaltime` STRING,
  `turnaroundtime` STRING,
  `referrer` STRING,
  `useragent` STRING,
  `versionid` STRING,
  `hostid` STRING,
  `sigv` STRING,
  `ciphersuite` STRING,
  `authtype` STRING,
  `endpoint` STRING,
  `tlsversion` STRING,
  `accesspointarn` STRING,
  `aclrequired` STRING)
ROW FORMAT SERDE
  'org.apache.hadoop.hive.serde2.RegexSerDe'
WITH SERDEPROPERTIES (
  'input.regex'='([^ ]*) ([^ ]*) \\[(.*?)\\] ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) (\"[^\"]*\"|-) (-|[0-9]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) (\"[^\"]*\"|-) ([^ ]*)(?: ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*))?.*$')
STORED AS INPUTFORMAT
  'org.apache.hadoop.mapred.TextInputFormat'
OUTPUTFORMAT
  'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat'
LOCATION
  's3://<your-access-log-bucket>/logs/<your-events-bucket>/'
```

### 1e. Verify the setup

Run a simple query to confirm logs are being collected and the table is configured correctly:

```sql
SELECT key, operation, httpstatus, requestdatetime
FROM s3_access_logs_db.events_bucket_logs
WHERE operation = 'REST.PUT.OBJECT'
LIMIT 10
```

If this returns results, the setup is complete. Note that it may take some time after enabling access logging for the first logs to appear.

## 2. Export events from Athena

Query S3 access logs to identify the events that need to be replayed. Adjust the time range, table name, and bucket name to match your environment and incident window.

```sql
SELECT operation, key
FROM s3_access_logs_db.events_bucket_logs
WHERE operation = 'REST.PUT.OBJECT'
  AND bucket_name = '<your-events-bucket>'
  AND parse_datetime(requestdatetime, 'dd/MMM/yyyy:HH:mm:ss Z')
      BETWEEN parse_datetime('2025-07-09:00:30:00', 'yyyy-MM-dd:HH:mm:ss')
      AND     parse_datetime('2025-07-09:07:45:00', 'yyyy-MM-dd:HH:mm:ss')
```

Download the result as CSV. The expected format:

```csv
"operation","key"
"REST.PUT.OBJECT","projectId/trace/eventBodyId/eventId.json"
"REST.PUT.OBJECT","otel/projectId/2025/07/09/14/30/some-uuid.json"
```

Two S3 key formats are supported:

| Format | Pattern | Target queue |
|--------|---------|-------------|
| Standard | `{projectId}/{type}/{eventBodyId}/{eventId}.json` | `IngestionSecondaryQueue` |
| OTEL | `otel/{projectId}/{yyyy}/{mm}/{dd}/{hh}/{mm}/{eventId}.json` | `OtelIngestionQueue` |

Keys that don't match either pattern are skipped and logged.

## 3. Run the replay script

```bash
LANGFUSE_HOST=https://cloud.langfuse.com \
ADMIN_API_KEY=your-admin-api-key \
npx tsx replay.ts --file events.csv
```

## Configuration

| Flag / env var | Default | Description |
|----------------|---------|-------------|
| `--file` | `events.csv` | Path to the CSV file |
| `--batch-size` | `500` | Number of keys per API request |
| `--concurrency` | `4` | Maximum parallel API requests |
| `--rate-limit` | `50` | Maximum requests per second |
| `--dry-run` | `false` | Parse and validate without sending requests |
| `--resume` | `false` | Resume from the last checkpoint (skips already-processed rows) |
| `LANGFUSE_HOST` | - | Target Langfuse instance URL (required) |
| `ADMIN_API_KEY` | - | Admin API key for authentication (required) |

## Admin API endpoint

### `POST /api/admin/ingestion-replay`

Accepts a batch of S3 keys and enqueues them for reprocessing.

**Authentication**: `Authorization: Bearer {ADMIN_API_KEY}` header, validated by `AdminApiAuthService`.

**Request**:

```json
{
  "keys": [
    "projectId/trace/eventBodyId/eventId.json",
    "otel/projectId/2025/07/09/14/30/some-uuid.json"
  ]
}
```

**Response** (`200 OK`):

```json
{
  "queued": 498,
  "skipped": 2,
  "errors": []
}
```

| Status | Meaning |
|--------|---------|
| `200` | Batch accepted (check `skipped`/`errors` for partial failures) |
| `401` | Missing or invalid `ADMIN_API_KEY` |
| `400` | Malformed request body |
| `429` | Rate limited, retry after backoff |

## Event transformation

The endpoint parses each S3 key and constructs the queue payload:

**Standard keys** (`{projectId}/{type}/{eventBodyId}/{eventId}.json`):

```json
{
  "authCheck": {
    "validKey": true,
    "scope": { "projectId": "<projectId>" }
  },
  "data": {
    "eventBodyId": "<eventBodyId>",
    "fileKey": "<eventId>",
    "type": "<type>-create"
  }
}
```

Enqueued to `IngestionSecondaryQueue`.

**OTEL keys** (`otel/{projectId}/{yyyy}/{mm}/{dd}/{hh}/{mm}/{eventId}.json`):

```json
{
  "authCheck": {
    "validKey": true,
    "scope": { "projectId": "<projectId>", "accessLevel": "project" }
  },
  "data": {
    "fileKey": "otel/<projectId>/<yyyy>/<mm>/<dd>/<hh>/<mm>/<eventId>.json"
  }
}
```

Enqueued to `OtelIngestionQueue`.

## Progress tracking and error handling

- **Progress**: The script logs progress after each batch (e.g. `[1200/45000] 2.7% — 498 queued, 2 skipped`).
- **Checkpoints**: After each successful batch, the current CSV row offset is written to a `.checkpoint` file next to the input CSV. Use `--resume` to continue from the last checkpoint after a failure.
- **Rate limiting**: The script respects `--rate-limit` locally and backs off on `429` responses from the server using exponential backoff with jitter.
- **Retries**: Transient failures (`429`, `5xx`) are retried up to 3 times per batch. Permanent failures (`4xx` other than `429`) are logged and skipped.
- **Error log**: Failed keys are appended to `errors.csv` next to the input file for manual inspection.

## Differences from v1

| | v1 | v2 |
|-|----|----|
| Infrastructure access | Redis, ClickHouse, PostgreSQL, S3 | Langfuse host URL only |
| Setup | Full repo clone, `pnpm install`, `.env` file | `npx tsx` + env vars |
| Event delivery | Direct BullMQ `addBulk` to Redis | HTTP POST to admin API |
| Resume support | Manual (split files, rerun) | Built-in checkpoint/resume |
| Rate limiting | None (can overwhelm Redis) | Client-side + server-side rate limiting |
