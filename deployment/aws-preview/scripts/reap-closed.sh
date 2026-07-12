#!/usr/bin/env bash
set -euo pipefail
# Destroy previews whose PR is closed. Reconciliation replaces the old
# pull_request:closed teardown: this runs from the default branch, so no
# unreviewed PR workflow code is ever trusted with the preview role.
# Worst-case cleanup latency is one housekeeping interval.
# Env: GH_TOKEN, GITHUB_REPOSITORY + the AWS_PREVIEW_* variables.
source "$(dirname "$0")/lib.sh"

instances="$(aws ec2 describe-instances \
  --filters \
    "Name=tag:Project,Values=langfuse-preview" \
    "Name=instance-state-name,Values=pending,running,stopping,stopped" \
  --query "Reservations[].Instances[].[Tags[?Key=='PullRequest'] | [0].Value, Tags[?Key=='aws:cloudformation:stack-name'] | [0].Value]" \
  --output text)"

if [ -z "${instances}" ]; then
  echo "No preview instances."
else
  while read -r pr_number stack_name; do
    [ -z "${pr_number}" ] || [ "${pr_number}" = "None" ] && continue
    case "${stack_name}" in
      langfuse-preview-pr-*) ;;
      *)
        echo "Skipping unexpected stack name '${stack_name}'."
        continue
        ;;
    esac

    pr_state="$(gh api "repos/${GITHUB_REPOSITORY}/pulls/${pr_number}" --jq .state 2>/dev/null || echo "unknown")"
    if [ "${pr_state}" != "closed" ]; then
      continue
    fi

    echo "Destroying ${stack_name}: PR ${pr_number} is closed."
    # Isolate each teardown in a subshell so one stuck/failed
    # deletion doesn't abort the whole batch under set -e.
    if ! (
      set -e
      aws cloudformation delete-stack --stack-name "${stack_name}"
      aws cloudformation wait stack-delete-complete --stack-name "${stack_name}"
      pf_delete_images "${pr_number}"
      pf_delete_seed "${pr_number}"
    ); then
      echo "Failed to reap ${stack_name}; continuing with the next stack."
      continue
    fi

    gh pr comment "${pr_number}" --repo "${GITHUB_REPOSITORY}" \
      --body "🗑️ AWS preview destroyed because the PR is closed. Reopen and \`/preview deploy\` to recreate." \
      || echo "Could not comment on PR ${pr_number}."
  done <<< "${instances}"
fi
