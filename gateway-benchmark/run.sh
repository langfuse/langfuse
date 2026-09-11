#!/usr/bin/env bash

set -euo pipefail

benchmark_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
compose=(docker compose --project-directory "$benchmark_dir" -f "$benchmark_dir/docker-compose.yml")

duration_seconds="${DURATION_SECONDS:-15}"
warmup_seconds="${WARMUP_SECONDS:-2}"
repetitions="${REPETITIONS:-1}"
concurrency="${CONCURRENCY:-20}"
chunk_count="${CHUNK_COUNT:-20}"
chunk_delay_ms="${CHUNK_DELAY_MS:-10}"
chunk_bytes="${CHUNK_BYTES:-128}"
large_payload_bytes="${LARGE_PAYLOAD_BYTES:-4194304}"
second_pass="${SECOND_PASS:-0}"
realistic_pass="${REALISTIC_PASS:-0}"
native_small_concurrency="${NATIVE_SMALL_CONCURRENCY:-20}"
native_small_chunk_count="${NATIVE_SMALL_CHUNK_COUNT:-$chunk_count}"
native_small_chunk_delay_ms="${NATIVE_SMALL_CHUNK_DELAY_MS:-$chunk_delay_ms}"
native_small_chunk_bytes="${NATIVE_SMALL_CHUNK_BYTES:-$chunk_bytes}"
native_large_concurrency="${NATIVE_LARGE_CONCURRENCY:-20}"
native_large_chunk_count="${NATIVE_LARGE_CHUNK_COUNT:-$chunk_count}"
native_large_chunk_delay_ms="${NATIVE_LARGE_CHUNK_DELAY_MS:-$chunk_delay_ms}"
native_large_chunk_bytes="${NATIVE_LARGE_CHUNK_BYTES:-$chunk_bytes}"
translate_small_concurrency="${TRANSLATE_SMALL_CONCURRENCY:-$concurrency}"
translate_small_chunk_count="${TRANSLATE_SMALL_CHUNK_COUNT:-$chunk_count}"
translate_small_chunk_delay_ms="${TRANSLATE_SMALL_CHUNK_DELAY_MS:-$chunk_delay_ms}"
translate_small_chunk_bytes="${TRANSLATE_SMALL_CHUNK_BYTES:-$chunk_bytes}"
translate_large_concurrency="${TRANSLATE_LARGE_CONCURRENCY:-20}"
translate_large_chunk_count="${TRANSLATE_LARGE_CHUNK_COUNT:-$chunk_count}"
translate_large_chunk_delay_ms="${TRANSLATE_LARGE_CHUNK_DELAY_MS:-$chunk_delay_ms}"
translate_large_chunk_bytes="${TRANSLATE_LARGE_CHUNK_BYTES:-$chunk_bytes}"
burst_concurrencies="${BURST_CONCURRENCIES:-20,100,500}"
burst_chunk_count="${BURST_CHUNK_COUNT:-100}"
burst_chunk_bytes="${BURST_CHUNK_BYTES:-1024}"
realistic_concurrencies="${REALISTIC_CONCURRENCIES:-20,100,250,500}"
realistic_chunk_delays_ms="${REALISTIC_CHUNK_DELAYS_MS:-25,100}"
realistic_chunk_count="${REALISTIC_CHUNK_COUNT:-100}"
realistic_chunk_bytes="${REALISTIC_CHUNK_BYTES:-128}"
realistic_start_spread_ms="${REALISTIC_START_SPREAD_MS:-5000}"
realistic_include_baselines="${REALISTIC_INCLUDE_BASELINES:-1}"
realistic_include_native_control="${REALISTIC_INCLUDE_NATIVE_CONTROL:-$realistic_include_baselines}"
realistic_include_translation_sweep="${REALISTIC_INCLUDE_TRANSLATION_SWEEP:-1}"
realistic_native_control_concurrency="${REALISTIC_NATIVE_CONTROL_CONCURRENCY:-500}"
realistic_stream_profile="${REALISTIC_STREAM_PROFILE:-coding-agent}"
runtimes_csv="${RUNTIMES:-node24,node26,rust}"
mock_upstream_host_port="${MOCK_UPSTREAM_HOST_PORT:-14000}"
mock_otel_host_port="${MOCK_OTEL_HOST_PORT:-14318}"
node24_gateway_host_port="${NODE24_GATEWAY_HOST_PORT:-13100}"
node26_gateway_host_port="${NODE26_GATEWAY_HOST_PORT:-13300}"
rust_gateway_host_port="${RUST_GATEWAY_HOST_PORT:-13200}"
gateway_cpus="${GATEWAY_CPUS:-4}"
gateway_memory_limit="${GATEWAY_MEMORY_LIMIT:-2g}"
tokio_worker_threads="${TOKIO_WORKER_THREADS:-$gateway_cpus}"
start_spread_ms=0

