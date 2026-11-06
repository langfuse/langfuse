#!/usr/bin/env bash
# Run benchmark scenarios against the running stack (see README.md).
#
# Usage: scripts/run.sh [scenario ...]
#   sweep       direct-to-mock baseline and gateway at each BENCH_LEVELS concurrency
#   burst       BENCH_BURSTS simultaneous requests, BENCH_BURST_ROUNDS rounds each
#   ingestion   USAGE vs FULL telemetry at BENCH_COMPARE_LEVELS
#   cache       web resolve cache off vs on at BENCH_COMPARE_LEVELS
#   web-slow    toxiproxy adds BENCH_WEB_LATENCY_MS to every gateway -> web call
#   web-down    web paused for BENCH_WEB_DOWN_SECONDS in the middle of a run
#   budget      BENCH_BUDGET_CONCURRENCY clients, more than the default budget admits
#   all         every scenario above (default)
#
# Results land in results/<BENCH_RUN>/<label>.{json,cgroup.csv}.
set -euo pipefail
cd "$(dirname "$0")/.."

RUN="${BENCH_RUN:-$(date -u +%Y%m%dT%H%M%SZ)}"
OUT="results/$RUN"
LEVELS="${BENCH_LEVELS:-1 10 50 100 250 500 1000}"
COMPARE_LEVELS="${BENCH_COMPARE_LEVELS:-50 250}"
BURSTS="${BENCH_BURSTS:-250 500 1000 2000}"
BURST_ROUNDS="${BENCH_BURST_ROUNDS:-5}"
DURATION="${BENCH_DURATION:-30}"
WARMUP="${BENCH_WARMUP:-5}"
GATEWAY_URL="http://ai-gateway:8080/openai/v1/chat/completions"
DIRECT_URL="https://api.openai.com/v1/chat/completions"
SAMPLED="ai-gateway langfuse-web mock-upstream"
mkdir -p "$OUT"
echo "results: $OUT"

compose() { docker compose "$@"; }

wait_gateway() {
  for _ in $(seq 1 60); do
    if curl -fsS http://127.0.0.1:18080/ready >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "gateway did not become ready" >&2
  return 1
}

# Recreate the gateway so every scenario starts from a cold process; extra
# environment (e.g. LANGFUSE_AI_GATEWAY_MEMORY_BUDGET_BYTES=...) is passed through.
restart_gateway() {
  env "$@" docker compose up -d --force-recreate --no-deps ai-gateway >/dev/null 2>&1
  wait_gateway
}

# Keep the limits the gateway started with (its startup log reports the derived
# memory budget) next to the results, for analyze.py.
record_gateway_limits() {
  docker compose logs --no-log-prefix ai-gateway | grep -F 'gateway listening' | tail -1 >"$OUT/gateway-startup.log"
  docker inspect -f '{{.HostConfig.Memory}}' "$(docker compose ps -q ai-gateway)" >"$OUT/gateway-memory-limit"
}

flush_resolve_cache() {
  compose exec -T redis sh -c \
    'redis-cli -a myredissecret --no-auth-warning --scan --pattern "ai-gateway:resolve:*" | xargs -r redis-cli -a myredissecret --no-auth-warning del' \
    >/dev/null
}

seed() {
  compose exec -T -e BENCH_INGESTION_MODE="$1" -w /app/worker langfuse-worker node bench-seed.cjs >/dev/null
  flush_resolve_cache
}

# run_case LABEL [loadgen args...]
run_case() {
  local label="$1"
  shift
  python3 scripts/sample_cgroup.py "$OUT/$label.cgroup.csv" $SAMPLED &
  local sampler=$!
  compose run --rm -T loadgen --label "$label" --out "/results/$RUN/$label.json" "$@" >/dev/null 2>"$OUT/$label.log" || true
  kill "$sampler" && wait "$sampler" || true
  if [[ -f "$OUT/$label.json" ]]; then
    python3 scripts/show.py "$OUT/$label.json"
  else
    echo "$label: loadgen failed, see $OUT/$label.log"
  fi
}

