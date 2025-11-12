#!/usr/bin/env python3
"""
ClickHouse Events Backfill Script

Streams observations from ClickHouse, enriches with trace attributes,
and inserts into events table. Processes full partition without chunking.

Usage:
    python backfill_events.py --partition 202406
    python backfill_events.py --partition 202406 --dry-run
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional, Tuple, Any
from dotenv import load_dotenv
import clickhouse_connect
from clickhouse_connect.driver.client import Client
from tqdm import tqdm
import psutil

# Load environment variables
load_dotenv()


class Config:
    """Configuration from environment variables"""

    def __init__(self, args):
        self.clickhouse_url = os.getenv("CLICKHOUSE_URL", "http://localhost:8123")
        self.clickhouse_user = os.getenv("CLICKHOUSE_USER", "clickhouse")
        self.clickhouse_password = os.getenv("CLICKHOUSE_PASSWORD", "clickhouse")
        self.clickhouse_db = os.getenv("CLICKHOUSE_DB", "default")

        # Processing parameters (CLI args override env vars)
        self.partition = args.partition or os.getenv("PARTITION", "202511")
        self.batch_size = args.batch_size or int(os.getenv("BATCH_SIZE", "10000"))
        self.stream_block_size = int(os.getenv("STREAM_BLOCK_SIZE", "50000"))
        self.dry_run = args.dry_run or os.getenv("DRY_RUN", "false").lower() == "true"
        self.max_retries = int(os.getenv("MAX_RETRIES", "3"))
        self.exclude_dataset_items = os.getenv("EXCLUDE_DATASET_ITEMS", "true").lower() == "true"

        # State file for resumability
        self.state_file = f"backfill_state_{self.partition}.json"

    def __str__(self):
        return (
            f"ClickHouse: {self.clickhouse_url}\n"
            f"Database: {self.clickhouse_db}\n"
            f"Partition: {self.partition}\n"
            f"Batch size: {self.batch_size}\n"
            f"Stream block size: {self.stream_block_size}\n"
            f"Dry run: {self.dry_run}\n"
            f"Exclude dataset items: {self.exclude_dataset_items}"
        )


class ClickHouseBackfill:
    """Main backfill orchestrator"""

    def __init__(self, config: Config):
        self.config = config
        self.client: Optional[Client] = None
        self.insert_client: Optional[Client] = None  # Separate client for inserts
        self.trace_attrs: Dict[Tuple[str, str], Dict[str, Any]] = {}
        self.stats = {
            "trace_attrs_loaded": 0,
            "observations_processed": 0,
            "events_inserted": 0,
            "errors": 0,
            "start_time": None,
            "trace_load_time": 0,
            "streaming_time": 0,
            "insert_time": 0,
        }

    def connect(self):
        """Establish ClickHouse connection"""
        print(f"Connecting to ClickHouse at {self.config.clickhouse_url}...")

        # Parse URL
        url = self.config.clickhouse_url.replace("http://", "").replace("https://", "")
        host, port = url.split(":") if ":" in url else (url, "8123")

        # Read client for queries and streaming
        self.client = clickhouse_connect.get_client(
            host=host,
            port=int(port),
            username=self.config.clickhouse_user,
            password=self.config.clickhouse_password,
            database=self.config.clickhouse_db,
            settings={
                "max_block_size": self.config.stream_block_size,
            }
        )

        # Separate insert client to avoid session locking
        self.insert_client = clickhouse_connect.get_client(
            host=host,
            port=int(port),
            username=self.config.clickhouse_user,
            password=self.config.clickhouse_password,
            database=self.config.clickhouse_db,
            settings={
                "async_insert": 1,
                "wait_for_async_insert": 1,
            }
        )
        print("Connected successfully ✓")

    def load_trace_attrs(self):
        """Load trace attributes into memory"""
        print(f"\n{'='*80}")
        print(f"Phase 1: Loading trace_attrs for partition {self.config.partition}")
        print(f"{'='*80}")

        start_time = time.time()

        query = """
            SELECT
                project_id,
                id AS trace_id,
                user_id,
                session_id,
                metadata,
                tags,
                public,
                bookmarked,
                release
            FROM traces
            WHERE _partition_id = {partition:String}
              AND is_deleted = 0
        """

        print(f"Executing query...")
        result = self.client.query(query, parameters={"partition": self.config.partition})

        print(f"Building in-memory dict...")
        for row in tqdm(result.result_rows, desc="Loading trace_attrs", unit=" traces"):
            project_id = row[0]
            trace_id = row[1]
            user_id = row[2] or ""
            session_id = row[3] or ""
            metadata = row[4] or {}
            tags = row[5] or []
            public = row[6] or False
            bookmarked = row[7] or False
            release = row[8] or ""

            # Add trace_tags to metadata if tags exist
            if tags:
                metadata = {**metadata, "trace_tags": json.dumps(tags)}

            self.trace_attrs[(project_id, trace_id)] = {
                "user_id": user_id,
                "session_id": session_id,
                "metadata": metadata,
                "public": public,
                "bookmarked": bookmarked,
                "release": release,
            }

        self.stats["trace_attrs_loaded"] = len(self.trace_attrs)
        self.stats["trace_load_time"] = time.time() - start_time

        # Memory usage
        process = psutil.Process()
        memory_mb = process.memory_info().rss / 1024 / 1024

        print(f"\n✓ Loaded {self.stats['trace_attrs_loaded']:,} trace attrs")
        print(f"✓ Memory usage: {memory_mb:.1f} MB")
        print(f"✓ Time: {self.stats['trace_load_time']:.1f}s")

    def get_observation_count(self) -> int:
        """Get total observations count for partition"""
        query = """
            SELECT count()
            FROM observations
            WHERE _partition_id = {partition:String}
              AND is_deleted = 0
        """
        result = self.client.query(query, parameters={"partition": self.config.partition})
        return result.result_rows[0][0]

    def stream_observations(self):
        """Stream observations and transform to events"""
        print(f"\n{'='*80}")
        print(f"Phase 2: Streaming observations from partition {self.config.partition}")
        print(f"{'='*80}")

        # Get total count for progress bar
        total_count = self.get_observation_count()
        print(f"Total observations to process: {total_count:,}")

        query = """
            SELECT
                project_id,
                id,
                trace_id,
                parent_observation_id,
                start_time,
                end_time,
                name,
                type,
                environment,
                version,
                level,
                status_message,
                completion_start_time,
                prompt_id,
                prompt_name,
                prompt_version,
                internal_model_id,
                provided_model_name,
                model_parameters,
                provided_usage_details,
                usage_details,
                provided_cost_details,
                cost_details,
                input,
                output,
                metadata,
                created_at,
                updated_at,
                event_ts
            FROM observations
            WHERE _partition_id = {partition:String}
              AND is_deleted = 0
        """

        start_time = time.time()
        batch = []

        print(f"Streaming observations (block size: {self.config.stream_block_size})...")

        with tqdm(total=total_count, desc="Processing observations", unit=" obs") as pbar:
            # Stream results - must use context manager
            with self.client.query_row_block_stream(
                query,
                parameters={"partition": self.config.partition}
            ) as result:
                for block in result:
                    for row in block:
                        try:
                            event = self.transform_observation_to_event(row)
                            batch.append(event)
                            self.stats["observations_processed"] += 1

                            # Insert batch when full
                            if len(batch) >= self.config.batch_size:
                                self.insert_events_batch(batch)
                                batch = []

                            pbar.update(1)

                        except Exception as e:
                            self.stats["errors"] += 1
                            print(f"\n⚠ Error processing observation: {e}")
                            continue

        # Insert remaining batch
        if batch:
            self.insert_events_batch(batch)

        self.stats["streaming_time"] = time.time() - start_time

        print(f"\n✓ Processed {self.stats['observations_processed']:,} observations")
        print(f"✓ Inserted {self.stats['events_inserted']:,} events")
        print(f"✓ Errors: {self.stats['errors']}")
        print(f"✓ Time: {self.stats['streaming_time']:.1f}s")

    def transform_observation_to_event(self, row: tuple) -> Dict[str, Any]:
        """Transform observation row to event dict"""
        # Unpack observation fields
        (project_id, obs_id, trace_id, parent_observation_id, start_time, end_time,
         name, obs_type, environment, version, level, status_message,
         completion_start_time, prompt_id, prompt_name, prompt_version,
         internal_model_id, provided_model_name, model_parameters,
         provided_usage_details, usage_details, provided_cost_details, cost_details,
         input_text, output_text, metadata, created_at, updated_at, event_ts) = row

        # Get trace attributes
        trace_attr = self.trace_attrs.get((project_id, trace_id), {})

        # Calculate parent_span_id
        if obs_id == f"t-{trace_id}":
            parent_span_id = ""
        else:
            parent_span_id = parent_observation_id or f"t-{trace_id}"

        # Bookmarked only applies to root observations
        is_root = not parent_observation_id or parent_observation_id == ""
        bookmarked = trace_attr.get("bookmarked", False) and is_root

        # Merge metadata
        obs_metadata = metadata or {}
        trace_metadata = trace_attr.get("metadata", {})
        merged_metadata = {**obs_metadata, **trace_metadata}

        # Determine source
        source = "otel" if "resourceAttributes" in obs_metadata else "ingestion-api"

        # Helper function to convert Decimals to float for JSON serialization
        def decimal_to_float(obj):
            """Convert Decimal objects to float for JSON serialization"""
            if isinstance(obj, Decimal):
                return float(obj)
            elif isinstance(obj, dict):
                return {k: decimal_to_float(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [decimal_to_float(item) for item in obj]
            return obj

        # Helper function to safely serialize to JSON string for ClickHouse String columns
        def safe_json_string(value):
            """
            Convert value to JSON string for ClickHouse String columns.
            Handles Decimal types and ensures proper JSON serialization.
            """
            if value is None or value == "":
                return "{}"
            if isinstance(value, str):
                # Already a string, assume it's valid JSON
                return value if value else "{}"
            if isinstance(value, dict):
                # Dict: convert Decimals and serialize to JSON
                return json.dumps(decimal_to_float(value)) if value else "{}"
            # For any other type, try to serialize
            try:
                return json.dumps(decimal_to_float(value))
            except:
                return "{}"

        # Helper function for Map columns (metadata)
        def safe_dict(value):
            """
            Convert value to dict for ClickHouse Map columns.
            ClickHouse Map columns expect native Python dicts, not JSON strings.
            """
            if value is None or value == "":
                return {}
            if isinstance(value, dict):
                # Already a dict, convert any Decimals
                return decimal_to_float(value) if value else {}
            if isinstance(value, str):
                # Try to parse JSON string
                try:
                    if not value or value == "{}":
                        return {}
                    parsed = json.loads(value)
                    return decimal_to_float(parsed) if isinstance(parsed, dict) else {}
                except:
                    return {}
            # For any other type, try to convert
            try:
                result = json.loads(json.dumps(decimal_to_float(value)))
                return result if isinstance(result, dict) else {}
            except:
                return {}

        # Build event dict
        event = {
            "project_id": project_id,
            "trace_id": trace_id,
            "span_id": obs_id,
            "parent_span_id": parent_span_id,
            "start_time": start_time,
            "end_time": end_time,
            "name": name or "",
            "type": obs_type or "",
            "environment": environment or "",
            "version": version or "",
            "release": trace_attr.get("release", ""),
            "user_id": trace_attr.get("user_id", ""),
            "session_id": trace_attr.get("session_id", ""),
            "public": trace_attr.get("public", False),
            "bookmarked": bookmarked,
            "level": level or "",
            "status_message": status_message or "",
            "completion_start_time": completion_start_time,
            "prompt_id": prompt_id or "",
            "prompt_name": prompt_name or "",
            "prompt_version": prompt_version,
            "model_id": internal_model_id or "",
            "provided_model_name": provided_model_name or "",
            "model_parameters": safe_json_string(model_parameters),
            "provided_usage_details": safe_dict(provided_usage_details),
            "usage_details": safe_dict(usage_details),
            "provided_cost_details": safe_dict(provided_cost_details),
            "cost_details": safe_dict(cost_details),
            "input": input_text or "",
            "output": output_text or "",
            # "metadata": safe_dict(merged_metadata),
            "metadata_names": list(merged_metadata.keys()) if merged_metadata else [],
            "metadata_raw_values": list(str(v) for v in merged_metadata.values()) if merged_metadata else [],
            "source": source,
            "event_bytes": 0,  # Will be calculated by ClickHouse
            "created_at": created_at,
            "updated_at": updated_at,
            "event_ts": event_ts,
            "is_deleted": 0,
        }

        return event

    def insert_events_batch(self, batch: List[Dict[str, Any]]):
        """Insert batch of events into events table"""
        if self.config.dry_run:
            return

        if not batch:
            return

        start_time = time.time()

        # Retry logic
        for attempt in range(self.config.max_retries):
            try:
                # Convert batch of dicts to list of lists (row-oriented)
                # clickhouse-connect expects: [[row1_val1, row1_val2, ...], [row2_val1, row2_val2, ...]]
                column_names = list(batch[0].keys())
                row_data = [[row[col] for col in column_names] for row in batch]

                # Use separate insert client to avoid session locking
                self.insert_client.insert(
                    "events",
                    row_data,
                    column_names=column_names
                )
                self.stats["events_inserted"] += len(batch)
                self.stats["insert_time"] += time.time() - start_time
                return

            except Exception as e:
                # Enhanced error logging
                error_type = type(e).__name__
                error_msg = str(e)

                # Sample batch info for debugging
                sample_ids = [
                    f"{batch[i]['project_id']}/{batch[i]['span_id'][:8]}..."
                    for i in range(min(3, len(batch)))
                ]

                if attempt < self.config.max_retries - 1:
                    wait_time = 2 ** attempt
                    print(f"\n⚠ Insert failed (attempt {attempt + 1}/{self.config.max_retries})")
                    print(f"   Error type: {error_type}")
                    print(f"   Error message: {error_msg}")
                    print(f"   Batch size: {len(batch)} events")
                    print(f"   Sample IDs: {', '.join(sample_ids)}")
                    print(f"   Retrying in {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    print(f"\n✗ Insert failed after {self.config.max_retries} attempts")
                    print(f"   Error type: {error_type}")
                    print(f"   Error message: {error_msg}")
                    print(f"   Batch size: {len(batch)} events")
                    print(f"   Sample IDs: {', '.join(sample_ids)}")
                    print(f"\n   Full error details:")
                    import traceback
                    traceback.print_exc()
                    self.stats["errors"] += len(batch)
                    raise

    def print_summary(self):
        """Print final summary"""
        print(f"\n{'='*80}")
        print(f"BACKFILL SUMMARY")
        print(f"{'='*80}")
        print(f"Partition: {self.config.partition}")
        print(f"Dry run: {self.config.dry_run}")
        print(f"\nStatistics:")
        print(f"  Trace attrs loaded: {self.stats['trace_attrs_loaded']:,}")
        print(f"  Observations processed: {self.stats['observations_processed']:,}")
        print(f"  Events inserted: {self.stats['events_inserted']:,}")
        print(f"  Errors: {self.stats['errors']}")
        print(f"\nTiming:")
        print(f"  Trace loading: {self.stats['trace_load_time']:.1f}s")
        print(f"  Observation streaming: {self.stats['streaming_time']:.1f}s")
        print(f"  Event insertion: {self.stats['insert_time']:.1f}s")

        if self.stats["start_time"]:
            total_time = time.time() - self.stats["start_time"]
            print(f"  Total: {total_time:.1f}s ({total_time/60:.1f}m)")

        if self.stats["observations_processed"] > 0:
            throughput = self.stats["observations_processed"] / max(self.stats["streaming_time"], 1)
            print(f"\nThroughput: {throughput:,.0f} observations/sec")

        print(f"{'='*80}")

    def run(self):
        """Main execution flow"""
        print(f"\n{'='*80}")
        print(f"ClickHouse Events Backfill")
        print(f"{'='*80}")
        print(f"\nConfiguration:")
        print(self.config)
        print()

        self.stats["start_time"] = time.time()

        try:
            # Connect to ClickHouse
            self.connect()

            # Phase 1: Load trace attributes
            self.load_trace_attrs()

            # Phase 2: Stream observations and insert events
            self.stream_observations()

            # Summary
            self.print_summary()

            if self.config.dry_run:
                print("\n✓ Dry run completed successfully (no data inserted)")
            else:
                print("\n✓ Backfill completed successfully")

        except KeyboardInterrupt:
            print("\n\n✗ Interrupted by user")
            self.print_summary()
            sys.exit(1)

        except Exception as e:
            print(f"\n\n✗ Fatal error: {e}")
            import traceback
            traceback.print_exc()
            self.print_summary()
            sys.exit(1)

        finally:
            if self.client:
                self.client.close()
            if self.insert_client:
                self.insert_client.close()


def main():
    parser = argparse.ArgumentParser(
        description="Backfill ClickHouse events table from observations",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--partition",
        type=str,
        help="Partition to process (e.g., 202406). Overrides PARTITION env var."
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        help="Number of events per insert batch. Overrides BATCH_SIZE env var."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run without inserting data (validation mode)"
    )

    args = parser.parse_args()

    # Create config and run backfill
    config = Config(args)
    backfill = ClickHouseBackfill(config)
    backfill.run()


if __name__ == "__main__":
    main()
