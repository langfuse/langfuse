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

assert_line() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  if ! grep -Eq "${pattern}" "${file}"; then
    echo "${message}" >&2
    echo "missing pattern: ${pattern}" >&2
    exit 1
  fi
}

for workflow in .github/workflows/_deploy_ecs_service.yml .github/workflows/preview-build.yml; do
  workflow_path="${repo_root}/${workflow}"
  assert_line "${workflow_path}" \
    '^[[:space:]]*uses: \./\.github/actions/wizos-node-base$' \
    "${workflow} must resolve the WizOS Node base via .github/actions/wizos-node-base"
  assert_line "${workflow_path}" \
    '^[[:space:]]*--build-arg NODE_BASE_IMAGE="\$\{NODE_BASE_IMAGE\}"[[:space:]]*\\?[[:space:]]*$' \
    "${workflow} must pass the resolved base into docker build as --build-arg NODE_BASE_IMAGE"
  assert_line "${workflow_path}" \
    '^[[:space:]]*bash scripts/ci/wizos-base-image\.sh verify-image ' \
    "${workflow} must verify the built image with wizos-base-image.sh verify-image"
done

deploy_workflow="${repo_root}/.github/workflows/_deploy_ecs_service.yml"
assert_line "${deploy_workflow}" \
  '^[[:space:]]*if: \$\{?\{ inputs\.service != '"'"'ai-gateway'"'"' \}\}$' \
  "_deploy_ecs_service.yml must skip the WizOS Node base for ai-gateway"
if awk '
  /^      - name: Build, tag, and push AI Gateway image$/ { capture=1 }
  capture && /^      - name: / && !/AI Gateway/ { capture=0 }
  capture { print }
' "${deploy_workflow}" | grep -q 'NODE_BASE_IMAGE'; then
  echo "_deploy_ecs_service.yml ai-gateway build must not take NODE_BASE_IMAGE" >&2
  exit 1
fi

preview_workflow="${repo_root}/.github/workflows/preview-build.yml"
assert_line "${preview_workflow}" \
  'ref: \$\{?\{ github\.event\.pull_request\.head\.sha \}\}$' \
  "preview-build.yml must keep the PR head as the Docker build context"
assert_line "${preview_workflow}" \
  'ref: \$\{?\{ github\.event\.pull_request\.base\.sha \}\}$' \
  "preview-build.yml must read WizOS CI tooling from the base revision"
assert_line "${preview_workflow}" \
  'path: \.wizos-ci-base$' \
  "preview-build.yml must check the base tooling out beside the build context"
assert_line "${preview_workflow}" \
  'rm -rf \.wizos-ci-base$' \
  "preview-build.yml must remove the base tooling checkout before docker build"

stub_root="${tmpdir}/docker-stub"
mkdir -p "${stub_root}/bin" "${stub_root}/state"
cat > "${stub_root}/bin/docker" <<'EOF'
#!/usr/bin/env bash
state="${DOCKER_STUB_DIR}/count"
if [[ "$1" == "pull" ]]; then
  n=0
  [[ -f "${state}" ]] && n="$(cat "${state}")"
  n=$((n + 1))
  echo "${n}" > "${state}"
  if [[ "${n}" -le "${DOCKER_PULL_FAILS:-0}" ]]; then
    echo "transient pull failure" >&2
    exit 1
  fi
  exit 0
fi
if [[ "$1" == "run" ]]; then
  cat "${DOCKER_STUB_OS_RELEASE}"
  exit 0
fi
echo "unexpected docker invocation: $*" >&2
exit 1
EOF
chmod +x "${stub_root}/bin/docker"

export DOCKER_STUB_DIR="${stub_root}/state"
export DOCKER_STUB_OS_RELEASE="${tmpdir}/wizos-os-release"
export PATH="${stub_root}/bin:${PATH}"
export WIZOS_PULL_RETRY_DELAY=0

echo 0 > "${DOCKER_STUB_DIR}/count"
DOCKER_PULL_FAILS=2 WIZOS_PULL_RETRIES=5 \
  expect_ok "retry a transient docker pull" \
  "${script}" pull-base
pulls="$(cat "${DOCKER_STUB_DIR}/count")"
if [[ "${pulls}" != "3" ]]; then
  echo "expected 3 pull attempts after two transient failures, got ${pulls}" >&2
  exit 1
fi

echo 0 > "${DOCKER_STUB_DIR}/count"
DOCKER_PULL_FAILS=9 WIZOS_PULL_RETRIES=2 \
  expect_fail "stop after the configured pull attempts" \
  "${script}" pull-base
pulls="$(cat "${DOCKER_STUB_DIR}/count")"
if [[ "${pulls}" != "2" ]]; then
  echo "expected 2 pull attempts when retries are exhausted, got ${pulls}" >&2
  exit 1
fi
unset DOCKER_PULL_FAILS WIZOS_PULL_RETRIES WIZOS_PULL_RETRY_DELAY
unset DOCKER_STUB_DIR DOCKER_STUB_OS_RELEASE

oss_leaks="$(grep -n 'NODE_BASE_IMAGE' "${repo_root}/.github/workflows/pipeline.yml" | grep -v 'test-wizos-cloud-base-guardrails\|wizos-base-image' || true)"
if [[ -n "${oss_leaks}" ]]; then
  echo "pipeline.yml must not pass NODE_BASE_IMAGE into OSS release builds" >&2
  echo "${oss_leaks}" >&2
  exit 1
fi

echo "wizos-base-image.sh: ok"
