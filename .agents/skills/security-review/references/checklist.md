# Security Review Checklist

Run this list mentally on every relevant change. For each bullet, either find
that it does not apply, or confirm the listed mitigation is present in the
diff. Each bullet links to the topic reference that owns the detail.

## User-Supplied URLs and Outbound Requests

- Does the change accept a URL, host, `endpoint`, `baseURL`, webhook target,
  or any field that becomes the destination of an outbound HTTP request?
  - If yes, see [outbound-url-validation.md](outbound-url-validation.md).
  - Required: a save-time validator on the mutation/API route **and** use-time
    or connection-time validation when the request is issued, including
    redirects. Raw `fetch(userUrl)` or SDK init with `endpoint: userUrl`
    without that wiring is a finding.

- Does the change add a new "integration" (Settings -> Integrations, new
  webhook destination, new storage backend, new LLM provider, new image
  proxy) that lets an admin configure a host?
  - If yes, see [outbound-url-validation.md](outbound-url-validation.md).
  - Required: new env-driven allowlist trio (host / IPs / IP segments) for
    self-hosted, plus strict Cloud enforcement.

- Does the change follow redirects on a user-controlled URL with plain
  `fetch()`?
  - If yes, see [outbound-url-validation.md](outbound-url-validation.md)
    (Redirect Handling). Required: `fetchWithSecureRedirects` with the
    matching validator.

## Tenant Isolation

- Does every new Prisma query on a project-scoped table include `projectId`
  in the `where` clause?
- Does every new ClickHouse query on a project-scoped table include
  `project_id = {projectId: String}`?
- Does every new tRPC procedure use `protectedProjectProcedure` (or
  equivalent) and call `throwIfNoProjectAccess` with the right scope?
- Does every new public API route go through `withMiddlewares` +
  `createAuthedProjectAPIRoute` (or the equivalent organization variant) with
  the right scope?

These are enforced today by the repo-wide review checklist in
[../../code-review/references/review-checklist.md](../../code-review/references/review-checklist.md);
restate them here so the security sweep stays self-contained.

## Secrets and Credentials

- Are new secrets stored encrypted at rest (e.g. via `encrypt` / `decrypt`
  from `@langfuse/shared/encryption`) and never returned through `get`/list
  endpoints?
- Are secrets omitted from API responses (`select` / `omit` in Prisma) and
  from logs?
- Are new env vars added to `.env*.example` files and validated via the
  package `env.mjs/ts`, not read from `process.env` directly?

## Audit Logging

- Do sensitive mutations (integration config changes, role or scope changes,
  exports, deletions) emit `auditLog` with the right `action` and
  `resourceType`? Match existing wiring in
  `web/src/features/blobstorage-integration/blobstorage-integration-router.ts`
  and similar routers.

## Negative Tests

- Does the change include tests that prove **blocked** inputs are rejected
  (private IPs, cross-tenant IDs, missing scope, http: on Cloud)? Missing
  negative coverage on a security-sensitive surface is a finding.

## Extending

When a new finding class starts to recur in PR reviews or security reports,
add a one-line bullet here pointing at a new `references/<topic>.md`. Do not
restate the detail in this checklist; keep it as the trigger surface.
