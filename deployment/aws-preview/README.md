# AWS PR Previews

This directory contains the app-side CloudFormation template used by the
`AWS PR Preview` workflow (`.github/workflows/aws-preview.yml`).

The shared AWS foundation is managed in Langfuse's internal infrastructure
repository. That Terraform stack owns the playground VPC, ECR repositories,
Route53 zone, GitHub OIDC role, CloudFormation service role, and EC2 instance
profile, and exposes an output listing the `AWS_PREVIEW_*` GitHub repository
variables this workflow expects.

## Access: the allowlist

A single repository variable, `AWS_PREVIEW_ALLOWED_USERS` (space- or
comma-separated GitHub logins), controls who may use previews. It governs every
entry point — auto-deploy on PRs, `/preview` comments, and manual
`workflow_dispatch` runs. It defaults to `maxdeichmann`
(the initial owner); set the variable in
Settings → Secrets and variables → Actions → Variables to add or replace users
without a code change. (Previews as a whole stay dormant until the
`AWS_PREVIEW_ROLE_ARN` variable is set, regardless of the allowlist.)

## Auto-deploy on PRs

When an allowlisted author opens (or pushes to, or reopens) a **same-repo**
pull request, its preview is deployed automatically and refreshed on each push.
Fork PRs are not auto-built; an allowlisted collaborator should push a branch to
this repo instead. This uses a `pull_request_target` gate that runs the
reviewed default-branch workflow — it only checks the allowlist and then
dispatches the normal deploy on `main`, so unreviewed PR code never runs with
AWS credentials.

## Commands

Anyone on the allowlist can also drive previews manually by commenting:

| Command | Effect |
| --- | --- |
| `/preview deploy` | Build the PR head, push images to ECR, and create or update the preview |
| `/preview stop` | Stop the EC2 instance; data, URL, and TLS certificate are kept |
| `/preview resume` | Start the instance again with the previously deployed images |
| `/preview destroy` | Delete the CloudFormation stack and the PR's ECR image tags |

Auto-deploy and comment commands only work once the workflow exists on the
default branch.

## Lifecycle

- Each preview is one CloudFormation stack named `langfuse-preview-pr-<number>`
  running a single EC2 host. All Langfuse components run as Docker containers:
  `web` and `worker` from the preview ECR repositories, plus Postgres,
  ClickHouse, Redis, and MinIO from public images. Caddy terminates TLS with an
  automatic Let's Encrypt certificate at
  `https://pr-<number>.<preview domain>`.
- An Elastic IP keeps the address stable across stop/resume, so DNS and the
  TLS certificate survive.
- To pick up new commits, comment `/preview deploy` again — this rebuilds and
  refreshes a running preview in place. (There is no silent auto-deploy on
  push: every AWS action runs only from reviewed default-branch workflow code,
  so `pull_request`-triggered runs are intentionally not used.)
- Each engineer may have at most 5 previews running at once, attributed to
  whoever's command made the env run (`PreviewOwner` tag). The limit is
  best-effort; commands beyond it are rejected with a comment listing your
  running previews.
- Previews that show no activity (no CPU spike above baseline) for ~6 hours
  are stopped automatically — data and URL survive, `/preview resume` brings
  them back. Actively used envs, overnight soak tests, and demos keep
  running. A manual stop-all exists as workflow dispatch for emergencies.
- Housekeeping also destroys previews whose PR is closed (reconciled every
  2 hours) and previews that have been stopped for more than 7 days. ECR
  images also expire 14 days after push, so a long-paused preview may need a
  fresh `/preview deploy`.
- Fork PRs are skipped entirely, and only reviewed default-branch workflow
  code can assume the AWS role (the OIDC trust accepts only the
  `refs/heads/main` subject).

Preview data must stay synthetic: the login and API keys are posted publicly
on the PR, so anyone on the internet can sign in to a running preview. Never
enter real LLM provider keys, production data, or any other secrets into a
preview instance.
