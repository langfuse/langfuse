# In-App Agent Sandbox Runtime

Minimal HTTP control server for the in-app agent sandbox runtime.

See `web/src/ee/features/in-app-agent/README.md` for how this package fits into the in-app agent sandbox architecture.

## Privileges

The runtime uses two Unix privilege levels inside the container:

- The HTTP sandbox server runs as the dedicated `sandbox-server` user. It owns and refreshes `/workspace/tool_calls`.
- All tool operations (`read`, `write`, `edit`, `bash`) run as the less-privileged `sandbox-tool` user via a tightly scoped `sudo` rule and only have read access to `/workspace/tool_calls`.

## Endpoints:

- `GET /health`
- `POST /sandbox`

# Development

To rebuild it manually:

`pnpm turbo run build:docker-image --filter @repo/in-app-agent-sandbox-runtime --force`

## Build And Publish An AWS Lambda MicroVM Image

This package builds the sandbox runtime image used by both local Docker sandboxes and the AWS Lambda MicroVM provider.

- Local Docker development uses the image tag `langfuse-in-app-agent-sandbox:latest`.
- The Lambda MicroVM provider should uses an AWS MicroVM image ARN via `LANGFUSE_IN_APP_AGENT_SANDBOX_AWS_LAMBDA_MICROVM_IMAGE_IDENTIFIER`.

### Prerequisites

- Docker
- AWS CLI with `lambda-microvms` support
- An authenticated AWS profile, for example `aws login --sso playground`
- An ECR repository to push the built image to
- A Lambda MicroVM build role ARN with access to pull the code artifact and write build logs

### 1. Build The Local Docker Image

From the repo root:

```bash
pnpm turbo run build:docker-image --filter @repo/in-app-agent-sandbox-runtime --force
```

That produces the local image:

```bash
langfuse-in-app-agent-sandbox:latest
```

### 2. Tag And Push The Image To ECR

Set your AWS account, region, and repository name:

```bash
export AWS_PROFILE=playground
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=123456789012
export ECR_REPOSITORY=langfuse-in-app-agent-sandbox
export IMAGE_TAG=$(git rev-parse --short HEAD)
```

Create the repository once if needed:

```bash
aws ecr create-repository \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --repository-name "$ECR_REPOSITORY"
```

Log Docker into ECR:

```bash
aws ecr get-login-password \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
| docker login \
  --username AWS \
  --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
```

Tag and push the image:

```bash
export ECR_IMAGE_URI="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG"

docker tag langfuse-in-app-agent-sandbox:latest "$ECR_IMAGE_URI"
docker push "$ECR_IMAGE_URI"
```

### 3. Pick A Lambda-Managed Base MicroVM Image

List available managed base images:

```bash
aws lambda-microvms list-managed-microvm-images \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"
```

Then list versions for the base image you want to use:

```bash
aws lambda-microvms list-managed-microvm-image-versions \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --image-identifier "<managed-base-image-arn>"
```

Record:

- the managed base image ARN
- the base image version

### 4. Create A MicroVM Image From The ECR Artifact

Set the Lambda MicroVM build role and base image metadata:

```bash
export LAMBDA_MICROVM_BUILD_ROLE_ARN="arn:aws:iam::123456789012:role/langfuse-in-app-agent-sandbox-build"
export BASE_IMAGE_ARN="<managed-base-image-arn>"
export BASE_IMAGE_VERSION="<managed-base-image-version>"
export MICROVM_IMAGE_NAME="langfuse-in-app-agent-sandbox"
```

Start the asynchronous image build:

```bash
aws lambda-microvms create-microvm-image \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --name "$MICROVM_IMAGE_NAME" \
  --base-image-arn "$BASE_IMAGE_ARN" \
  --base-image-version "$BASE_IMAGE_VERSION" \
  --build-role-arn "$LAMBDA_MICROVM_BUILD_ROLE_ARN" \
  --code-artifact "uri=$ECR_IMAGE_URI" \
  --cpu-configurations architecture=ARM_64 \
  --resources minimumMemoryInMiB=1024
```

The response includes:

- `imageArn`
- `imageVersion`
- initial `state`
