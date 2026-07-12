#!/usr/bin/env bash
set -euo pipefail
# Read the stack's instance/EIP outputs, boot the instance if it is stopped
# (an explicit /preview deploy resumes a stopped preview), clear the StoppedAt
# reaper tag, and write instance_id/public_ip to GITHUB_OUTPUT.
# Env: STACK_NAME, GITHUB_OUTPUT.

instance_id="$(aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" \
  --output text)"
public_ip="$(aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='PublicIp'].OutputValue" \
  --output text)"

# An explicit /preview deploy on a stopped preview boots it again.
state="$(aws ec2 describe-instances \
  --instance-ids "${instance_id}" \
  --query "Reservations[0].Instances[0].State.Name" \
  --output text)"
if [ "${state}" = "stopping" ]; then
  aws ec2 wait instance-stopped --instance-ids "${instance_id}"
  state="stopped"
fi
if [ "${state}" != "running" ] && [ "${state}" != "pending" ]; then
  aws ec2 start-instances --instance-ids "${instance_id}"
fi
aws ec2 wait instance-running --instance-ids "${instance_id}"

# A deployed env is running again; it is no longer reapable.
aws ec2 delete-tags --resources "${instance_id}" --tags Key=StoppedAt

echo "instance_id=${instance_id}" >> "$GITHUB_OUTPUT"
echo "public_ip=${public_ip}" >> "$GITHUB_OUTPUT"
