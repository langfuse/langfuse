#!/usr/bin/env bash
# Guardrails for Cloud/preview WizOS bases: the resolver rejects Alpine and
# incomplete pins, and the Dockerfiles / Cloud workflows stay wired correctly.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
script="${repo_root}/scripts/ci/wizos-base-image.sh"
tmpdir="$(mktemp -d)"

cleanup() {
  rm -rf "${tmpdir}"
}
trap cleanup EXIT

expect_fail() {
  local message="$1"
  shift
  if "$@" >/dev/null 2>"${tmpdir}/err"; then
    echo "expected failure: ${message}" >&2
    cat "${tmpdir}/err" >&2
    exit 1
  fi
}

expect_ok() {
  local message="$1"
  shift
  if ! "$@" >"${tmpdir}/out" 2>"${tmpdir}/err"; then
    echo "expected success: ${message}" >&2
    cat "${tmpdir}/err" >&2
    exit 1
  fi
}

valid_env() {
  export ECR_REGISTRY="123456789012.dkr.ecr.us-east-1.amazonaws.com"
  export WIZOS_ECR_REPOSITORY="wizos/node"
  export WIZOS_NODE_TAG="24"
  export WIZOS_NODE_DIGEST="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  export WIZOS_OS_RELEASE_ID="wizos"
}

cat > "${tmpdir}/wizos-os-release" <<'EOF'
NAME="WizOS"
ID=wizos
VERSION_ID="1"
EOF

cat > "${tmpdir}/alpine-os-release" <<'EOF'
NAME="Alpine Linux"
ID=alpine
VERSION_ID=3.22.0
EOF

valid_env

expect_ok "construct a digest-pinned ECR pull-through ref" \
  "${script}" construct
expected="123456789012.dkr.ecr.us-east-1.amazonaws.com/wizos/node:24@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
got="$(cat "${tmpdir}/out")"
if [[ "${got}" != "${expected}" ]]; then
  echo "construct produced '${got}', expected '${expected}'" >&2
  exit 1
fi

expect_ok "accept WizOS os-release" \
  "${script}" check-os-release-file "${tmpdir}/wizos-os-release"

expect_fail "reject alpine os-release" \
  "${script}" check-os-release-file "${tmpdir}/alpine-os-release"

WIZOS_OS_RELEASE_ID=alpine expect_fail "reject alpine as the expected ID" \
  "${script}" construct

unset WIZOS_NODE_DIGEST
expect_fail "reject a missing digest" \
  "${script}" construct
valid_env

WIZOS_NODE_DIGEST="sha256:deadbeef" expect_fail "reject a short digest" \
  "${script}" construct
valid_env

WIZOS_ECR_REPOSITORY="node" expect_fail "reject a repository outside the wizos/ pull-through prefix" \
  "${script}" construct
valid_env

WIZOS_ECR_REPOSITORY="wizos/node:24" expect_fail "reject a tag embedded in the repository" \
  "${script}" construct
valid_env

ECR_REGISTRY="docker.io" expect_fail "reject a non-ECR registry" \
  "${script}" construct
valid_env

expect_fail "require an image argument for verify-image" \
  "${script}" verify-image

for dockerfile in web/Dockerfile worker/Dockerfile; do
  if ! grep -Fq 'ARG NODE_BASE_IMAGE=node:24-alpine' "${repo_root}/${dockerfile}"; then
    echo "${dockerfile} must default NODE_BASE_IMAGE to node:24-alpine for OSS builds" >&2
    exit 1
  fi
  if ! grep -Fq 'FROM --platform=${TARGETPLATFORM:-linux/amd64} ${NODE_BASE_IMAGE} AS alpine' "${repo_root}/${dockerfile}"; then
    echo "${dockerfile} must FROM NODE_BASE_IMAGE as the alpine stage" >&2
    exit 1
  fi
done

for workflow in .github/workflows/_deploy_ecs_service.yml .github/workflows/preview-build.yml; do
  if ! grep -q 'wizos-node-base' "${repo_root}/${workflow}"; then
    echo "${workflow} must resolve the WizOS Node base via .github/actions/wizos-node-base" >&2
    exit 1
  fi
  if ! grep -q 'NODE_BASE_IMAGE' "${repo_root}/${workflow}"; then
    echo "${workflow} must pass NODE_BASE_IMAGE into docker build" >&2
    exit 1
  fi
  if ! grep -q 'verify-image' "${repo_root}/${workflow}"; then
    echo "${workflow} must verify the built image is WizOS" >&2
    exit 1
  fi
done

oss_leaks="$(grep -n 'NODE_BASE_IMAGE' "${repo_root}/.github/workflows/pipeline.yml" | grep -v 'test-wizos-cloud-base-guardrails\|wizos-base-image' || true)"
if [[ -n "${oss_leaks}" ]]; then
  echo "pipeline.yml must not pass NODE_BASE_IMAGE into OSS release builds" >&2
  echo "${oss_leaks}" >&2
  exit 1
fi

echo "wizos-base-image.sh: ok"
