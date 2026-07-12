#!/usr/bin/env bash
set -euo pipefail
# Fail early with a clear message if any required repository variable is unset.

required_vars=(
  AWS_PREVIEW_CLOUDFORMATION_ROLE_ARN
  AWS_PREVIEW_DOMAIN_NAME
  AWS_PREVIEW_HOSTED_ZONE_ID
  AWS_PREVIEW_INSTANCE_PROFILE_NAME
  AWS_PREVIEW_REGION
  AWS_PREVIEW_ROLE_ARN
  AWS_PREVIEW_SECURITY_GROUP_ID
  AWS_PREVIEW_SUBNET_ID
  AWS_PREVIEW_WEB_ECR_REPOSITORY_URL
  AWS_PREVIEW_WORKER_ECR_REPOSITORY_URL
)

missing=()
for var_name in "${required_vars[@]}"; do
  if [ -z "${!var_name}" ]; then
    missing+=("${var_name}")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  printf 'Missing required GitHub repository variables:\n'
  printf '  - %s\n' "${missing[@]}"
  exit 1
fi
