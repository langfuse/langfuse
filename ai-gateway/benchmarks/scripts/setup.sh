#!/usr/bin/env bash
# Generates benchmark-only secrets and the request payload:
#   .generated/ca.crt, upstream.{crt,key}  TLS for the mock api.openai.com
#   .generated/payload.json                 request body (BENCH_PAYLOAD_BYTES, default 500 KiB)
#   .env                                    service key, encryption key, ES256 JWT key
# Re-running keeps existing secrets and regenerates the payload.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .generated results/otel
chmod 777 results/otel

if [ ! -f .generated/ca.crt ]; then
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -days 3650 \
    -subj "/CN=Langfuse gateway benchmark CA" \
    -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -keyout .generated/ca.key -out .generated/ca.crt 2>/dev/null
  openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes \
    -subj "/CN=api.openai.com" -keyout .generated/upstream.key -out .generated/upstream.csr 2>/dev/null
  printf "subjectAltName=DNS:api.openai.com,DNS:mock-upstream\nbasicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\n" > .generated/upstream.ext
  openssl x509 -req -in .generated/upstream.csr -CA .generated/ca.crt -CAkey .generated/ca.key \
    -CAcreateserial -days 3650 -extfile .generated/upstream.ext -out .generated/upstream.crt 2>/dev/null
  chmod 644 .generated/*
fi

if [ ! -f .env ]; then
  jwt_key="$(openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 2>/dev/null)"
  {
    echo "BENCH_SERVICE_KEY=$(openssl rand -hex 32)"
    echo "BENCH_ENCRYPTION_KEY=$(openssl rand -hex 32)"
    echo "BENCH_JWT_PRIVATE_KEY=\"${jwt_key}\""
  } > .env
fi

python3 payload/generate.py --bytes "${BENCH_PAYLOAD_BYTES:-512000}" --out .generated/payload.json
