# CIP fork of Langfuse

This is collect-intel's fork of [langfuse/langfuse](https://github.com/langfuse/langfuse),
the base of CIP's product platform (owner decision, 2026-08-12). Custom product
features (Elicitations, Rubrics, People, Datasets extensions) are built inside
this fork on top of stock Langfuse.

Deployed at `studio.staging.weval.org` from `cip-data-staging`
(Terraform: product-platform archive, `terraform/langfuse/`; state in
`gs://cip-data-staging-terraform-state/langfuse/`).

## Upstream tracking

- `upstream` remote = `langfuse/langfuse`. Merge **tagged semver releases only**
  (never `main`), and read the release notes for background migrations first.
- Current base: `v3.137.0` (matches the deployed Helm chart app version).

## Conventions (the fork's survival rules)

1. All CIP code lives in dedicated paths, so upstream merges stay conflict-free:
   - features: `web/src/features/cip-*/`
   - pages: thin re-export files under `web/src/pages/` (new files only)
   - future DB migrations: named `*_cip_*`
2. Upstream files are touched only at minimal registration points, each logged
   below with a `CIP fork` comment at the edit site.
3. Fixtures/seeds stay synthetic (`synth_*` / `example.com`) — no real data.

## Upstream files touched

| File | Edit | Since |
| --- | --- | --- |
| `web/src/components/layouts/routes.tsx` | `Elicitations` nav entry in the Evaluation group + `MessagesSquare` icon import | 2026-08-12 |
