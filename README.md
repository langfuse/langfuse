# Weval Studio

Weval Studio is CIP's product platform for LLM observability, evaluation, and
prompt management — a fork of [Langfuse](https://github.com/langfuse/langfuse)
(base `v3.137.0`) with CIP product features (Elicitations, Rubrics, People,
Datasets extensions) built on top.

- **Deployment**: `studio.staging.weval.org` (GCP project `cip-data-staging`,
  Terraform in the product-platform repo under `terraform/langfuse/`)
- **Fork conventions, branch model, and upstream tracking**: see [FORK.md](./FORK.md)
- **Upstream documentation** (self-hosting, SDKs, APIs): [langfuse.com/docs](https://langfuse.com/docs)

## Development

```sh
pnpm i          # install dependencies
pnpm run dx     # full setup: reset DBs, seed data, start dev (wipes local state!)
pnpm run dev    # start web + worker
pnpm run dev:web # web only (localhost:3000) — sufficient in most cases
```

Local login with seed data: `demo@langfuse.com` / `password`.

See `CLAUDE.md` and `AGENTS.md` for detailed development commands and
repository structure.

## Building the deploy image

```sh
gcloud builds submit --config cloudbuild.cip.yaml \
  --substitutions _TAG=v3.137.0-cip.N --project cip-data-staging
```

Then bump `web_image_tag` in the product-platform Terraform stack and apply.

## License

This repository retains the upstream licensing: MIT for the core (Copyright
Langfuse GmbH) and the commercial Enterprise Edition license for code under
`ee/`, `web/src/ee/`, and `worker/src/ee/`. See [LICENSE](./LICENSE).
