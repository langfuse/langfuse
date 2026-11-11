#!/usr/bin/env bash
# Run the Langfuse gateway and other open-source gateways through the same
# scenarios in one session, one gateway at a time on the gateway's CPU and
# memory slot (docker-compose.competitors.yml). The direct-to-mock baseline runs
# once, with the Langfuse gateway.
#
# Usage: scripts/competitors.sh [gateway ...]
#   langfuse     the Langfuse gateway as released (and the direct baseline)
#   litellm      LiteLLM with every optional per-request step it does beyond
#                the Langfuse gateway turned off (competitors/litellm.yaml)
#   litellm-passthrough
#                the same LiteLLM container on its OpenAI pass-through route,
#                which forwards the request body without the OpenAI SDK
#   portkey      Portkey, one container as published
#   portkey-2x   Portkey, two 1 vCPU / 2 GiB replicas
#
# Results land in results/<BENCH_SESSION>-<gateway>/.
set -euo pipefail
cd "$(dirname "$0")/.."

case ":${COMPOSE_FILE:-docker-compose.yml}:" in
  *:docker-compose.competitors.yml:*) ;;
  *) export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}:docker-compose.competitors.yml" ;;
esac
export COMPOSE_PROFILES=competitors
SESSION="${BENCH_SESSION:-competitors-$(date -u +%Y%m%dT%H%M%SZ)}"
SCENARIOS="${BENCH_COMPETITOR_SCENARIOS:-sweep long-streams}"
LITELLM_MASTER="sk-bench-litellm-master"

stop_slot() {
  docker compose stop ai-gateway litellm portkey portkey-2x >/dev/null 2>&1 || true
}

start() {
  stop_slot
  docker compose up -d --no-deps "$1" >/dev/null 2>&1
}

run_litellm() {
  local name="$1" path="$2"
  shift 2
  start litellm
  BENCH_RUN="$SESSION-$name" BENCH_SKIP_DIRECT=1 \
    BENCH_TARGET_SERVICE=litellm \
    BENCH_TARGET_URL="http://litellm:4000$path" \
    BENCH_TARGET_READY_CMD="curl -fsS http://127.0.0.1:14000/health/readiness" \
    BENCH_TARGET_READY_SECONDS=180 \
    BENCH_API_KEY="$LITELLM_MASTER" \
    scripts/run.sh "$@"
}

run_portkey() {
  local name="$1" service="$2" ready="$3"
  shift 3
  start "$service"
  BENCH_RUN="$SESSION-$name" BENCH_SKIP_DIRECT=1 \
    BENCH_TARGET_SERVICE="$service" \
    BENCH_TARGET_URL="http://$service:8787/v1/chat/completions" \
    BENCH_TARGET_READY_CMD="$ready" \
    BENCH_API_KEY=sk-bench-upstream-not-a-real-key \
    BENCH_HEADERS="x-portkey-provider: openai" \
    scripts/run.sh "$@"
}

run() {
  case "$1" in
    langfuse)
      start ai-gateway
      BENCH_RUN="$SESSION-langfuse" scripts/run.sh $SCENARIOS
      ;;
    litellm) run_litellm litellm /v1/chat/completions $SCENARIOS ;;
    litellm-passthrough) run_litellm litellm-passthrough /openai/v1/chat/completions $SCENARIOS ;;
    portkey) run_portkey portkey portkey "curl -fsS http://127.0.0.1:18787/" $SCENARIOS ;;
    portkey-2x)
      run_portkey portkey-2x portkey-2x \
        "docker compose exec -T --index 1 portkey-2x wget -qO- http://127.0.0.1:8787/ && docker compose exec -T --index 2 portkey-2x wget -qO- http://127.0.0.1:8787/" \
        $SCENARIOS
      ;;
    *)
      echo "unknown gateway: $1" >&2
      return 1
      ;;
  esac
}

gateways=("$@")
if [[ ${#gateways[@]} -eq 0 ]]; then
  gateways=(langfuse litellm litellm-passthrough portkey portkey-2x)
fi
for gateway in "${gateways[@]}"; do
  echo "=== $gateway"
  run "$gateway"
done
stop_slot
docker compose up -d --no-deps ai-gateway >/dev/null 2>&1
