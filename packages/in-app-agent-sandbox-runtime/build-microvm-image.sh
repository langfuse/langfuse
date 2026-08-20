#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

required_vars=(
  AWS_PROFILE
  AWS_REGION
  S3_BUCKET
  MICROVM_IMAGE_NAME
  LAMBDA_MICROVM_BUILD_ROLE_ARN
  BASE_IMAGE_ARN
  BASE_IMAGE_VERSION
)

for command in aws git pnpm zip; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$command" >&2
    exit 1
  fi
done

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    printf 'Missing required env var: %s\n' "$var_name" >&2
    exit 1
  fi
done

REPO_ROOT="$(git rev-parse --show-toplevel)"
PACKAGE_DIR="$SCRIPT_DIR"
ARTIFACT_NAME="microvm-artifact.zip"
ARTIFACT_PATH="$PACKAGE_DIR/$ARTIFACT_NAME"
S3_URI="s3://$S3_BUCKET/$MICROVM_IMAGE_NAME.zip"

cleanup() {
  rm -f "$ARTIFACT_PATH"
}

trap cleanup EXIT

read -r -d '' HOOKS_JSON <<'JSON' || true
{
  "port": 5000,
  "microvmImageHooks": {
    "ready": "ENABLED",
    "readyTimeoutInSeconds": 60
  },
  "microvmHooks": {
    "run": "ENABLED",
    "runTimeoutInSeconds": 30,
    "resume": "ENABLED",
    "resumeTimeoutInSeconds": 30,
    "suspend": "ENABLED",
    "suspendTimeoutInSeconds": 60,
    "terminate": "ENABLED",
    "terminateTimeoutInSeconds": 30
  }
}
JSON

printf 'Building docker image...\n' >&2
pnpm turbo run build:docker-image --filter @repo/in-app-agent-sandbox-runtime --force

printf 'Building package dist...\n' >&2
pnpm --filter @repo/in-app-agent-sandbox-runtime run build

printf 'Creating zip artifact...\n' >&2
(
  cd "$PACKAGE_DIR"
  rm -f "$ARTIFACT_NAME"
  zip -r "$ARTIFACT_NAME" Dockerfile package.json dist >/dev/null
)

printf 'Uploading artifact to %s...\n' "$S3_URI" >&2
aws s3 cp "$ARTIFACT_PATH" "$S3_URI" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"

EXISTING_IMAGE_ARN="$({
  aws lambda-microvms list-microvm-images \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --name-filter "$MICROVM_IMAGE_NAME" \
    --query "items[?name=='$MICROVM_IMAGE_NAME'] | [0].imageArn" \
    --output text 2>/dev/null || true; \
} | tr -d '\r')"

if [[ -n "$EXISTING_IMAGE_ARN" && "$EXISTING_IMAGE_ARN" != "None" && "$EXISTING_IMAGE_ARN" != "null" ]]; then
  printf 'Updating existing MicroVM image...\n' >&2
  IMAGE_ARN="$({
    aws lambda-microvms update-microvm-image \
      --profile "$AWS_PROFILE" \
      --region "$AWS_REGION" \
      --image-identifier "$EXISTING_IMAGE_ARN" \
      --base-image-arn "$BASE_IMAGE_ARN" \
      --base-image-version "$BASE_IMAGE_VERSION" \
      --build-role-arn "$LAMBDA_MICROVM_BUILD_ROLE_ARN" \
      --code-artifact "uri=$S3_URI" \
      --hooks "$HOOKS_JSON" \
      --cpu-configurations architecture=ARM_64 \
      --resources minimumMemoryInMiB=512 \
      --query 'imageArn' \
      --output text; \
  } | tr -d '\r')"
else
  printf 'Creating MicroVM image...\n' >&2
  IMAGE_ARN="$({
    aws lambda-microvms create-microvm-image \
      --profile "$AWS_PROFILE" \
      --region "$AWS_REGION" \
      --name "$MICROVM_IMAGE_NAME" \
      --base-image-arn "$BASE_IMAGE_ARN" \
      --base-image-version "$BASE_IMAGE_VERSION" \
      --build-role-arn "$LAMBDA_MICROVM_BUILD_ROLE_ARN" \
      --code-artifact "uri=$S3_URI" \
      --hooks "$HOOKS_JSON" \
      --cpu-configurations architecture=ARM_64 \
      --resources minimumMemoryInMiB=512 \
      --query 'imageArn' \
      --output text; \
  } | tr -d '\r')"
fi

if [[ -z "$IMAGE_ARN" || "$IMAGE_ARN" == "None" || "$IMAGE_ARN" == "null" ]]; then
  printf 'Failed to create MicroVM image or parse image ARN\n' >&2
  exit 1
fi

printf 'Waiting for MicroVM image to finish building...\n' >&2
while true; do
  IMAGE_STATE="$({
    aws lambda-microvms get-microvm-image \
      --profile "$AWS_PROFILE" \
      --region "$AWS_REGION" \
      --image-identifier "$IMAGE_ARN" \
      --query 'state' \
      --output text; \
  } | tr -d '\r')"
  IMAGE_VERSION="$({
    aws lambda-microvms get-microvm-image \
      --profile "$AWS_PROFILE" \
      --region "$AWS_REGION" \
      --image-identifier "$IMAGE_ARN" \
      --query 'latestActiveImageVersion' \
      --output text; \
  } | tr -d '\r')"

  printf 'Current MicroVM image state: %s\n' "$IMAGE_STATE" >&2

  case "$IMAGE_STATE" in
    CREATED|UPDATED)
      printf 'IMAGE_ARN=%s\n' "$IMAGE_ARN"
      printf 'IMAGE_VERSION=%s\n' "$IMAGE_VERSION"
      exit 0
      ;;
    CREATE_FAILED|UPDATE_FAILED|DELETE_FAILED)
      printf 'MicroVM image entered failure state: %s\n' "$IMAGE_STATE" >&2
      aws lambda-microvms get-microvm-image \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --image-identifier "$IMAGE_ARN" \
        --output json >&2
      exit 1
      ;;
    *)
      sleep 5
      ;;
  esac
done
