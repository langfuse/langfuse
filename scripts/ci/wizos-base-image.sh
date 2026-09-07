#!/usr/bin/env bash
# Resolve and verify the WizOS Node base used for Langfuse Cloud and PR-preview
# image builds. OSS release builds must not call this script: they keep the
# Dockerfile default (node:24-alpine) and need no private registry.
#
# Required environment:
#   ECR_REGISTRY            Account ECR host from amazon-ecr-login (construct/pull-base)
#   WIZOS_ECR_REPOSITORY    Pull-through repository path, must start with wizos/
#   WIZOS_NODE_TAG          Upstream tag (no digest, no slash)
#   WIZOS_NODE_DIGEST       sha256:<64 lowercase hex>
#   WIZOS_OS_RELEASE_ID     /etc/os-release ID of the WizOS image (not alpine)
#
# Commands:
#   construct                         Print the digest-pinned Node base ref
#   pull-base                         Pull that ref and check its os-release
#   verify-image <image>              Check a built image's os-release
#   check-os-release-file <file>      Check a local os-release fixture

set -euo pipefail

usage() {
  echo "Usage: $0 construct|pull-base|verify-image <image>|check-os-release-file <file>" >&2
  exit 2
}

is_blank() {
  [[ -z "${1:-}" || "${1}" =~ ^[[:space:]]*$ ]]
}

require_env() {
  local name="$1"
  if is_blank "${!name:-}"; then
    echo "::error::${name} is required for Cloud/preview image builds. Set the GitHub Actions variable and retry. Alpine fallback is not allowed." >&2
    exit 1
  fi
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "${value}"
}

os_release_id() {
  local file="$1"
  awk -F= '
    /^ID=/ {
      value=$2
      gsub(/\r/, "", value)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      gsub(/^"/, "", value)
      gsub(/"$/, "", value)
      print value
      exit
    }
  ' "${file}"
}

check_os_release_file() {
  local file="$1"
  local expected
  expected="$(trim "${WIZOS_OS_RELEASE_ID:-}")"
  if is_blank "${expected}"; then
    echo "::error::WIZOS_OS_RELEASE_ID is required for Cloud/preview image builds. Alpine fallback is not allowed." >&2
    exit 1
  fi
  if [[ "${expected}" == "alpine" ]]; then
    echo "::error::WIZOS_OS_RELEASE_ID cannot be alpine." >&2
    exit 1
  fi
  if [[ ! -f "${file}" ]]; then
    echo "::error::os-release file not found: ${file}" >&2
    exit 1
  fi

  local actual
  actual="$(os_release_id "${file}")"
  if is_blank "${actual}"; then
    echo "::error::Could not parse ID= from ${file}" >&2
    exit 1
  fi
  if [[ "${actual}" == "alpine" ]]; then
    echo "::error::Image OS ID is alpine; Cloud/preview images must be built from WizOS." >&2
    exit 1
  fi
  if [[ "${actual}" != "${expected}" ]]; then
    echo "::error::Image OS ID is '${actual}', expected '${expected}'." >&2
    exit 1
  fi
}

construct_node_base_image() {
  require_env ECR_REGISTRY
  require_env WIZOS_ECR_REPOSITORY
  require_env WIZOS_NODE_TAG
  require_env WIZOS_NODE_DIGEST
  require_env WIZOS_OS_RELEASE_ID

  local registry repository tag digest os_id
  registry="$(trim "${ECR_REGISTRY}")"
  repository="$(trim "${WIZOS_ECR_REPOSITORY}")"
  tag="$(trim "${WIZOS_NODE_TAG}")"
  digest="$(trim "${WIZOS_NODE_DIGEST}")"
  os_id="$(trim "${WIZOS_OS_RELEASE_ID}")"

  if [[ ! "${registry}" =~ ^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com$ ]]; then
    echo "::error::ECR_REGISTRY must be an AWS ECR registry host (<account>.dkr.ecr.<region>.amazonaws.com)." >&2
    exit 1
  fi
  if [[ "${repository}" != wizos/* || "${repository}" == *:* || "${repository}" == *@* ]]; then
    echo "::error::WIZOS_ECR_REPOSITORY must be a pull-through path starting with wizos/ and must not include a tag or digest." >&2
    exit 1
  fi
  if [[ "${tag}" == *:* || "${tag}" == *@* || "${tag}" == */* ]]; then
    echo "::error::WIZOS_NODE_TAG must be a single tag, not a repository path or digest." >&2
    exit 1
  fi
  if [[ ! "${digest}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
    echo "::error::WIZOS_NODE_DIGEST must be sha256: followed by 64 lowercase hex characters." >&2
    exit 1
  fi
  if [[ "${os_id}" == "alpine" ]]; then
    echo "::error::WIZOS_OS_RELEASE_ID cannot be alpine." >&2
    exit 1
  fi

  printf '%s/%s:%s@%s\n' "${registry}" "${repository}" "${tag}" "${digest}"
}

read_os_release_from_image() {
  local image="$1"
  docker run --rm --user 0 --entrypoint cat "${image}" /etc/os-release
}

cmd="${1:-}"
case "${cmd}" in
  construct)
    construct_node_base_image
    ;;
  pull-base)
    image="$(construct_node_base_image)"
    echo "Pulling WizOS Node base ${image}" >&2
    docker pull "${image}" >&2
    tmp="$(mktemp)"
    read_os_release_from_image "${image}" > "${tmp}"
    check_os_release_file "${tmp}"
    rm -f "${tmp}"
    echo "WizOS Node base verified (ID=$(trim "${WIZOS_OS_RELEASE_ID}"))" >&2
    printf '%s\n' "${image}"
    ;;
  verify-image)
    image="${2:-}"
    if is_blank "${image}"; then
      usage
    fi
    require_env WIZOS_OS_RELEASE_ID
    tmp="$(mktemp)"
    read_os_release_from_image "${image}" > "${tmp}"
    check_os_release_file "${tmp}"
    rm -f "${tmp}"
    echo "Built image ${image} is WizOS (ID=$(trim "${WIZOS_OS_RELEASE_ID}"))"
    ;;
  check-os-release-file)
    file="${2:-}"
    if is_blank "${file}"; then
      usage
    fi
    check_os_release_file "${file}"
    echo "os-release check passed (ID=$(trim "${WIZOS_OS_RELEASE_ID}"))"
    ;;
  *)
    usage
    ;;
esac
