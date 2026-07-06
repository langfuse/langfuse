# AWS PR Previews

This directory contains the app-side CloudFormation template used by the
`AWS PR Preview` workflow (`.github/workflows/aws-preview.yml`).

The shared AWS foundation lives in the private `langfuse/infrastructure` repo
under `terraform/org/playground_previews`. That Terraform stack owns the
playground VPC, ECR repositories, Route53 zone, GitHub OIDC role,
CloudFormation service role, and EC2 instance profile. Its
`github_actions_variables` output lists the `AWS_PREVIEW_*` GitHub repository
variables this workflow expects.

## Commands

Previews are driven by PR comments from maintainers (members, owners, and
collaborators):

| Command | Effect |
| --- | --- |
| `/preview deploy` | Build the PR head, push images to ECR, and create or update the preview |
| `/preview stop` | Stop the EC2 instance; data, URL, and TLS certificate are kept |
| `/preview resume` | Start the instance again with the previously deployed images |
| `/preview destroy` | Delete the CloudFormation stack and the PR's ECR image tags |

Comment commands only work once the workflow exists on the default branch.

## Lifecycle

- Each preview is one CloudFormation stack named `langfuse-preview-pr-<number>`
  running a single EC2 host. All Langfuse components run as Docker containers:
  `web` and `worker` from the preview ECR repositories, plus Postgres,
  ClickHouse, Redis, and MinIO from public images. Caddy terminates TLS with an
  automatic Let's Encrypt certificate at
  `https://pr-<number>.<preview domain>`.
- An Elastic IP keeps the address stable across stop/resume, so DNS and the
  TLS certificate survive.
- Pushing new commits auto-updates a preview only if it is already deployed
  and running; stopped previews stay stopped.
- Each engineer may have at most 5 previews running at once, attributed to
  whoever's command made the env run (`PreviewOwner` tag). The limit is
  best-effort; commands beyond it are rejected with a comment listing your
  running previews.
- Running previews are never stopped automatically — stop or destroy your
  envs when done (a running env costs ≈$67/month). A manual stop-all exists
  as workflow dispatch for emergencies.
- A daily reaper destroys previews that have been stopped for more than
  7 days. Closing the PR destroys the preview and deletes its images. ECR
  images also expire 14 days after push, so a long-paused preview may need a
  fresh `/preview deploy`.
- Fork PRs are skipped entirely.

Preview data must stay synthetic: the login and API keys are posted publicly
on the PR, so anyone on the internet can sign in to a running preview. Never
enter real LLM provider keys, production data, or any other secrets into a
preview instance.
