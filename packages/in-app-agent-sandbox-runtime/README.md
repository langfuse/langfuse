# In-App Agent Sandbox Runtime

Minimal HTTP control server for the in-app agent sandbox runtime.

See `web/src/ee/features/in-app-agent/README.md` for how this package fits into the in-app agent sandbox architecture.

## Privileges

The runtime runs as a single unprivileged `sandbox-server` user inside the container.
This keeps the setup compatible with Lambda MicroVMs, which set `no new privileges`
and prevent `sudo`-based user switching at runtime.

- The HTTP sandbox server runs as `sandbox-server`.
- Tool operations (`read`, `write`, `edit`, `bash`) also run as `sandbox-server`.
- `/workspace/tool_calls` is recreated from prior tool outputs before each tool invocation, so any modifications made during one tool call are discarded before the next one.

## Endpoints:

- `GET /health`
- `POST /sandbox`
- `POST /aws/lambda-microvms/runtime/v1/ready`
- `POST /aws/lambda-microvms/runtime/v1/run`
- `POST /aws/lambda-microvms/runtime/v1/resume`
- `POST /aws/lambda-microvms/runtime/v1/suspend`
- `POST /aws/lambda-microvms/runtime/v1/terminate`

## Development

To rebuild the local Docker image manually:

```bash
pnpm turbo run build:docker-image --filter @repo/in-app-agent-sandbox-runtime --force
```

This produces `langfuse-in-app-agent-sandbox:latest`.

## Build And Publish An AWS Lambda MicroVM Image

Use `packages/in-app-agent-sandbox-runtime/build-microvm-image.sh` as the canonical build and publish flow.

From the repo root:

```bash
bash packages/in-app-agent-sandbox-runtime/build-microvm-image.sh
```

The script:

- optionally loads `packages/in-app-agent-sandbox-runtime/.env`
- validates required commands and environment variables
- builds the local Docker image and package `dist`
- creates and uploads the zip artifact to S3
- creates or updates the Lambda MicroVM image
- waits for the build to finish
- prints `IMAGE_ARN=...` and `IMAGE_VERSION=...`

Required environment variables:

- `AWS_PROFILE`
- `AWS_REGION`
- `S3_BUCKET`
- `MICROVM_IMAGE_NAME`
- `LAMBDA_MICROVM_BUILD_ROLE_ARN`
- `BASE_IMAGE_ARN`
- `BASE_IMAGE_VERSION`

Prerequisites:

- Docker
- AWS CLI with `lambda-microvms` support
- An authenticated AWS profile
- An S3 bucket for the artifact upload
- A Lambda MicroVM build role ARN with access to read the S3 artifact and write build logs

The script configures the required MicroVM hooks for this runtime, including `ready`, `run`, `resume`, `suspend`, and `terminate` on port `5000`.
