# CIP fork of Langfuse

This is collect-intel's fork of [langfuse/langfuse](https://github.com/langfuse/langfuse),
the base of CIP's product platform (owner decision, 2026-08-12). Custom product
features (Elicitations, Rubrics, People, Datasets extensions) are built inside
this fork on top of stock Langfuse.

Deployed at `studio.staging.weval.org` from `cip-data-staging`
(Terraform: product-platform archive, `terraform/langfuse/`; state in
`gs://cip-data-staging-terraform-state/langfuse/`).

## Branch model

- **`main`** (default branch) — the deployable line, cut from the upstream tag
  `v3.137.0`. Feature branches (`cip/*`) merge here via PR.
- **`upstream-main`** — pristine mirror of upstream `main`. Never deployed,
  never carries CIP commits, never a PR base (it is thousands of commits ahead
  of our tag base and would always conflict).

## Upstream tracking

- `upstream` remote = `langfuse/langfuse`. Upgrade by merging the **next tagged
  semver release only** (never upstream `main`) into our `main`, and read the
  release notes for background migrations first.
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
