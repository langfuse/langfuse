#!/usr/bin/env bash
set -euo pipefail
# Delete the per-PR stack, then its ECR images and secret seed (both run
# whether or not the stack existed, matching the original separate steps).
# Writes existed=true|false to GITHUB_OUTPUT. Env: PR_NUMBER, GITHUB_OUTPUT.
source "$(dirname "$0")/lib.sh"

stack_name="langfuse-preview-pr-${PR_NUMBER}"

if aws cloudformation describe-stacks --stack-name "${stack_name}" >/dev/null 2>&1; then
  aws cloudformation delete-stack --stack-name "${stack_name}"
  aws cloudformation wait stack-delete-complete --stack-name "${stack_name}"
  echo "existed=true" >> "$GITHUB_OUTPUT"
else
  echo "Preview stack ${stack_name} does not exist."
  echo "existed=false" >> "$GITHUB_OUTPUT"
fi

pf_delete_images "${PR_NUMBER}"
pf_delete_seed "${PR_NUMBER}"
