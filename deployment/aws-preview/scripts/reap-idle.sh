#!/usr/bin/env bash
set -euo pipefail
# Stop previews with no CPU activity above the threshold over the idle window.
# Env: GH_TOKEN, GITHUB_REPOSITORY, AWS_PREVIEW_IDLE_HOURS, AWS_PREVIEW_IDLE_CPU_MAX.

start_time="$(date -u -d "${AWS_PREVIEW_IDLE_HOURS} hours ago" +%Y-%m-%dT%H:%M:%SZ)"
end_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cutoff_epoch="$(( $(date -u +%s) - AWS_PREVIEW_IDLE_HOURS * 3600 ))"

instances="$(aws ec2 describe-instances \
  --filters \
    "Name=tag:Project,Values=langfuse-preview" \
    "Name=instance-state-name,Values=running" \
  --query "Reservations[].Instances[].[InstanceId, LaunchTime, Tags[?Key=='PullRequest'] | [0].Value]" \
  --output text)"

if [ -z "${instances}" ]; then
  echo "No running preview instances."
  exit 0
fi

stopped_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
while read -r instance_id launch_time pr_number; do
  [ -z "${instance_id}" ] && continue

  # Grace period: instances started less than the idle window ago
  # are left alone (LaunchTime resets on every start).
  launch_epoch="$(date -u -d "${launch_time}" +%s 2>/dev/null || echo 0)"
  if [ "${launch_epoch}" -eq 0 ] || [ "${launch_epoch}" -gt "${cutoff_epoch}" ]; then
    continue
  fi

  # Idle = no 5-minute window above the CPU threshold. Real usage
  # (UI clicks, SDK ingestion) spikes CPU well above the stack's
  # baseline of background polling and merges.
  max_cpu="$(aws cloudwatch get-metric-statistics \
    --namespace AWS/EC2 \
    --metric-name CPUUtilization \
    --dimensions "Name=InstanceId,Value=${instance_id}" \
    --start-time "${start_time}" \
    --end-time "${end_time}" \
    --period 300 \
    --statistics Maximum \
    --query "max(Datapoints[].Maximum)" \
    --output text)"

  # No datapoints means no evidence; never stop without evidence.
  if [ -z "${max_cpu}" ] || [ "${max_cpu}" = "None" ]; then
    continue
  fi

  if awk -v cpu="${max_cpu}" -v limit="${AWS_PREVIEW_IDLE_CPU_MAX}" 'BEGIN { exit !(cpu < limit) }'; then
    echo "Stopping ${instance_id} (PR ${pr_number}): max CPU ${max_cpu}% over ${AWS_PREVIEW_IDLE_HOURS}h"
    aws ec2 stop-instances --instance-ids "${instance_id}"
    aws ec2 create-tags --resources "${instance_id}" \
      --tags "Key=StoppedAt,Value=${stopped_at}"

    if [ -n "${pr_number}" ] && [ "${pr_number}" != "None" ]; then
      gh pr comment "${pr_number}" --repo "${GITHUB_REPOSITORY}" \
        --body "⏸️ AWS preview stopped after ~${AWS_PREVIEW_IDLE_HOURS}h without activity. Data and URL are kept; resume with \`/preview resume\`." \
        || echo "Could not comment on PR ${pr_number}."
    fi
  fi
done <<< "${instances}"
