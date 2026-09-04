#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
validator="${repo_root}/scripts/validate-release-tag-branch.sh"
tmpdir="$(mktemp -d)"
test_repo="${tmpdir}/repo"

cleanup() {
  rm -rf "${tmpdir}"
}
trap cleanup EXIT

git init --quiet --initial-branch=main "${test_repo}"
git -C "${test_repo}" config user.email "release-test@langfuse.com"
git -C "${test_repo}" config user.name "Release Test"

touch "${test_repo}/fixture"
git -C "${test_repo}" add fixture
git -C "${test_repo}" commit --quiet -m "initial"
git -C "${test_repo}" branch v3

printf 'main\n' > "${test_repo}/fixture"
git -C "${test_repo}" commit --quiet -am "main-only"
main_commit="$(git -C "${test_repo}" rev-parse HEAD)"

git -C "${test_repo}" switch --quiet v3
printf 'v3\n' > "${test_repo}/fixture"
git -C "${test_repo}" commit --quiet -am "v3-only"
v3_commit="$(git -C "${test_repo}" rev-parse HEAD)"
git -C "${test_repo}" update-ref refs/remotes/origin/v3 "${v3_commit}"

assert_passes() {
  local tag="$1"
  local commit="$2"
  local output

  if ! output="$(cd "${test_repo}" && bash "${validator}" "${tag}" "${commit}" "origin/v3" 2>&1)"; then
    echo "Expected ${tag} at ${commit} to pass, but it failed:"
    echo "${output}"
    exit 1
  fi
}

assert_fails() {
  local tag="$1"
  local commit="$2"
  local output

  if output="$(cd "${test_repo}" && bash "${validator}" "${tag}" "${commit}" "origin/v3" 2>&1)"; then
    echo "Expected ${tag} at ${commit} to fail, but it passed."
    exit 1
  fi

  if [[ "${output}" != *"Refusing to publish"* ]]; then
    echo "Expected a refusal message, got:"
    echo "${output}"
    exit 1
  fi
}

for tag in v3 v3.225 v3.225.6 v3.225.6-rc.1; do
  assert_passes "${tag}" "${v3_commit}"
done

assert_fails "v3.225.6" "${main_commit}"
assert_passes "v4.27.0" "${main_commit}"
assert_passes "v30.1.0" "${main_commit}"

echo "Release tag branch validation tests passed."
