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
- The Lambda MicroVM provider should use an AWS MicroVM image ARN via `LANGFUSE_IN_APP_AGENT_SANDBOX_AWS_LAMBDA_MICROVM_IMAGE_IDENTIFIER`.

### Prerequisites

- Docker
- AWS CLI with `lambda-microvms` support
- An authenticated AWS profile, for example `aws login --sso playground`
- An S3 bucket to upload the zip artifact to
- A Lambda MicroVM build role ARN with access to read the S3 artifact and write build logs

### 1. Build The Local Docker Image

From the repo root:

```bash
pnpm turbo run build:docker-image --filter @repo/in-app-agent-sandbox-runtime --force
```

That produces the local image:

```bash
langfuse-in-app-agent-sandbox:latest
```

### 2. Package And Upload The S3 Artifact

Set your AWS region, bucket, and MicroVM image name:

```bash
export AWS_PROFILE=
export AWS_REGION=eu-west-1
export S3_BUCKET=langfuse-lambda-microvms
export MICROVM_IMAGE_NAME=langfuse-in-app-agent-sandbox
```

Create the zip artifact from this package directory with only the files referenced by the current `Dockerfile`:

```bash
zip -r microvm-artifact.zip Dockerfile package.json dist
```

Upload the artifact to S3:

```bash
aws s3 cp microvm-artifact.zip "s3://$S3_BUCKET/$MICROVM_IMAGE_NAME.zip" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"
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

### 4. Create A Role If It Doesn't Exist Yet

```bash
aws iam create-role \
  --profile "$AWS_PROFILE" \
  --role-name LambdaMicrovmBuildRole \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
```

```bash
aws iam put-role-policy \
  --profile "$AWS_PROFILE" \
  --role-name LambdaMicrovmBuildRole \
  --policy-name LambdaMicrovmBuildPolicy \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [
      {
        \"Sid\": \"CloudWatchLogs\",
        \"Effect\": \"Allow\",
        \"Action\": [
          \"logs:CreateLogGroup\",
          \"logs:CreateLogStream\",
          \"logs:PutLogEvents\"
        ],
        \"Resource\": \"*\"
      },
      {
        \"Sid\": \"ReadArtifactFromS3\",
        \"Effect\": \"Allow\",
        \"Action\": [\"s3:GetObject\"],
        \"Resource\": \"arn:aws:s3:::$S3_BUCKET/$MICROVM_IMAGE_NAME.zip\"
      }
    ]
  }"
```

Only add ECR permissions if the `Dockerfile` pulls private images from ECR during the MicroVM build.

### 5. Create A MicroVM Image From The S3 Zip Artifact

Set the Lambda MicroVM build role and base image metadata:

```bash
export AWS_ACCOUNT_ID=123456789012
export LAMBDA_MICROVM_BUILD_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/LambdaMicrovmBuildRole"
export BASE_IMAGE_ARN=""
export BASE_IMAGE_VERSION=""
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
  --code-artifact "uri=s3://$S3_BUCKET/$MICROVM_IMAGE_NAME.zip" \
  --cpu-configurations architecture=ARM_64 \
  --resources minimumMemoryInMiB=1024
```

The response includes:

- `imageArn`
- `imageVersion`
- initial `state`
