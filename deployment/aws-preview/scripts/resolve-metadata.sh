#!/usr/bin/env bash
set -euo pipefail
# Resolve stack name, image tags, preview host, and the per-PR secrets, then
# write them to GITHUB_OUTPUT (masking the secret values). Runs with the PR
# head checked out as the working directory, so `git rev-parse HEAD` is the PR
# commit being built. Env: PR_NUMBER + the AWS_PREVIEW_* variables.

pr_number="${PR_NUMBER}"
commit_sha="$(git rev-parse HEAD)"
short_sha="${commit_sha:0:12}"
stack_name="langfuse-preview-pr-${pr_number}"
image_tag="pr-${pr_number}-${short_sha}"
preview_host="pr-${pr_number}.${AWS_PREVIEW_DOMAIN_NAME}"
ecr_registry="${AWS_PREVIEW_WEB_ECR_REPOSITORY_URL%%/*}"

# Per-preview secret root. Every preview secret below is HMAC-derived
# from this random seed, so none is computable from this public repo
# (a plain sha256 of "<name>-<pr>" was). The seed is generated once on
# first deploy and persisted in AWS Secrets Manager, then reused on
# every redeploy and stop/resume so the derived secrets stay stable:
# Postgres and ClickHouse bake their password into the data volume at
# first init, so a changed secret against a surviving volume would lock
# the stack out of its own database.
seed_name="langfuse-preview/pr-${pr_number}/seed"
if seed="$(aws secretsmanager get-secret-value --secret-id "${seed_name}" \
  --query "SecretString" --output text 2>/tmp/seed_err)"; then
  echo "Reusing existing secret seed for PR ${pr_number}."
elif grep -q "ResourceNotFoundException" /tmp/seed_err; then
  echo "Generating a new secret seed for PR ${pr_number}."
  seed="$(openssl rand -hex 32)"
  # create-secret fails if a concurrent deploy already created the
  # seed; re-read the winner instead of clobbering it.
  if ! aws secretsmanager create-secret --name "${seed_name}" \
    --secret-string "${seed}" 2>/tmp/seed_put_err; then
    if grep -q "ResourceExistsException" /tmp/seed_put_err; then
      seed="$(aws secretsmanager get-secret-value --secret-id "${seed_name}" \
        --query "SecretString" --output text)"
    else
      cat /tmp/seed_put_err >&2
      exit 1
    fi
  fi
else
  # Fail closed: an unreadable (but not absent) seed must never fall
  # through to regeneration — new secrets against a surviving volume
  # would brick the preview. Throttling/permission/KMS errors land here.
  echo "Secret seed for PR ${pr_number} is unreadable and not absent; refusing to regenerate." >&2
  cat /tmp/seed_err >&2
  exit 1
fi
echo "::add-mask::${seed}"

# HMAC-SHA256(seed, label) -> 64 hex chars: exactly the ENCRYPTION_KEY
# format (256-bit hex, per `openssl rand -hex 32`), and hex keeps
# connection strings free of URL/shell-special characters.
derive() {
  printf '%s' "$1" | openssl dgst -sha256 -hmac "${seed}" | awk '{print $NF}'
}

postgres_password="$(derive postgres)"
clickhouse_password="$(derive clickhouse)"
redis_auth="$(derive redis)"
minio_password="$(derive minio)"
nextauth_secret="$(derive nextauth)"
salt="$(derive salt)"
encryption_key="$(derive encryption)"
login_password="$(derive login)"
public_key="pk-lf-preview-${pr_number}"
secret_key="sk-lf-preview-$(derive apikey)"

for value in \
  "${postgres_password}" \
  "${clickhouse_password}" \
  "${redis_auth}" \
  "${minio_password}" \
  "${nextauth_secret}" \
  "${salt}" \
  "${encryption_key}" \
  "${login_password}" \
  "${secret_key}"; do
  echo "::add-mask::${value}"
done

{
  echo "clickhouse_password=${clickhouse_password}"
  echo "commit_sha=${commit_sha}"
  echo "ecr_registry=${ecr_registry}"
  echo "encryption_key=${encryption_key}"
  echo "image_tag=${image_tag}"
  echo "login_email=preview-${pr_number}@langfuse.local"
  echo "login_password=${login_password}"
  echo "minio_password=${minio_password}"
  echo "nextauth_secret=${nextauth_secret}"
  echo "postgres_password=${postgres_password}"
  echo "preview_host=${preview_host}"
  echo "pr_number=${pr_number}"
  echo "public_key=${public_key}"
  echo "redis_auth=${redis_auth}"
  echo "salt=${salt}"
  echo "secret_key=${secret_key}"
  echo "short_sha=${short_sha}"
  echo "stack_name=${stack_name}"
  echo "web_image=${AWS_PREVIEW_WEB_ECR_REPOSITORY_URL}:${image_tag}"
  echo "worker_image=${AWS_PREVIEW_WORKER_ECR_REPOSITORY_URL}:${image_tag}"
} >> "$GITHUB_OUTPUT"
