#!/usr/bin/env bash
set -euo pipefail
# Deploy (or update) the per-PR CloudFormation stack via the scoped preview
# service role, using the PR's own template. Runs with the PR head as the
# working directory so deployment/aws-preview/cloudformation.yaml is the PR's.
# Env: ACTOR, PR_NUMBER, STACK_NAME + the AWS_PREVIEW_* variables.

# A stack stuck in a failed create state cannot be updated;
# delete it and start fresh.
status="$(aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --query "Stacks[0].StackStatus" \
  --output text 2>/dev/null || true)"
case "${status}" in
  ROLLBACK_COMPLETE|ROLLBACK_FAILED|CREATE_FAILED)
    echo "Stack is in ${status}; deleting before redeploy."
    aws cloudformation delete-stack --stack-name "${STACK_NAME}"
    aws cloudformation wait stack-delete-complete --stack-name "${STACK_NAME}"
    ;;
esac

overrides=(
  PreviewName="${STACK_NAME}"
  PullRequestNumber="${PR_NUMBER}"
  SubnetId="${AWS_PREVIEW_SUBNET_ID}"
  SecurityGroupId="${AWS_PREVIEW_SECURITY_GROUP_ID}"
  InstanceProfileName="${AWS_PREVIEW_INSTANCE_PROFILE_NAME}"
  HostedZoneId="${AWS_PREVIEW_HOSTED_ZONE_ID}"
  DomainName="${AWS_PREVIEW_DOMAIN_NAME}"
  InstanceType="${AWS_PREVIEW_INSTANCE_TYPE}"
  VolumeSizeGb="${AWS_PREVIEW_VOLUME_SIZE_GB}"
)
# Push-triggered refreshes have no actor and keep the previous
# owner (omitted parameters retain their value on stack updates).
if [ -n "${ACTOR}" ]; then
  overrides+=(PreviewOwner="${ACTOR}")
fi

aws cloudformation deploy \
  --stack-name "${STACK_NAME}" \
  --template-file deployment/aws-preview/cloudformation.yaml \
  --role-arn "${AWS_PREVIEW_CLOUDFORMATION_ROLE_ARN}" \
  --no-fail-on-empty-changeset \
  --parameter-overrides "${overrides[@]}" \
  --tags \
    Project=langfuse-preview \
    PullRequest="${PR_NUMBER}" \
    PreviewManagedBy=github-actions
