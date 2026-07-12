#!/usr/bin/env bash
set -euo pipefail
# Wait until the instance is registered and Online in SSM. Env: INSTANCE_ID.

for _ in $(seq 1 60); do
  ping_status="$(aws ssm describe-instance-information \
    --filters "Key=InstanceIds,Values=${INSTANCE_ID}" \
    --query "InstanceInformationList[0].PingStatus" \
    --output text 2>/dev/null || true)"

  if [ "${ping_status}" = "Online" ]; then
    exit 0
  fi

  sleep 5
done

echo "Instance ${INSTANCE_ID} did not become available in SSM."
exit 1
