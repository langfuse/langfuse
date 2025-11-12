# ClickHouse Events Backfill Script

Python script to backfill the `events` table from `observations` table by streaming data, enriching with trace attributes, and performing batch inserts.

## Overview

This script processes entire partitions without chunking:
1. Loads all trace attributes for the partition into memory (~35-40GB per partition)
2. Streams observations from ClickHouse in blocks
3. Enriches each observation with trace data (user_id, session_id, metadata, etc.)
4. Batch inserts enriched events back to events table

## Prerequisites

- Python 3.8+
- Access to ClickHouse database
- Sufficient memory (recommended: 64GB+ for large partitions)

## Setup

### 1. Install Dependencies

```bash
cd scripts/clickhouse-backfill

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
# Copy example config
cp .env.example .env

# Edit .env with your settings
vim .env
```

Required environment variables:
```bash
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=your_password
CLICKHOUSE_DB=default
PARTITION=202406
```

## Usage

### Basic Usage

```bash
# Process partition 202406
python backfill_events.py --partition 202406

# Dry run (no inserts, validation only)
python backfill_events.py --partition 202406 --dry-run

# Custom batch size
python backfill_events.py --partition 202406 --batch-size 5000
```

### Command Line Options

- `--partition YYYYMM` - Partition to process (overrides .env)
- `--batch-size N` - Events per insert batch (default: 10000)
- `--dry-run` - Validation mode, no inserts

### Configuration Options (.env)

```bash
# ClickHouse Connection
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DB=default

# Processing Parameters
PARTITION=202406              # Target partition (YYYYMM format)
BATCH_SIZE=10000             # Events per insert batch
STREAM_BLOCK_SIZE=50000      # Observations per stream block
DRY_RUN=false                # Set to true for testing
MAX_RETRIES=3                # Failed batch retries

# Optional Filtering
EXCLUDE_DATASET_ITEMS=false  # Skip dataset run items (not implemented)
```

## Testing Workflow

### Step 1: Dry Run on Small Partition

Start with a small historical partition to validate the logic:

```bash
# Test on January 2024 (assuming it's small)
python backfill_events.py --partition 202401 --dry-run
```

Expected output:
```
================================================================================
ClickHouse Events Backfill
================================================================================

Configuration:
ClickHouse: http://localhost:8123
Database: default
Partition: 202401
Batch size: 10000
Stream block size: 50000
Dry run: True
Exclude dataset items: False

Connected successfully ✓

================================================================================
Phase 1: Loading trace_attrs for partition 202401
================================================================================
Executing query...
Building in-memory dict...
Loading trace_attrs: 100%|████████████| 1234567/1234567 [00:05<00:00, 245678 traces/s]

✓ Loaded 1,234,567 trace attrs
✓ Memory usage: 3200.5 MB
✓ Time: 5.2s

================================================================================
Phase 2: Streaming observations from partition 202401
================================================================================
Total observations to process: 10,000,000
Streaming observations (block size: 50000)...
Processing observations: 100%|████████| 10000000/10000000 [02:15<00:00, 73856 obs/s]

✓ Processed 10,000,000 observations
✓ Inserted 0 events
✓ Errors: 0
✓ Time: 135.4s

================================================================================
BACKFILL SUMMARY
================================================================================
Partition: 202401
Dry run: True

Statistics:
  Trace attrs loaded: 1,234,567
  Observations processed: 10,000,000
  Events inserted: 0
  Errors: 0

Timing:
  Trace loading: 5.2s
  Observation streaming: 135.4s
  Event insertion: 0.0s
  Total: 140.6s (2.3m)

Throughput: 73,856 observations/sec

================================================================================

✓ Dry run completed successfully (no data inserted)
```

### Step 2: Actual Run on Small Partition

If dry run succeeds, run with actual inserts:

```bash
python backfill_events.py --partition 202401
```

### Step 3: Validate Results

Check that events were inserted correctly:

```sql
-- Count events in partition
SELECT count()
FROM events
WHERE toYYYYMM(start_time) = 202401
  AND is_deleted = 0;

-- Compare with observations count
SELECT count()
FROM observations
WHERE _partition_id = '202401'
  AND is_deleted = 0;

-- Sample events to verify enrichment
SELECT
    project_id,
    trace_id,
    span_id,
    user_id,
    session_id,
    metadata
FROM events
WHERE toYYYYMM(start_time) = 202401
LIMIT 10;
```

