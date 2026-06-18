---
name: security-review
description: Security review patterns for Langfuse. Use during code review, design, or planning whenever a change accepts user-supplied URLs, host/endpoint/baseURL fields, secrets, cross-tenant data, new outbound HTTP requests, new integrations (webhooks, blob storage, LLM connections, image proxies), redirect-following behavior, or new auth/permission scopes. Covers SSRF/outbound URL validation today and is intentionally extensible to other recurring security findings (tenant isolation, secret handling, redirect mishandling, file upload, RBAC scope drift).
---

# Security Review

Use this skill when reviewing or planning code that touches a security-sensitive
surface in Langfuse. It collects the recurring findings the team has seen in
external security reports so that future agents catch them at design and review
time rather than after the fact.

## When to Apply

Apply this skill when the change touches any of:

- a user-supplied URL, host, endpoint, `baseURL`, or webhook target
- a new outbound HTTP request (`fetch`, `axios`, AWS SDK client init with a
  custom `endpoint`, OpenAI/Anthropic/Bedrock client init with a custom
  `baseURL`, etc.)
- a new integration form under Settings -> Integrations or any
  admin-configurable network destination
- a new tRPC procedure or public API route that mutates project-scoped data or
  changes who can access it
- secrets, API keys, signing secrets, or encryption-at-rest fields
- redirect-following or cross-origin header handling
- file uploads, image proxies, or other binary data flowing in or out

Apply this skill during **plan mode** when designing a new integration so the
correct validation surfaces land in the plan, not in a follow-up CVE.

## How to Read This Skill

1. Open [references/checklist.md](references/checklist.md) and run the mental
   sweep against the change.
2. For each bullet that fires, open the matching topic reference.

| Topic | Open when | File |
| --- | --- | --- |
| SSRF and outbound URL validation | The change accepts or fetches a user-supplied URL, host, or endpoint | [references/outbound-url-validation.md](references/outbound-url-validation.md) |

The catalog is intentionally short today. New topic files are added as new
finding classes recur (see "Extending This Skill").

## Output Expectations (Review Mode)

When this skill is used during code review:

- List findings first, ordered by severity, with file and line references.
- For each finding, name the canonical helper or known-good call site the
  author should copy.
- For SSRF-class findings, point at [references/outbound-url-validation.md](references/outbound-url-validation.md)
  rather than re-deriving the fix.
- Call out missing **negative tests** (private-IP, cross-tenant, missing-scope)
  as findings, not as nice-to-haves.

## Output Expectations (Design / Plan Mode)

When this skill is used while planning:

- Restate which surfaces the new feature exposes (forms, public API routes,
  worker entrypoints).
- For each surface that matches a checklist trigger, name the validator or
  helper that must be invoked and at which layer (save-time, use-time,
  connection-time, redirect-time).
- Treat "we will validate later" as a design defect: validation belongs in the
  same change that introduces the surface.

## Extending This Skill

Add a new `references/<topic>.md` whenever a security finding recurs across
features or PR reviews. Keep each reference narrow and concrete:

1. Threat in plain language (one paragraph).
2. Canonical helpers in this repo, with paths.
3. Known-good call sites that can be copied.
4. Required defenses (save-time, use-time, transport-time, etc.).
5. Anti-patterns to flag in review.

Then add a one-line trigger to [references/checklist.md](references/checklist.md)
pointing at the new topic file, and add a row to the table above.

Candidates for future references (do not add until a real finding recurs):

- Tenant isolation (`projectId` filters across Prisma and ClickHouse)
- Secret handling and encryption-at-rest read paths
- Redirect mishandling and sensitive-header propagation
- File upload validation and content-type sniffing
- RBAC scope drift on new tRPC/public API endpoints
- Signed URL scoping (expiry, path, method)
- Public API rate limiting and auth boundary checks

## Integration With Other Skills

- The shared `code-review` skill should defer here for any change that matches
  the triggers above; see [code-review/SKILL.md](../code-review/SKILL.md).
- The shared `backend-dev-guidelines` skill should defer here when adding
  outbound HTTP, integration config, or URL-accepting procedures; see
  [backend-dev-guidelines/SKILL.md](../backend-dev-guidelines/SKILL.md).
- Confirmed issues with reproduction evidence go through `linear-bug-triage`
  for Linear handoff.
