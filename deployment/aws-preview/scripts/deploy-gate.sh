#!/usr/bin/env bash
set -euo pipefail
# Decide whether a deploy should proceed. Writes proceed=true|false to
# GITHUB_OUTPUT. Env: PR_NUMBER, ACTOR, REFRESH_ONLY, GH_TOKEN,
# GITHUB_REPOSITORY, GITHUB_OUTPUT.
source "$(dirname "$0")/lib.sh"

stack_name="langfuse-preview-pr-${PR_NUMBER}"
instance_id="$(pf_stack_instance_id "${stack_name}")"
instance_state="absent"
if [ -n "${instance_id}" ]; then
  instance_state="$(aws ec2 describe-instances \
    --instance-ids "${instance_id}" \
    --query "Reservations[0].Instances[0].State.Name" \
    --output text)"
fi

# Re-check PR state at execution time: a deploy queued behind a
# close/reconcile destroy must not recreate the preview stack for
# a PR that is now closed (nothing would ever clean it up again).
pr_state="$(gh api "repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}" --jq .state)"
if [ "${pr_state}" != "open" ]; then
  echo "PR ${PR_NUMBER} is ${pr_state}; not deploying."
  echo "proceed=false" >> "$GITHUB_OUTPUT"
  exit 0
fi

# Push-triggered auto-deploy (refresh_only) may only refresh a preview
# that is already running — it must never create or resurrect one.
# This keeps /preview stop sticky and matches the documented contract
# ("pushing refreshes only if already deployed and running"). Opening
# a PR and explicit /preview deploy leave refresh_only unset/false.
if [ "${REFRESH_ONLY:-}" = "true" ] \
  && [ "${instance_state}" != "running" ] \
  && [ "${instance_state}" != "pending" ]; then
  echo "PR ${PR_NUMBER} preview is ${instance_state}; push refresh skipped."
  echo "proceed=false" >> "$GITHUB_OUTPUT"
  exit 0
fi

# Refreshing an already-running env does not consume a new slot.
if [ "${instance_state}" = "running" ] || [ "${instance_state}" = "pending" ]; then
  echo "proceed=true" >> "$GITHUB_OUTPUT"
  exit 0
fi

# Per-engineer limit: at most 5 running envs, attributed by the PreviewOwner tag.
if ! pf_slot_limit_reached "${ACTOR}" "${PR_NUMBER}"; then
  echo "proceed=false" >> "$GITHUB_OUTPUT"
  exit 0
fi

echo "proceed=true" >> "$GITHUB_OUTPUT"
