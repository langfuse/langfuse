#!/usr/bin/env bash
set -euo pipefail
# Manual account-wide op: stop every running preview and stamp StoppedAt.
# Env: GH_TOKEN, GITHUB_REPOSITORY.

instances="$(aws ec2 describe-instances \
  --filters \
    "Name=tag:Project,Values=langfuse-preview" \
    "Name=instance-state-name,Values=running" \
  --query "Reservations[].Instances[].[InstanceId, Tags[?Key=='PullRequest'] | [0].Value]" \
  --output text)"

if [ -z "${instances}" ]; then
  echo "No running preview instances."
  exit 0
fi

stopped_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
while read -r instance_id pr_number; do
  [ -z "${instance_id}" ] && continue
  echo "Stopping ${instance_id} (PR ${pr_number})"
  aws ec2 stop-instances --instance-ids "${instance_id}"
  aws ec2 create-tags --resources "${instance_id}" \
    --tags "Key=StoppedAt,Value=${stopped_at}"

  if [ -n "${pr_number}" ] && [ "${pr_number}" != "None" ]; then
    gh pr comment "${pr_number}" --repo "${GITHUB_REPOSITORY}" \
      --body "⏸️ AWS preview stopped by a manual stop-all. Resume with \`/preview resume\`." \
      || echo "Could not comment on PR ${pr_number}."
  fi
done <<< "${instances}"
