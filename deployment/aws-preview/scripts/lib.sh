#!/usr/bin/env bash
# Shared helpers for the AWS PR preview workflow steps.
#
# Sourced by the per-step scripts in this directory. Every function assumes the
# workflow's AWS_PREVIEW_* environment variables and (where it comments on a PR)
# GH_TOKEN + GITHUB_REPOSITORY are already present in the environment.
#
# These scripts are always executed from a checkout of the default branch, never
# from the pull request head, so the deploy logic here stays reviewed code even
# though the deploy job also checks out PR code to build it.

# Echo the InstanceId output of a preview stack, or an empty string when the
# stack (or the output) is absent. Never fails the caller.
pf_stack_instance_id() {
  local stack_name="$1" id
  id="$(aws cloudformation describe-stacks \
    --stack-name "${stack_name}" \
    --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" \
    --output text 2>/dev/null || true)"
  if [ "${id}" = "None" ]; then
    id=""
  fi
  printf '%s' "${id}"
}

# Echo the PR numbers (one per line) that have a pending/running preview owned
# by <actor> via the PreviewOwner tag. Empty output means none.
pf_owner_running_prs() {
  local actor="$1"
  aws ec2 describe-instances \
    --filters \
      "Name=tag:Project,Values=langfuse-preview" \
      "Name=tag:PreviewOwner,Values=${actor}" \
      "Name=instance-state-name,Values=pending,running" \
    --query "Reservations[].Instances[].[Tags[?Key=='PullRequest'] | [0].Value]" \
    --output text | grep -v '^$' || true
}

# Per-engineer limit (best-effort, concurrent commands can race). If <actor>
# already has >= 5 running previews, post a nudge comment on <pr_number> and
# return 1 so the caller can stop; otherwise return 0.
pf_slot_limit_reached() {
  local actor="$1" pr_number="$2" running count pr_list
  running="$(pf_owner_running_prs "${actor}")"
  count="$(printf '%s' "${running}" | grep -c . || true)"

  if [ "${count}" -ge 5 ]; then
    pr_list="$(printf '%s\n' "${running}" | sed 's/^/#/' | paste -sd ', ' -)"
    gh pr comment "${pr_number}" --repo "${GITHUB_REPOSITORY}" \
      --body "@${actor} you already have ${count} running previews (PRs ${pr_list}). Stop or destroy one first (\`/preview stop\` / \`/preview destroy\`), then retry."
    return 1
  fi
  return 0
}

# Delete every ECR image tagged pr-<pr_number>-* from both preview repositories.
pf_delete_images() {
  local pr_number="$1" repository_url repository_name image_ids
  for repository_url in \
    "${AWS_PREVIEW_WEB_ECR_REPOSITORY_URL}" \
    "${AWS_PREVIEW_WORKER_ECR_REPOSITORY_URL}"; do
    repository_name="${repository_url#*/}"
    image_ids="$(aws ecr list-images \
      --repository-name "${repository_name}" \
      --filter tagStatus=TAGGED \
      --query "imageIds[?starts_with(imageTag, 'pr-${pr_number}-')]" \
      --output json)"

    if [ "${image_ids}" != "[]" ]; then
      aws ecr batch-delete-image \
        --repository-name "${repository_name}" \
        --image-ids "${image_ids}" >/dev/null
      echo "Deleted preview images from ${repository_name}."
    fi
  done
}

# Force-delete the per-PR secret seed (no recovery window). Never fails the
# caller: a missing seed is fine.
pf_delete_seed() {
  local pr_number="$1"
  aws secretsmanager delete-secret \
    --secret-id "langfuse-preview/pr-${pr_number}/seed" \
    --force-delete-without-recovery >/dev/null 2>&1 \
    || echo "No secret seed for PR ${pr_number}."
}