if [[ "$realistic_pass" == "1" ]]; then
  start_spread_ms="$realistic_start_spread_ms"
fi

export GATEWAY_CPUS="$gateway_cpus"
export GATEWAY_MEMORY_LIMIT="$gateway_memory_limit"
export TOKIO_WORKER_THREADS="$tokio_worker_threads"

wait_for_health() {
  local url="$1"
  local name="$2"
  local attempt

  for attempt in $(seq 1 60); do
    if curl --fail --silent "$url" >/dev/null; then
      return 0
    fi
    sleep 1
  done

  echo "$name did not become healthy" >&2
  return 1
}

wait_for_telemetry_drain() {
  local port="$1"
  local runtime="$2"
  local attempt
  local snapshot

  for attempt in $(seq 1 120); do
    snapshot="$(curl --fail --silent "http://localhost:${port}/metrics")"
    if [[ "$snapshot" == *'"pending":0'* ]]; then
      return 0
    fi
    sleep 0.25
  done

  echo "$runtime telemetry queue did not drain" >&2
  return 1
}

gateway_is_healthy() {
  local port="$1"
  curl --fail --silent "http://localhost:${port}/health" >/dev/null
}

report_gateway_unavailable() {
  local runtime="$1"
  local service="${runtime}-gateway"
  local container_id

  echo "$runtime gateway is unavailable; recording Docker state and continuing"
  container_id="$("${compose[@]}" ps --all -q "$service" 2>/dev/null || true)"
  if [[ -n "$container_id" ]]; then
    docker inspect "$container_id" --format '{{json .State}}' || true
  fi
}

capture_cgroup_snapshot() {
  local service="$1"
  local container_id
  local values

  container_id="$("${compose[@]}" ps -q "$service" 2>/dev/null || true)"
  if [[ -z "$container_id" ]]; then
    printf 'none\t0\tnull\tnull\tnull\tnull\tnull\tnull\tnull\tnull\n'
    return
  fi

  if ! values="$(docker exec "$container_id" sh -c '
    if [ ! -r /sys/fs/cgroup/cgroup.controllers ]; then
      printf "0\tnull\tnull\tnull\tnull\tnull\tnull\tnull\tnull\n"
      exit 0
    fi

    cpu_value() {
      awk -v key="$1" '\''
        $1 == key { print $2; found = 1; exit }
        END { if (!found) print "null" }
      '\'' /sys/fs/cgroup/cpu.stat 2>/dev/null
    }

    scalar_value() {
      if [ -r "$1" ]; then
        IFS= read -r value < "$1" || true
        case "$value" in
          ""|*[!0-9]*) printf "null\n" ;;
          *) printf "%s\n" "$value" ;;
        esac
      else
        printf "null\n"
      fi
    }

    printf "1\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n" \
      "$(cpu_value usage_usec)" \
      "$(cpu_value user_usec)" \
      "$(cpu_value system_usec)" \
      "$(cpu_value nr_periods)" \
      "$(cpu_value nr_throttled)" \
      "$(cpu_value throttled_usec)" \
      "$(scalar_value /sys/fs/cgroup/memory.current)" \
      "$(scalar_value /sys/fs/cgroup/memory.peak)"
  ' 2>/dev/null)"; then
    printf '%s\t0\tnull\tnull\tnull\tnull\tnull\tnull\tnull\tnull\n' "$container_id"
    return
  fi

  printf '%s\t%s\n' "$container_id" "$values"
}

number_delta_or_null() {
  local before="$1"
  local after="$2"

  if [[ "$before" =~ ^[0-9]+$ && "$after" =~ ^[0-9]+$ ]] && (( after >= before )); then
    printf '%s' "$((after - before))"
  else
    printf 'null'
  fi
}

