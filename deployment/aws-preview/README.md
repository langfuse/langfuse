# AWS PR Previews

This directory contains the app-side CloudFormation template used by the
`AWS PR Preview` workflow.

The shared AWS foundation lives in the private `langfuse/infrastructure` repo
under `terraform/org/playground_previews`. That Terraform stack owns the
playground VPC, ECR repositories, Route53 zone, GitHub OIDC role,
CloudFormation service role, and EC2 instance profile.

Each same-repository PR gets one disposable CloudFormation stack named
`langfuse-preview-pr-<number>`. The stack creates a single EC2 host. The
workflow builds the `web` and `worker` images, pushes them to preview ECR
repositories, deploys or updates the stack, and then uses SSM to run the
containers with Postgres, ClickHouse, Redis, and MinIO on the host.

Closing the PR deletes the CloudFormation stack and the attached data volume.
Preview data must stay synthetic.