closed_loop() { echo --concurrency "$1" --duration "$DURATION" --warmup "$WARMUP"; }

scenario_sweep() {
  if [[ -z "${BENCH_SKIP_DIRECT:-}" ]]; then
    for level in $LEVELS; do
      run_case "direct-c$level" --url "$DIRECT_URL" --ca /certs/ca.crt $(closed_loop "$level")
    done
  fi
  restart_gateway
  for level in $LEVELS; do
    run_case "gateway-c$level" --url "$GATEWAY_URL" $(closed_loop "$level")
  done
}

scenario_burst() {
  for burst in $BURSTS; do
    run_case "direct-burst$burst" --url "$DIRECT_URL" --ca /certs/ca.crt --burst "$burst" --burst-rounds "$BURST_ROUNDS"
  done
  restart_gateway
  for burst in $BURSTS; do
    run_case "gateway-burst$burst" --url "$GATEWAY_URL" --burst "$burst" --burst-rounds "$BURST_ROUNDS"
  done
}

scenario_ingestion() {
  for mode in FULL USAGE; do
    seed "$mode"
    restart_gateway
    for level in $COMPARE_LEVELS; do
      run_case "ingestion-${mode,,}-c$level" --url "$GATEWAY_URL" $(closed_loop "$level")
    done
  done
}

scenario_cache() {
  for cache in false true; do
    BENCH_RESOLVE_CACHE="$cache" docker compose up -d --wait --no-deps langfuse-web >/dev/null 2>&1
    flush_resolve_cache
    restart_gateway
    for level in $COMPARE_LEVELS; do
      run_case "cache-$cache-c$level" --url "$GATEWAY_URL" $(closed_loop "$level")
    done
  done
}

toxiproxy() { curl -fsS -X "$1" "http://127.0.0.1:18474$2" ${3:+-H 'content-type: application/json' -d "$3"} >/dev/null; }

scenario_web_slow() {
  local latency="${BENCH_WEB_LATENCY_MS:-250}" level="${BENCH_RESILIENCE_LEVEL:-50}"
  restart_gateway BENCH_GATEWAY_WEB_URL=http://toxiproxy:3001
  run_case "web-proxy-c$level" --url "$GATEWAY_URL" $(closed_loop "$level")
  toxiproxy POST /proxies/web/toxics "{\"name\":\"latency\",\"type\":\"latency\",\"attributes\":{\"latency\":$latency,\"jitter\":0}}"
  run_case "web-slow${latency}-c$level" --url "$GATEWAY_URL" $(closed_loop "$level")
  toxiproxy DELETE /proxies/web/toxics/latency
  restart_gateway
}

scenario_web_down() {
  local down="${BENCH_WEB_DOWN_SECONDS:-10}" level="${BENCH_RESILIENCE_LEVEL:-50}"
  restart_gateway
  (
    sleep $((WARMUP + 10))
    date +%s.%N >"$OUT/web-down-c$level.pause"
    docker compose pause langfuse-web >/dev/null
    sleep "$down"
    docker compose unpause langfuse-web >/dev/null
    date +%s.%N >"$OUT/web-down-c$level.unpause"
  ) &
  local outage=$!
  run_case "web-down-c$level" --url "$GATEWAY_URL" --concurrency "$level" --duration 40 --warmup "$WARMUP" --timeout 30
  wait "$outage"
}

scenario_budget() {
  local level="${BENCH_BUDGET_CONCURRENCY:-2000}"
  restart_gateway
  run_case "budget-c$level" --url "$GATEWAY_URL" $(closed_loop "$level")
}

wait_gateway
record_gateway_limits

scenarios=("$@")
if [[ ${#scenarios[@]} -eq 0 || "${scenarios[0]}" == "all" ]]; then
  scenarios=(sweep burst ingestion cache web-slow web-down budget)
fi
for scenario in "${scenarios[@]}"; do
  echo "== $scenario"
  "scenario_${scenario//-/_}"
done
