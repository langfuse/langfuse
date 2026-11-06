#!/usr/bin/env bash
# Read-only: is this Langfuse instance worth driving?
set -euo pipefail

web_url="${LANGFUSE_WEB_URL:-http://127.0.0.1:3000}"
worker_url="${LANGFUSE_WORKER_URL:-http://127.0.0.1:3030}"
web_url="${web_url%/}"
worker_url="${worker_url%/}"

fail=0

echo "web_url=$web_url"
echo "worker_url=$worker_url"

web_body="$(curl --silent --show-error --max-time 15 \
  "$web_url/api/public/health" || true)"
echo "web_health_body=$web_body"
if printf '%s' "$web_body" | python3 -c 'import json,sys
try:
    data=json.load(sys.stdin)
except Exception:
    sys.exit(1)
sys.exit(0 if data.get("status")=="OK" else 1)'; then
  echo "web_health=OK"
else
  echo "web_health=FAIL"
  fail=1
fi

worker_body="$(curl --silent --show-error --max-time 15 \
  "$worker_url/api/health" || true)"
echo "worker_health_body=$worker_body"
if printf '%s' "$worker_body" | python3 -c 'import json,sys
try:
    data=json.load(sys.stdin)
except Exception:
    sys.exit(1)
sys.exit(0 if data.get("status")=="ok" else 1)'; then
  echo "worker_health=OK"
else
  echo "worker_health=FAIL"
  fail=1
fi

sign_in_code="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --max-time 20 "$web_url/auth/sign-in" || echo 000)"
echo "sign_in_http=$sign_in_code"
if [ "$sign_in_code" = "200" ]; then
  echo "sign_in=OK"
else
  echo "sign_in=FAIL"
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "doctor=FAIL"
  exit 1
fi

echo "doctor=OK"
