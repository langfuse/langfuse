#!/usr/bin/env bash
set -euo pipefail
# Resume a stopped preview (subject to the per-engineer slot limit) and take
# over its running slot. Writes exists and allowed to GITHUB_OUTPUT.
# Env: ACTOR, PR_NUMBER, GH_TOKEN, GITHUB_REPOSITORY, GITHUB_OUTPUT.
source "$(dirname "$0")/lib.sh"

stack_name="langfuse-preview-pr-${PR_NUMBER}"
instance_id="$(pf_stack_instance_id "${stack_name}")"

if [ -z "${instance_id}" ]; then
  echo "exists=false" >> "$GITHUB_OUTPUT"
  echo "allowed=true" >> "$GITHUB_OUTPUT"
  exit 0
fi

state="$(aws ec2 describe-instances \
  --instance-ids "${instance_id}" \
  --query "Reservations[0].Instances[0].State.Name" \
  --output text)"

# Per-engineer limit: resuming takes one of the actor's 5 running
# slots (unless this env is already running).
if [ "${state}" != "running" ] && [ "${state}" != "pending" ]; then
  if ! pf_slot_limit_reached "${ACTOR}" "${PR_NUMBER}"; then
    echo "exists=true" >> "$GITHUB_OUTPUT"
    echo "allowed=false" >> "$GITHUB_OUTPUT"
    exit 0
  fi
fi

aws ec2 start-instances --instance-ids "${instance_id}"
aws ec2 wait instance-running --instance-ids "${instance_id}"

# The resumer now owns this env's running slot.
aws ec2 delete-tags --resources "${instance_id}" --tags Key=StoppedAt
aws ec2 create-tags --resources "${instance_id}" \
  --tags "Key=PreviewOwner,Value=${ACTOR}"

echo "exists=true" >> "$GITHUB_OUTPUT"
echo "allowed=true" >> "$GITHUB_OUTPUT"
