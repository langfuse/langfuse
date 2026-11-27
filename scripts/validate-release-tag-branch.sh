#!/usr/bin/env bash

set -euo pipefail

release_tag="${1:?Usage: validate-release-tag-branch.sh <tag> <release-ref> <maintenance-branch-ref>}"
release_ref="${2:?Usage: validate-release-tag-branch.sh <tag> <release-ref> <maintenance-branch-ref>}"
maintenance_branch_ref="${3:?Usage: validate-release-tag-branch.sh <tag> <release-ref> <maintenance-branch-ref>}"
maintenance_line="${maintenance_branch_ref##*/}"

if [[ "${release_tag}" != "${maintenance_line}" && "${release_tag}" != "${maintenance_line}."* ]]; then
  echo "Tag ${release_tag} does not target maintenance line ${maintenance_line}; no branch check needed."
  exit 0
fi

release_commit="$(git rev-parse --verify "${release_ref}^{commit}")"
maintenance_branch_commit="$(git rev-parse --verify "${maintenance_branch_ref}^{commit}")"

if git merge-base --is-ancestor "${release_commit}" "${maintenance_branch_commit}"; then
  echo "Tag ${release_tag} points to a commit on ${maintenance_branch_ref}."
  exit 0
else
  status="$?"
fi

if [[ "${status}" -ne 1 ]]; then
  echo "::error::Unable to compare ${release_ref} with ${maintenance_branch_ref}."
  exit "${status}"
fi

echo "::error::Tag ${release_tag} points to ${release_commit}, which is not on ${maintenance_branch_ref}. Refusing to publish maintenance-line Docker tags."
exit 1
