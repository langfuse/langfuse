#!/usr/bin/env bash
set -euo pipefail
# Build and push the preview web + worker images. Runs with the PR head as the
# working directory (the Docker build context). Env: COMMIT_SHA, WEB_IMAGE,
# WORKER_IMAGE.

docker build \
  --build-arg NEXT_PUBLIC_BUILD_ID="${COMMIT_SHA}" \
  --build-arg NEXT_PUBLIC_SIGN_UP_DISABLED=true \
  -f ./web/Dockerfile \
  -t "${WEB_IMAGE}" \
  .
docker push "${WEB_IMAGE}"

docker build \
  --build-arg NEXT_PUBLIC_BUILD_ID="${COMMIT_SHA}" \
  -f ./worker/Dockerfile \
  -t "${WORKER_IMAGE}" \
  .
docker push "${WORKER_IMAGE}"