emit_cgroup_delta() {
  local label="$1"
  local service="$2"
  local before_snapshot="$3"
  local after_snapshot="$4"
  local before_id before_available before_usage before_user before_system
  local before_periods before_throttled before_throttled_usec before_memory before_peak
  local after_id after_available after_usage after_user after_system
  local after_periods after_throttled after_throttled_usec after_memory after_peak
  local available=false

  IFS=$'\t' read -r before_id before_available before_usage before_user before_system \
    before_periods before_throttled before_throttled_usec before_memory before_peak <<< "$before_snapshot"
  IFS=$'\t' read -r after_id after_available after_usage after_user after_system \
    after_periods after_throttled after_throttled_usec after_memory after_peak <<< "$after_snapshot"

  if [[ "$before_available" == "1" && "$after_available" == "1" && "$before_id" == "$after_id" ]]; then
    available=true
  fi

  printf '{"type":"cgroup_v2_delta","label":"%s","service":"%s","container_id":"%s","available":%s,' \
    "$label" "$service" "$after_id" "$available"
  printf '"cpu":{"usage_usec_delta":%s,"user_usec_delta":%s,"system_usec_delta":%s,' \
    "$(number_delta_or_null "$before_usage" "$after_usage")" \
    "$(number_delta_or_null "$before_user" "$after_user")" \
    "$(number_delta_or_null "$before_system" "$after_system")"
  printf '"periods_delta":%s,"throttled_periods_delta":%s,"throttled_usec_delta":%s},' \
    "$(number_delta_or_null "$before_periods" "$after_periods")" \
    "$(number_delta_or_null "$before_throttled" "$after_throttled")" \
    "$(number_delta_or_null "$before_throttled_usec" "$after_throttled_usec")"
  printf '"memory":{"current_bytes_before":%s,"current_bytes_after":%s,"peak_bytes_before":%s,"peak_bytes_after":%s}}\n' \
    "$before_memory" "$after_memory" "$before_peak" "$after_peak"
}

run_load() {
  local runtime="$1"
  local internal_port="$2"
  local mode="$3"
  local payload_bytes="$4"
  local case_name="$5"
  local seconds="$6"
  local case_concurrency="$7"
  local case_chunk_count="$8"
  local case_chunk_delay_ms="$9"
  local case_chunk_bytes="${10}"
  local payload_profile="${11}"
  local stream_profile="${12}"

  "${compose[@]}" run --rm --no-deps loadgen \
    --allow-errors \
    --url "http://${runtime}-gateway:${internal_port}/v1/chat/completions" \
    --label "${runtime}-${case_name}" \
    --mode "$mode" \
    --concurrency "$case_concurrency" \
    --duration-seconds "$seconds" \
    --payload-bytes "$payload_bytes" \
    --payload-profile "$payload_profile" \
    --stream-profile "$stream_profile" \
    --chunks "$case_chunk_count" \
    --chunk-delay-ms "$case_chunk_delay_ms" \
    --chunk-bytes "$case_chunk_bytes" \
    --start-spread-ms "$start_spread_ms"
}

