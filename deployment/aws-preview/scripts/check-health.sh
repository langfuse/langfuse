#!/usr/bin/env bash
set -euo pipefail
# Poll the preview's public health endpoint until it responds or we give up
# (TLS issuance on first deploy, or container restart on resume, can take a
# minute). Callers pass PREVIEW_HOST directly (deploy); if unset it is derived
# from PR_NUMBER + AWS_PREVIEW_DOMAIN_NAME (resume).

preview_host="${PREVIEW_HOST:-pr-${PR_NUMBER}.${AWS_PREVIEW_DOMAIN_NAME}}"

for _ in $(seq 1 90); do
  if curl -fsS --max-time 10 "https://${preview_host}/api/public/health" >/dev/null; then
    exit 0
  fi
  sleep 5
done

echo "Preview ${preview_host} did not become healthy."
exit 1
