# Refill Queue Event

This is a utility script to backfill any queue with events from local machines.
It validates events against the queue's schema and processes them in batches for efficient ingestion.

## Usage

### 1. Create Events File

Create a `./worker/events.jsonl` file with one JSON event per line, e.g.:

```jsonl
{"projectId": "project-123", "orgId": "org-456"}
{"projectId": "project-789", "orgId": "org-101"}
```

**Important**: Each event must match the schema expected by the target queue.
The script will validate each event and report any schema violations.

### 2. Set Environment Variables

Create a `.env` file in the repository root with the following content:

```bash
# Required: Redis connection
REDIS_CONNECTION_STRING=redis://:myredissecret@127.0.0.1:6379

# Required: Supporting services for worker initialization
LANGFUSE_S3_EVENT_UPLOAD_BUCKET=langfuse
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_USER=clickhouse
CLICKHOUSE_PASSWORD=clickhouse
```

### 3. Ensure Connectivity

Ensure your local machine can connect to the Redis instance, e.g., by establishing an SSH tunnel or mapping hosts in `/etc/hosts`.

### 4. Run the Script

```bash
pnpm run --filter=worker refill-queue-event
```
