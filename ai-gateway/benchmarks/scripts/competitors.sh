#!/usr/bin/env bash
# Run the Langfuse gateway and other open-source gateways through the same
# scenarios in one session, one gateway at a time on the gateway's CPU and
# memory slot (docker-compose.competitors.yml). The direct-to-mock baseline runs
# once, with the Langfuse gateway.
#
# Usage: scripts/competitors.sh [gateway ...]
#   langfuse              the Langfuse gateway (and the direct baseline)
#   litellm               LiteLLM, admission control sized like the Langfuse budget
#   litellm-ratelimited   LiteLLM with rpm/tpm limits on the virtual key (sweep only)
#   litellm-no-tracing    LiteLLM without the Langfuse callback (sweep only)
#   litellm-no-admission  LiteLLM's default: no admission control (memory scenarios)
#   portkey               Portkey, one container as published
#   portkey-2x            Portkey, two 1 vCPU / 2 GiB replicas
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
SCENARIOS="${BENCH_COMPETITOR_SCENARIOS:-sweep burst budget long-streams}"
# The variants default to their own scenarios; BENCH_COMPETITOR_SCENARIOS overrides them too.
LITELLM_MASTER="sk-bench-litellm-master"

stop_slot() {
  docker compose stop ai-gateway litellm portkey portkey-2x >/dev/null 2>&1 || true
}

litellm_ready() { curl -fsS http://127.0.0.1:14000/health/readiness; }

# Virtual keys live in LiteLLM's database, so they survive container restarts.
litellm_keys() {
  local key body
  for key in sk-bench-litellm-key sk-bench-litellm-limited; do
    body="{\"key\":\"$key\",\"models\":[\"gpt-4.1-mini\"],\"key_alias\":\"$key\""
    if [[ "$key" == *limited ]]; then
      # Far above anything the benchmark sends: limits are checked, never hit.
      body+=",\"rpm_limit\":100000000,\"tpm_limit\":1000000000000"
    fi
    curl -fsS -o /dev/null http://127.0.0.1:14000/key/generate \
      -H "Authorization: Bearer $LITELLM_MASTER" -H 'content-type: application/json' \
      -d "$body}" || true
  done
}

start() {
  stop_slot
  docker compose up -d --no-deps "$1" >/dev/null 2>&1
}

run_litellm() {
  local name="$1" key="$2" config="$3"
  shift 3
  export BENCH_LITELLM_CONFIG="$config"
  docker compose exec -T postgres psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'litellm'" | grep -q 1 ||
    docker compose exec -T postgres psql -U postgres -c 'CREATE DATABASE litellm' >/dev/null
  start litellm
  for _ in $(seq 1 180); do litellm_ready >/dev/null 2>&1 && break; sleep 1; done
  litellm_keys
  BENCH_RUN="$SESSION-$name" BENCH_SKIP_DIRECT=1 \
    BENCH_TARGET_SERVICE=litellm \
    BENCH_TARGET_URL=http://litellm:4000/v1/chat/completions \
    BENCH_TARGET_READY_CMD="curl -fsS http://127.0.0.1:14000/health/readiness" \
    BENCH_TARGET_READY_SECONDS=180 \
    BENCH_API_KEY="$key" \
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
    litellm) run_litellm litellm sk-bench-litellm-key litellm.yaml $SCENARIOS ;;
    litellm-ratelimited) run_litellm litellm-ratelimited sk-bench-litellm-limited litellm.yaml ${BENCH_COMPETITOR_SCENARIOS:-sweep} ;;
    litellm-no-tracing) run_litellm litellm-no-tracing sk-bench-litellm-key litellm-no-tracing.yaml ${BENCH_COMPETITOR_SCENARIOS:-sweep} ;;
    litellm-no-admission) run_litellm litellm-no-admission sk-bench-litellm-key litellm-no-admission.yaml ${BENCH_COMPETITOR_SCENARIOS:-burst budget long-streams} ;;
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
  gateways=(langfuse litellm litellm-ratelimited litellm-no-tracing litellm-no-admission portkey portkey-2x)
fi
for gateway in "${gateways[@]}"; do
  echo "=== $gateway"
  run "$gateway"
done
stop_slot
docker compose up -d --no-deps ai-gateway >/dev/null 2>&1
