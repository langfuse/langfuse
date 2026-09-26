#!/usr/bin/env bash
# Writes the env file the web server tests run with: a dev env example plus
# the test overrides. Used by the tests-web and tests-fips CI jobs.

set -euo pipefail

readonly SOURCE="${1:?usage: write-web-test-env.sh <env example> <output>}"
readonly OUTPUT="${2:?usage: write-web-test-env.sh <env example> <output>}"

{
  grep -v -e '^LANGFUSE_S3_BATCH_EXPORT_ENABLED=' -e '^NEXT_PUBLIC_LANGFUSE_RUN_NEXT_INIT=' "$SOURCE"
  echo "LANGFUSE_INGESTION_QUEUE_DELAY_MS=1"
  echo "LANGFUSE_CACHE_PROMPT_ENABLED=false"
  echo "LANGFUSE_INGESTION_CLICKHOUSE_WRITE_INTERVAL_MS=1"
  echo "LANGFUSE_TRACE_DELETE_DELAY_MS=1"
  echo "LANGFUSE_TRACE_DELETE_CONCURRENCY=100"
  echo "ADMIN_API_KEY=admin-api-key"
  echo "LANGFUSE_EE_LICENSE_KEY=langfuse_ee_test"
  echo "LANGFUSE_SKIP_EVALUATOR_MODEL_CALL_VALIDATION=true"
  echo "LANGFUSE_ENABLE_SCORES_V3_API=true"
} > "$OUTPUT"
