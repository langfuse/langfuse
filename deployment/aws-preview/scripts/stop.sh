#!/usr/bin/env bash
set -euo pipefail
# Stop the preview instance and stamp StoppedAt for the 7-day reaper.
# Writes exists=true|false to GITHUB_OUTPUT. Env: PR_NUMBER, GITHUB_OUTPUT.
source "$(dirname "$0")/lib.sh"

stack_name="langfuse-preview-pr-${PR_NUMBER}"
instance_id="$(pf_stack_instance_id "${stack_name}")"

if [ -z "${instance_id}" ]; then
  echo "exists=false" >> "$GITHUB_OUTPUT"
  exit 0
fi

aws ec2 stop-instances --instance-ids "${instance_id}"
aws ec2 wait instance-stopped --instance-ids "${instance_id}"
# The reaper destroys envs stopped for more than 7 days.
aws ec2 create-tags --resources "${instance_id}" \
  --tags "Key=StoppedAt,Value=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "exists=true" >> "$GITHUB_OUTPUT"
