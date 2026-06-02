#!/usr/bin/env bash
set -eo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if [[ "${1:-}" != "--dotenv-loaded" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing env file: $ENV_FILE" >&2
    exit 1
  fi

  export ENV_FILE
  exec pnpm exec dotenv -e "$ENV_FILE" -- "$0" --dotenv-loaded "$@"
fi
shift

IMAGE_NAME="${IMAGE_NAME:-langfuse-web-dev}"
HOST_PORT="${HOST_PORT:-3000}"
CONTAINER_PORT="${PORT:-3000}"
CONTAINER_HOSTNAME="${CONTAINER_HOSTNAME:-127.0.0.1}"
DOCKER_NETWORK_MODE="${DOCKER_NETWORK_MODE:-host}"

build_arg_names=(
  NEXT_PUBLIC_PLAIN_APP_ID
  NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
  NEXT_PUBLIC_DEMO_ORG_ID
  NEXT_PUBLIC_DEMO_PROJECT_ID
  NEXT_PUBLIC_SIGN_UP_DISABLED
  NEXT_PUBLIC_POSTHOG_KEY
  NEXT_PUBLIC_POSTHOG_HOST
  NEXT_PUBLIC_LANGFUSE_TRACING_SAMPLE_RATE
  NEXT_PUBLIC_SENTRY_ENVIRONMENT
  NEXT_PUBLIC_SENTRY_DSN
  NEXT_PUBLIC_BASE_PATH
  NEXT_PUBLIC_BUILD_ID
  SENTRY_AUTH_TOKEN
  SENTRY_ORG
  SENTRY_PROJECT
)

build_args=()
for name in "${build_arg_names[@]}"; do
  if [[ -n "${!name-}" ]]; then
    build_args+=(--build-arg "$name=${!name}")
  fi
done

env_args=()
while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)= ]]; then
    env_args+=(--env "${BASH_REMATCH[1]}")
  fi
done < "$ENV_FILE"

network_args=()
port_args=(-p "$HOST_PORT:$CONTAINER_PORT")
if [[ "$DOCKER_NETWORK_MODE" == "host" ]]; then
  network_args=(--network host)
  port_args=()
fi

tty_args=()
if [[ -t 0 && -t 1 ]]; then
  tty_args=(-it)
fi

cd "$ROOT_DIR"

if [[ "${SKIP_BUILD:-}" == "1" ]]; then
  echo "Skipping build and using existing image $IMAGE_NAME"
else
  echo "Building $IMAGE_NAME from web/Dockerfile with env from $ENV_FILE"
  docker build -f web/Dockerfile -t "$IMAGE_NAME" "${build_args[@]}" .
fi

echo "Running $IMAGE_NAME on http://localhost:$HOST_PORT"
exec docker run \
  --rm \
  "${tty_args[@]}" \
  "${network_args[@]}" \
  "${port_args[@]}" \
  --env "HOSTNAME=$CONTAINER_HOSTNAME" \
  --env "PORT=$CONTAINER_PORT" \
  "${env_args[@]}" \
  "$IMAGE_NAME" \
  "$@"
