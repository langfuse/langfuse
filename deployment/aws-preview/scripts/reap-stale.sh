#!/usr/bin/env bash
set -euo pipefail
# Destroy previews stopped for more than 7 days.
# Env: GH_TOKEN, GITHUB_REPOSITORY + the AWS_PREVIEW_* variables.
source "$(dirname "$0")/lib.sh"

cutoff="$(date -u -d '7 days ago' +%s)"

instances="$(aws ec2 describe-instances \
  --filters \
    "Name=tag:Project,Values=langfuse-preview" \
    "Name=instance-state-name,Values=stopped" \
    "Name=tag-key,Values=StoppedAt" \
  --query "Reservations[].Instances[].[InstanceId, Tags[?Key=='StoppedAt'] | [0].Value, Tags[?Key=='PullRequest'] | [0].Value, Tags[?Key=='aws:cloudformation:stack-name'] | [0].Value]" \
  --output text)"

if [ -z "${instances}" ]; then
  echo "No stopped previews with a StoppedAt tag."
  exit 0
fi

while read -r instance_id stopped_at pr_number stack_name; do
  [ -z "${instance_id}" ] && continue

  stopped_epoch="$(date -u -d "${stopped_at}" +%s 2>/dev/null || echo 0)"
  if [ "${stopped_epoch}" -eq 0 ]; then
    echo "Skipping ${instance_id}: unparseable StoppedAt '${stopped_at}'."
    continue
  fi
  if [ "${stopped_epoch}" -gt "${cutoff}" ]; then
    continue
  fi
  case "${stack_name}" in
    langfuse-preview-pr-*) ;;
    *)
      echo "Skipping ${instance_id}: unexpected stack name '${stack_name}'."
      continue
      ;;
  esac

  echo "Reaping ${stack_name} (stopped since ${stopped_at})"
  # Isolate each teardown in a subshell so one stuck/failed deletion
  # doesn't abort the whole batch under set -e.
  if ! (
    set -e
    aws cloudformation delete-stack --stack-name "${stack_name}"
    aws cloudformation wait stack-delete-complete --stack-name "${stack_name}"

    if [ -n "${pr_number}" ] && [ "${pr_number}" != "None" ]; then
      pf_delete_images "${pr_number}"
    fi

    pf_delete_seed "${pr_number}"
  ); then
    echo "Failed to reap ${stack_name}; continuing with the next stack."
    continue
  fi

  if [ -n "${pr_number}" ] && [ "${pr_number}" != "None" ]; then
    gh pr comment "${pr_number}" --repo "${GITHUB_REPOSITORY}" \
      --body "🗑️ AWS preview destroyed after 7 days stopped. Recreate with \`/preview deploy\`." \
      || echo "Could not comment on PR ${pr_number}."
  fi
done <<< "${instances}"
