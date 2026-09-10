#!/usr/bin/env bash
set -euo pipefail

image="${1:?Usage: bash scripts/smoke-image.sh IMAGE}"
container="$(docker run -d --read-only --cap-drop ALL --security-opt no-new-privileges \
  -e LANGFUSE_AI_GATEWAY_SHUTDOWN_TIMEOUT_SECONDS=2 -p 127.0.0.1::8080 "$image")"
cleanup() {
  docker logs "$container" || true
  docker rm -f "$container" >/dev/null || true
}
trap cleanup EXIT
port="$(docker port "$container" 8080/tcp)"
for route in health ready; do
  body="$(curl --fail --silent --show-error --retry 20 --retry-connrefused \
    --retry-delay 1 --max-time 2 "http://$port/$route")"
  case "$route:$body" in
    'health:{"status":"ok"}'|'ready:{"status":"ready"}') ;;
    *) echo "Unexpected probe response: $route" >&2; exit 1 ;;
  esac
done
[[ "$(docker exec "$container" id -u)" != 0 ]]
[[ "$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --max-time 2 -X POST "http://$port/openai/v1/responses")" == 404 ]]
docker stop --time 5 "$container" >/dev/null
[[ "$(docker inspect --format '{{.State.ExitCode}}' "$container")" == 0 ]]
docker logs "$container" 2>&1 | grep -q 'gateway draining'
docker logs "$container" 2>&1 | grep -q 'gateway stopped'
printf '%s\n' 'Image smoke: non-root, probes, unimplemented inference, SIGTERM passed'