### Step 4: Run on Medium Partition

Once validated, run on your target partition:

```bash
python backfill_events.py --partition 202406
```

## Performance Estimates

Based on 500M row partition:

| Phase | Estimated Time | Notes |
|-------|----------------|-------|
| Trace attrs loading | 5-10 min | Loads ~15M trace records into memory |
| Observation streaming | 1-2 hours | Network + Python parsing overhead |
| Event insertion | 1-2 hours | 10k row batches with async inserts |
| **Total** | **2.5-4 hours** | For 500M observation partition |

For 2.5B row partition (like 202510):
- Estimated time: **12-20 hours**
- Memory required: ~64GB (for trace attrs)

## Monitoring

The script provides real-time progress via tqdm progress bars:
- Trace attrs loading progress
- Observations processed
- Estimated time remaining

To monitor ClickHouse side:
```sql
-- Check running queries
SELECT query, elapsed, read_rows, memory_usage
FROM system.processes
WHERE query LIKE '%events%';

-- Check async insert queue
SELECT database, table, bytes, rows
FROM system.asynchronous_insert_log
WHERE database = 'default' AND table = 'events'
ORDER BY event_time DESC
LIMIT 10;
```

## Troubleshooting

### Out of Memory

If you run out of memory during trace attrs loading:

1. Check available memory: `free -h` (Linux) or Activity Monitor (Mac)
2. Reduce memory usage by filtering traces more aggressively
3. Consider processing older partitions first (typically smaller)

### Slow Streaming

If observation streaming is very slow:

1. Check network latency to ClickHouse
2. Increase `STREAM_BLOCK_SIZE` (e.g., 100000)
3. Verify ClickHouse isn't under heavy load

### Insert Failures

If batch inserts fail repeatedly:

1. Check ClickHouse logs for errors
2. Reduce `BATCH_SIZE` (e.g., 5000)
3. Verify `events` table exists and schema matches
4. Check disk space on ClickHouse server

### Data Validation Failures

If row counts don't match between observations and events:

1. Check for errors in script output
2. Query observations and events tables to compare counts
3. Look for observations that might have been filtered out
4. Re-run with `--dry-run` to see transformation without inserts

## Architecture Notes

### Why Python Streaming vs ClickHouse-Native?

**Advantages:**
- Full control over transformation logic
- Easier debugging and observability
- Can add custom enrichment/filtering
- Better error handling

**Trade-offs:**
- Slower than native ClickHouse (serialization overhead)
- Requires external Python environment
- More memory usage (trace attrs in Python vs ClickHouse)

### Memory Management

The script loads trace attrs into Python memory for fast lookups:
- Each trace attr: ~50-100 bytes (depending on metadata size)
- 15M traces ≈ 3-4GB in memory
- Large partitions (2.5B rows) may have 100M+ traces ≈ 35-40GB

Observations are streamed in blocks, so they don't consume unbounded memory.

### Resumability

Currently, the script does NOT support mid-partition resumability. If interrupted:
- Re-run from the beginning
- Events table uses `ReplacingMergeTree`, so duplicate inserts will be deduplicated

Future enhancement: Track last processed `span_id` in state file.

## Deployment to EC2

For production backfills on large partitions:

1. Launch EC2 instance (recommended: `r6i.4xlarge` or larger)
   - 128GB+ RAM
   - 16+ vCPUs
   - Same VPC as ClickHouse for low latency

2. Install dependencies:
```bash
sudo apt update
sudo apt install python3 python3-pip python3-venv
```

3. Copy script and configure:
```bash
scp -r scripts/clickhouse-backfill ec2-user@instance:/home/ec2-user/
ssh ec2-user@instance
cd clickhouse-backfill
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

4. Run in tmux/screen (for long-running processes):
```bash
tmux new -s backfill
python backfill_events.py --partition 202510
# Ctrl+B, D to detach
```

5. Monitor progress:
```bash
tmux attach -t backfill
```

## Next Steps

1. Test dry run on small partition locally
2. Validate data integrity
3. Run on medium partition (202406)
4. Deploy to EC2 for large partitions
5. Process all remaining partitions

## Support

For issues or questions:
- Check ClickHouse logs
- Review script output for errors
- Verify environment configuration
- Test with smaller partitions first
