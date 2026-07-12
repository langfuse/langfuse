#!/usr/bin/env bash
set -euo pipefail
# Render the on-host deploy.env, ship it to the instance over SSM, run deploy.sh,
# and poll to completion. Env: INSTANCE_ID, PR_NUMBER, PREVIEW_HOST, ECR_REGISTRY,
# WEB_IMAGE, WORKER_IMAGE, PUBLIC_KEY, SECRET_KEY, LOGIN_EMAIL, LOGIN_PASSWORD,
# and the CLICKHOUSE_PASSWORD/ENCRYPTION_KEY/MINIO_PASSWORD/NEXTAUTH_SECRET/
# POSTGRES_PASSWORD/REDIS_AUTH/SALT secrets + AWS_PREVIEW_REGION.

env_file="$(mktemp)"
cat > "${env_file}" <<EOF
AWS_REGION=${AWS_PREVIEW_REGION}
CLICKHOUSE_PASSWORD=${CLICKHOUSE_PASSWORD}
ECR_REGISTRY=${ECR_REGISTRY}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
LANGFUSE_INIT_ORG_ID=preview-org-${PR_NUMBER}
LANGFUSE_INIT_ORG_NAME=Preview-PR-${PR_NUMBER}
LANGFUSE_INIT_PROJECT_ID=preview-project-${PR_NUMBER}
LANGFUSE_INIT_PROJECT_NAME=Preview-Project
LANGFUSE_INIT_PROJECT_PUBLIC_KEY=${PUBLIC_KEY}
LANGFUSE_INIT_PROJECT_SECRET_KEY=${SECRET_KEY}
LANGFUSE_INIT_USER_EMAIL=${LOGIN_EMAIL}
LANGFUSE_INIT_USER_NAME=Preview-User
LANGFUSE_INIT_USER_PASSWORD=${LOGIN_PASSWORD}
MINIO_ROOT_PASSWORD=${MINIO_PASSWORD}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
PREVIEW_HOST=${PREVIEW_HOST}
REDIS_AUTH=${REDIS_AUTH}
SALT=${SALT}
WEB_IMAGE=${WEB_IMAGE}
WORKER_IMAGE=${WORKER_IMAGE}
EOF

env_b64="$(base64 -w0 "${env_file}")"

# SSM parameters must be JSON: the base64 blob and the shell snippets
# below contain commas and pipes that the "commands=..." shorthand
# mis-parses (AWS CLI ParamValidationError). A file:// JSON document
# passes each command through verbatim.
params_file="$(mktemp)"
cat > "${params_file}" <<JSON
{"commands":[
"mkdir -p /opt/langfuse-preview",
"echo ${env_b64} | base64 -d > /opt/langfuse-preview/deploy.env",
"chmod 600 /opt/langfuse-preview/deploy.env",
"for i in \$(seq 1 60); do test -x /opt/langfuse-preview/deploy.sh && break || sleep 5; done",
"test -x /opt/langfuse-preview/deploy.sh",
"/opt/langfuse-preview/deploy.sh"
]}
JSON

command_id="$(aws ssm send-command \
  --document-name "AWS-RunShellScript" \
  --instance-ids "${INSTANCE_ID}" \
  --comment "Deploy Langfuse PR ${PR_NUMBER} preview" \
  --parameters "file://${params_file}" \
  --query "Command.CommandId" \
  --output text)"

# Poll for completion rather than `aws ssm wait command-executed`,
# whose ~100s default (5s x 20 attempts) is far shorter than a cold
# deploy: the bundled cloud-init wait, ECR login, ~7 image pulls, and
# six container-readiness gates in deploy.sh run for several minutes.
# The short waiter would fail the step spuriously while the on-host
# deploy is still succeeding.
deploy_ok=false
for _ in $(seq 1 120); do
  status="$(aws ssm get-command-invocation \
    --command-id "${command_id}" \
    --instance-id "${INSTANCE_ID}" \
    --query "Status" --output text 2>/dev/null || echo "Pending")"
  case "${status}" in
    Success)
      deploy_ok=true
      break
      ;;
    Cancelled | TimedOut | Failed)
      break
      ;;
  esac
  sleep 10
done

if [ "${deploy_ok}" != "true" ]; then
  aws ssm get-command-invocation \
    --command-id "${command_id}" \
    --instance-id "${INSTANCE_ID}" \
    --query "{Status:Status,Stdout:StandardOutputContent,Stderr:StandardErrorContent}" \
    --output json
  exit 1
fi
