#!/usr/bin/env bash
# Runs the web or worker test suites with OpenSSL's FIPS provider active, so a
# code path that needs an algorithm a FIPS host refuses (md5, ...) fails here
# with ERR_OSSL_EVP_UNSUPPORTED instead of in a customer deployment.
#
# Runs inside the UBI toolchain stage of worker/Dockerfile: Red Hat's Node links
# the system OpenSSL, and OPENSSL_FORCE_FIPS_MODE=1 switches it into FIPS mode
# without a FIPS host kernel. The databases, migrations and env files must
# already be set up on the host, as the tests-fips CI job does.
#
# Local run, from the repo root with the dev containers up and migrated:
#   docker buildx build --load --target toolchain -f worker/Dockerfile -t langfuse-fips-toolchain .
#   docker run --rm --network host -e OPENSSL_FORCE_FIPS_MODE=1 -v "$PWD:/src:ro" \
#     langfuse-fips-toolchain bash /src/scripts/ci/fips-tests.sh worker [vitest filters...]

set -euo pipefail

readonly SUITE="${1:?usage: fips-tests.sh web|worker [vitest filters...]}"
shift
readonly SRC_DIR="${FIPS_SOURCE_DIR:-/src}"
readonly WORK_DIR="/work"

export HUSKY=0 TURBO_TELEMETRY_DISABLED=1

group() { echo "::group::$*"; }
endgroup() { echo "::endgroup::"; }

if ! node -e 'process.exit(require("node:crypto").getFips() === 1 ? 0 : 1)'; then
  echo "The OpenSSL FIPS provider is not active; run with OPENSSL_FORCE_FIPS_MODE=1." >&2
  exit 1
fi

# Build on a private copy: the host's node_modules and build outputs were made
# for the host, not for UBI. Env files written by the host come along.
group "Copy sources"
mkdir -p "$WORK_DIR"
tar -C "$SRC_DIR" --exclude=.git --exclude=node_modules --exclude=.next \
  --exclude=.turbo --exclude=dist --exclude=target -cf - . | tar -C "$WORK_DIR" -xf -
cd "$WORK_DIR"
endgroup

group "Install dependencies"
pnpm install --frozen-lockfile ${PNPM_STORE_DIR:+--store-dir "$PNPM_STORE_DIR"}
pnpm --filter=shared run db:generate
endgroup

wait_for_health() {
  local url="$1" pid="$2"
  for _ in $(seq 1 150); do
    if curl --silent --fail --output /dev/null "$url"; then
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "Langfuse exited before $url became healthy:" >&2
      tail -n 100 /tmp/langfuse-start.log >&2
      return 1
    fi
    sleep 2
  done
  echo "Timed out waiting for $url:" >&2
  tail -n 100 /tmp/langfuse-start.log >&2
  return 1
}

case "$SUITE" in
  worker)
    group "Build worker"
    pnpm --filter=worker... run build
    endgroup

    NODE_ENV="test" pnpm --filter @langfuse/shared run test --passWithNoTests "$@"
    pnpm --filter=worker run test:exclude-llm-connections --passWithNoTests "$@"
    ;;

  web)
    # Mirrors tests-web: compile once, finalize for the runtime env, then run
    # web and worker so the server tests can call them.
    export NODE_ENV=test
    group "Build web and worker"
    NEXT_DISABLE_BUILD_CACHE=true NODE_OPTIONS=--max_old_space_size=8192 \
      NEXT_IGNORE_BUILD_ERRORS=true pnpm turbo run build:test
    cp .env.runtime .env
    NEXT_DISABLE_BUILD_CACHE=true NODE_OPTIONS=--max_old_space_size=8192 \
      NEXT_IGNORE_BUILD_ERRORS=true \
      pnpm --filter web exec dotenv -e ../.env -- next build --experimental-build-mode generate
    pnpm --filter web run build:otel-worker
    endgroup

    group "Start Langfuse"
    # Docker sets HOSTNAME to the container's host name, and the worker binds
    # to HOSTNAME; bind all interfaces so localhost reaches it.
    HOSTNAME="0.0.0.0" \
      LANGFUSE_INIT_ORG_ID="seed-org-id" \
      LANGFUSE_INIT_ORG_NAME="Seed Org" \
      LANGFUSE_INIT_ORG_CLOUD_PLAN="Team" \
      LANGFUSE_INIT_PROJECT_ID="7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" \
      LANGFUSE_INIT_PROJECT_NAME="Seed Project" \
      LANGFUSE_INIT_PROJECT_PUBLIC_KEY="pk-lf-1234567890" \
      LANGFUSE_INIT_PROJECT_SECRET_KEY="sk-lf-1234567890" \
      LANGFUSE_INIT_USER_EMAIL="demo@langfuse.com" \
      LANGFUSE_INIT_USER_NAME="Demo User" \
      LANGFUSE_INIT_USER_PASSWORD="password" \
      pnpm run start > /tmp/langfuse-start.log 2>&1 &
    start_pid=$!
    wait_for_health http://localhost:3000/api/public/health "$start_pid"
    wait_for_health http://localhost:3030/api/health "$start_pid"
    endgroup

    cd web
    NODE_COMPILE_CACHE=/tmp/node-compile-cache npx dotenv -e ../.env.test -e ../.env -- \
      vitest run --project server --project server-isolated \
      --project server-shared-source --project server-unit \
      --project server-shared-source-unit \
      --maxWorkers="${VITEST_MAX_WORKERS:-8}" --passWithNoTests "$@"
    ;;

  *)
    echo "Unknown suite: $SUITE (expected web or worker)" >&2
    exit 1
    ;;
esac
