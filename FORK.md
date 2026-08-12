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
| `web/src/components/layouts/routes.tsx` | `Elicitations` nav entry in the Evaluation group + `MessagesSquare` icon import; `projectRbacScopes: ["elicitations:read"]` on the entry | 2026-08-12 |
| `packages/shared/prisma/schema.prisma` | `Elicitation` + `ElicitationSubmission` models appended; back-relations `elicitations` on `Project` and `elicitationsCreated` on `User` | 2026-08-12 |
| `web/src/features/rbac/constants/projectAccessRights.ts` | `elicitations:read` / `elicitations:CUD` scopes; granted to OWNER/ADMIN/MEMBER (both) and VIEWER (read) | 2026-08-12 |
| `web/src/server/api/root.ts` | `elicitations: elicitationsRouter` mount | 2026-08-12 |
| `web/src/features/audit-logs/auditLog.ts` | `"elicitation"` added to `AuditableResource` | 2026-08-12 |
| `package.json` | `format`/`format:check` scripts: dropped `--experimental-cli` — prettier's experimental CLI silently no-ops or deadlocks under Bun's node shim (CIP dev machines are Node-free), which broke the husky pre-commit hook; the stable CLI behaves identically | 2026-08-12 |
| `web/src/components/LangfuseLogo.tsx` | `LangfuseIcon` renders the Weval mark (`cip-branding/WevalLogo`); wordmark text → "Weval Studio". Export names unchanged so call sites stay stock | 2026-08-12 |
| `web/src/components/layouts/app-layout/hooks/useLayoutMetadata.ts` | Browser-tab title → "Weval Studio" | 2026-08-12 |
| `web/src/pages/auth/{sign-in,sign-up,sso-initiate,enterprise-sso-required}.tsx`, `web/src/pages/onboarding.tsx`, `web/src/features/auth-credentials/components/ResetPasswordPage.tsx` | `<title>` strings → "… \| Weval Studio" | 2026-08-12 |
| `web/public/` (`icon.svg`, `favicon*.{png,ico}`, `icon{256,1024}.png`, `apple-touch-icon.png`, `android-chrome-192x192.png`) | Replaced with the Weval mark from weval-org/app (`public/cip.{svg,png}`); `icon.svg` flips to white in dark mode | 2026-08-12 |
| ~55 files in `web/src/` + 7 email files in `packages/shared/src/server/services/email/` | Tier-1 rebrand sweep: user-visible standalone "Langfuse" strings → "Weval Studio" (word-boundary replace; `langfuse`/`LANGFUSE_*`/`LangfuseX` identifiers, SDK code snippets, DB values like `owner === "LANGFUSE"`, and `maintainer`-string comparisons kept consistent). Email logo → `https://weval.org/cip.png`, sender name/subjects rebranded. After an upstream merge, re-check with: `rg -n '\bLangfuse\b' web/src packages/shared/src/server/services/email \| rg -v 'Langfuse[A-Za-z]\|[A-Za-z]Langfuse\|langfuse\.com'` | 2026-08-12 |
| `web/src/components/nav/sidebar-notifications.tsx` | Emptied `notifications` array (upstream ships a "Star Langfuse on GitHub" promo) | 2026-08-12 |
| `README.md` | Replaced upstream marketing README with a concise Weval Studio fork README; deleted `README.{cn,ja,kr}.md` (resolve future modify/delete merge conflicts with `git rm`) | 2026-08-12 |

Deliberately NOT rebranded (see exploration notes): `langfuse.com` docs hrefs
(they are the accurate product docs and there is no Weval docs equivalent),
`LANGFUSE_*` env vars, `X-Langfuse-*` SDK wire headers, npm package names,
OTel metric/attribute names, `LICENSE` (MIT requires the Langfuse GmbH
copyright notice), everything under `ee/` / `web/src/ee/` / `worker/src/ee/`
(separate commercial license), cloud-only surfaces (billing, payment banner,
cloud status, support-chat Plain router), code comments, and test fixtures.