run_case() {
  local runtime="$1"
  local internal_port="$2"
  local host_port="$3"
  local mode="$4"
  local payload_bytes="$5"
  local case_name="$6"
  local case_concurrency="$7"
  local case_chunk_count="$8"
  local case_chunk_delay_ms="$9"
  local case_chunk_bytes="${10}"
  local payload_profile="${11}"
  local stream_profile="${12}"
  local gateway_before upstream_before otel_before
  local gateway_after upstream_after otel_after

  echo
  echo "Warm-up: ${runtime}-${case_name}"
  run_load "$runtime" "$internal_port" "$mode" "$payload_bytes" "${case_name}-warmup" \
    "$warmup_seconds" "$case_concurrency" "$case_chunk_count" "$case_chunk_delay_ms" "$case_chunk_bytes" \
    "$payload_profile" "$stream_profile"
  if ! gateway_is_healthy "$host_port"; then
    report_gateway_unavailable "$runtime"
    return 0
  fi
  if ! wait_for_telemetry_drain "$host_port" "$runtime"; then
    echo "$runtime telemetry did not drain after warm-up; continuing"
  fi

  curl --fail --silent --request POST "http://localhost:${mock_otel_host_port}/reset" >/dev/null

  gateway_before="$(capture_cgroup_snapshot "${runtime}-gateway")"
  upstream_before="$(capture_cgroup_snapshot mock-upstream)"
  otel_before="$(capture_cgroup_snapshot mock-otel)"

  echo "Measured: ${runtime}-${case_name}"
  run_load "$runtime" "$internal_port" "$mode" "$payload_bytes" "$case_name" \
    "$duration_seconds" "$case_concurrency" "$case_chunk_count" "$case_chunk_delay_ms" "$case_chunk_bytes" \
    "$payload_profile" "$stream_profile"

  # Include deferred telemetry publication in the resource window. Latency is
  # still measured only through the client-visible [DONE] event by loadgen.
  if gateway_is_healthy "$host_port"; then
    if ! wait_for_telemetry_drain "$host_port" "$runtime"; then
      echo "$runtime telemetry did not drain after measurement; continuing"
    fi
  else
    report_gateway_unavailable "$runtime"
  fi

  gateway_after="$(capture_cgroup_snapshot "${runtime}-gateway")"
  upstream_after="$(capture_cgroup_snapshot mock-upstream)"
  otel_after="$(capture_cgroup_snapshot mock-otel)"
  emit_cgroup_delta "${runtime}-${case_name}" "${runtime}-gateway" "$gateway_before" "$gateway_after"
  emit_cgroup_delta "${runtime}-${case_name}" mock-upstream "$upstream_before" "$upstream_after"
  emit_cgroup_delta "${runtime}-${case_name}" mock-otel "$otel_before" "$otel_after"

  if gateway_is_healthy "$host_port"; then
    echo "${runtime} gateway metrics:"
    curl --fail --silent "http://localhost:${host_port}/metrics" || true
    echo
  fi
  echo "telemetry sink metrics:"
  curl --fail --silent "http://localhost:${mock_otel_host_port}/metrics" || true
  echo
}

prepare_gateways() {
  "${compose[@]}" up --detach --force-recreate --no-deps node24-gateway node26-gateway rust-gateway
  wait_for_health "http://localhost:${node24_gateway_host_port}/health" node24-gateway
  wait_for_health "http://localhost:${node26_gateway_host_port}/health" node26-gateway
  wait_for_health "http://localhost:${rust_gateway_host_port}/health" rust-gateway
}

run_group() {
  local repetition="$1"
  local ordinal="$2"
  local mode="$3"
  local payload_bytes="$4"
  local case_name="$5"
  local case_concurrency="$6"
  local case_chunk_count="$7"
  local case_chunk_delay_ms="$8"
  local case_chunk_bytes="$9"
  local payload_profile="${10}"
  local stream_profile="${11}"
  local -a runtimes
  local -a configured_runtimes
  local runtime
  local internal_port
  local host_port
  local runtime_count
  local offset
  local index

  prepare_gateways
  IFS=', ' read -r -a configured_runtimes <<< "$runtimes_csv"
  runtime_count="${#configured_runtimes[@]}"
  if (( runtime_count == 0 )); then
    echo "RUNTIMES must select at least one runtime" >&2
    return 1
  fi
  offset=$(( (repetition + ordinal) % runtime_count ))
  runtimes=()
  for ((index = 0; index < runtime_count; index += 1)); do
    runtimes+=("${configured_runtimes[$(((index + offset) % runtime_count))]}")
  done

  for runtime in "${runtimes[@]}"; do
    case "$runtime" in
      node24)
        internal_port=3100
        host_port="$node24_gateway_host_port"
        ;;
      node26)
        internal_port=3100
        host_port="$node26_gateway_host_port"
        ;;
      rust)
        internal_port=3200
        host_port="$rust_gateway_host_port"
        ;;
      *)
        echo "unsupported runtime in RUNTIMES: $runtime" >&2
        return 1
        ;;
    esac
    run_case "$runtime" "$internal_port" "$host_port" "$mode" "$payload_bytes" \
      "r${repetition}-${case_name}" "$case_concurrency" "$case_chunk_count" \
      "$case_chunk_delay_ms" "$case_chunk_bytes" "$payload_profile" "$stream_profile"
  done
}

"${compose[@]}" build mock-upstream mock-otel node24-gateway node26-gateway rust-gateway loadgen
"${compose[@]}" up --detach --force-recreate mock-upstream mock-otel
wait_for_health "http://localhost:${mock_upstream_host_port}/health" mock-upstream
wait_for_health "http://localhost:${mock_otel_host_port}/health" mock-otel

for repetition in $(seq 1 "$repetitions"); do
  if [[ "$realistic_pass" == "1" ]]; then
    if [[ "$realistic_include_baselines" == "1" ]]; then
      run_group "$repetition" 1 translate 0 realistic-agent-small-c20 \
        20 "$realistic_chunk_count" 100 "$realistic_chunk_bytes" \
        coding-agent-small "$realistic_stream_profile"
      run_group "$repetition" 2 translate 0 realistic-agent-large-c20 \
        20 "$realistic_chunk_count" 100 "$realistic_chunk_bytes" \
        coding-agent-large "$realistic_stream_profile"
      run_group "$repetition" 3 translate 0 realistic-agent-media-c20 \
        20 "$realistic_chunk_count" 100 "$realistic_chunk_bytes" \
        coding-agent-media "$realistic_stream_profile"
    fi
    if [[ "$realistic_include_native_control" == "1" ]]; then
      run_group "$repetition" 4 native 0 \
        "realistic-native-control-c${realistic_native_control_concurrency}" \
        "$realistic_native_control_concurrency" "$realistic_chunk_count" 50 \
        "$realistic_chunk_bytes" coding-agent-mix "$realistic_stream_profile"
    fi

    if [[ "$realistic_include_translation_sweep" == "1" ]]; then
      realistic_ordinal=5
      IFS=', ' read -r -a realistic_delay_values <<< "$realistic_chunk_delays_ms"
      IFS=', ' read -r -a realistic_concurrency_values <<< "$realistic_concurrencies"
      for realistic_delay in "${realistic_delay_values[@]}"; do
        [[ -n "$realistic_delay" ]] || continue
        for realistic_concurrency in "${realistic_concurrency_values[@]}"; do
          [[ -n "$realistic_concurrency" ]] || continue
          run_group "$repetition" "$realistic_ordinal" translate 0 \
            "realistic-translate-d${realistic_delay}-c${realistic_concurrency}" \
            "$realistic_concurrency" "$realistic_chunk_count" "$realistic_delay" \
            "$realistic_chunk_bytes" coding-agent-mix "$realistic_stream_profile"
          realistic_ordinal=$((realistic_ordinal + 1))
        done
      done
    fi
  elif [[ "$second_pass" == "1" ]]; then
    run_group "$repetition" 1 native 0 native-small \
      "$native_small_concurrency" "$native_small_chunk_count" \
      "$native_small_chunk_delay_ms" "$native_small_chunk_bytes" basic text
    run_group "$repetition" 2 native "$large_payload_bytes" native-large \
      "$native_large_concurrency" "$native_large_chunk_count" \
      "$native_large_chunk_delay_ms" "$native_large_chunk_bytes" basic text
    run_group "$repetition" 3 translate "$large_payload_bytes" translate-large \
      "$translate_large_concurrency" "$translate_large_chunk_count" \
      "$translate_large_chunk_delay_ms" "$translate_large_chunk_bytes" basic text

    burst_ordinal=4
    IFS=', ' read -r -a burst_concurrency_values <<< "$burst_concurrencies"
    for burst_concurrency in "${burst_concurrency_values[@]}"; do
      [[ -n "$burst_concurrency" ]] || continue
      run_group "$repetition" "$burst_ordinal" translate 0 \
        "translate-burst-c${burst_concurrency}" "$burst_concurrency" \
        "$burst_chunk_count" 0 "$burst_chunk_bytes" basic text
      burst_ordinal=$((burst_ordinal + 1))
    done
  else
    run_group "$repetition" 1 native 0 native-small \
      "$concurrency" "$chunk_count" "$chunk_delay_ms" "$chunk_bytes" basic text
    run_group "$repetition" 2 translate 0 translate-small \
      "$translate_small_concurrency" "$translate_small_chunk_count" \
      "$translate_small_chunk_delay_ms" "$translate_small_chunk_bytes" basic text
    run_group "$repetition" 3 translate "$large_payload_bytes" translate-large \
      "$concurrency" "$chunk_count" "$chunk_delay_ms" "$chunk_bytes" basic text
  fi
done

echo "Benchmark complete. Stop services with:"
echo "docker compose --project-directory '$benchmark_dir' -f '$benchmark_dir/docker-compose.yml' down"
