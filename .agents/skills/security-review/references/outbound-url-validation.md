# Outbound URL Validation (SSRF)

## Threat

Any Langfuse code path that issues an outbound HTTP request to a URL derived
from user input (mutation form, public API field, integration config, image
proxy) can be coerced into Server-Side Request Forgery. The high-value
internal targets in Langfuse's deployment topology include:

- Cloud instance metadata services (`169.254.169.254`, IMDSv2 endpoints)
- Internal Postgres, ClickHouse, Redis, S3/MinIO, queue admin UIs
- Loopback admin interfaces (`127.0.0.1`, `localhost`, Docker API on
  `2375/2376`)
- Kubernetes API server and other in-cluster control planes
- Any RFC1918 / RFC6598 / IPv6 ULA range routable from the pod or container

Even when the surface requires `integrations:CRUD` or admin scope, the
attacker model assumes the credentialed user is malicious or compromised;
SSRF lets them pivot from app-level admin to network-level access that the
deployment topology otherwise denies.

## Canonical Helpers

All under `packages/shared/src/server/outbound-url/`:

- [`parseOutboundUrl(urlString)`](../../../../packages/shared/src/server/outbound-url/validation.ts)
  — safe parse. Rejects embedded credentials, invalid encoding, and bad URL
  syntax. **Use this instead of `new URL(...)` for any user-supplied URL.**
- [`validateOutboundUrlHost({ url, whitelist, logContext, shouldSkipDnsCheckForLiteralIps })`](../../../../packages/shared/src/server/outbound-url/validation.ts)
  — checks hostname blocklist, IP literal blocklist, and forward DNS
  resolution against blocked CIDRs (defends DNS rebinding by resolving every
  A/AAAA plus the local `getaddrinfo` view).
- [`addSecureOutboundConnectionValidation(options, ...)`](../../../../packages/shared/src/server/outbound-url/connection.ts)
  — attaches connect-time IP validation to a `fetch` request so the TCP peer
  is re-validated after DNS resolution, not just at save time.
- [`fetchWithSecureRedirects(...)`](../../../../packages/shared/src/server/outbound-url/fetch.ts)
  — manual redirect handling. Validates each `Location` hop with the
  caller-supplied validator and strips sensitive headers (`Authorization`,
  `Cookie`, signing headers) on cross-origin redirects.

Surface-specific wrappers (reuse these rather than rolling your own):

- LLM base URL:
  [`validateLlmConnectionBaseURL`](../../../../packages/shared/src/server/llm/baseUrlValidation.ts)
- Webhook URL:
  [`validateWebhookURL`](../../../../packages/shared/src/server/webhooks/validation.ts)
- Blob storage endpoint:
  [`validateBlobStorageEndpoint`](../../../../packages/shared/src/server/services/blobStorageEndpointValidation.ts)
  and the companion
  [`blobStorageEndpointConnectionValidationOptions`](../../../../packages/shared/src/server/services/blobStorageEndpointValidation.ts)
  for connect-time enforcement through `StorageServiceFactory`.

## Required Defenses

Every outbound-URL surface MUST apply **all three** of:

1. **Save-time validation** in the mutation, tRPC procedure, or public API
   route that persists the URL. Reject the write if validation fails.
2. **Use-time / connection-time validation** when the request is actually
   issued (worker job, lazy validation endpoint, processor). DNS can change
   between save and use; the SDK that ultimately makes the call may resolve a
   different IP than the save-time check did. Plumb
   `addSecureOutboundConnectionValidation` (or the SDK's equivalent hook)
   through the request.
3. **Redirect-time validation** if the request can be redirected. Plain
   `fetch()` defaults to `redirect: 'follow'` and will silently chase a
   redirect into the loopback range. Use `fetchWithSecureRedirects` with the
   matching validator instead.

## Known-Good Call Sites (Copy These)

- LLM base URL save:
  `web/src/features/llm-api-key/server/router.ts` (`update` mutation calls
  `validateLlmConnectionBaseURL` before persisting).
- LLM base URL through public API:
  `web/src/pages/api/public/llm-connections/index.ts`.
- Webhook URL save + use:
  `packages/shared/src/server/webhooks/validation.ts` is wired into both the
  automation form and the worker-side webhook sender.
- Blob storage endpoint:
  `web/src/features/blobstorage-integration/blobstorage-integration-router.ts`
  (`validate` mutation calls `validateBlobStorageEndpoint`); connection-time
  enforcement flows through `StorageServiceFactory.getInstance({
  connectionValidation: blobStorageEndpointConnectionValidationOptions() })`.

## When Adding a New Outbound URL Surface

1. Identify the user-input layers: form mutation, public API route, env import,
   anywhere the URL can be supplied by a tenant.
2. Decide whether an existing wrapper fits. If yes, reuse it. If not, add a
   new wrapper under `packages/shared/src/server/...` that delegates to
   `validateOutboundUrlHost` so blocklist behavior, DNS rebinding handling,
   and credential checks stay centralized.
3. Define the env exemption trio for self-hosted users who legitimately point
   at private network targets (mirroring
   `LANGFUSE_WEBHOOK_WHITELISTED_HOST/IPS/IP_SEGMENTS`,
   `LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST/IPS/IP_SEGMENTS`, and
   `LANGFUSE_BLOB_STORAGE_ENDPOINT_WHITELISTED_HOST/IPS/IP_SEGMENTS`). Those
   variables only exempt listed targets from the private-address block. A
   positive host list is a separate `*_ALLOWED_HOSTS` variable: when it is
   non-empty, every other host is rejected. Do not share another surface's
   list; each surface keeps its own.
4. Add the env vars to `.env*.example` and the package `env.mjs/ts`.
5. Call the wrapper from:
   - every tRPC mutation that writes the URL,
   - every public API route that accepts the URL,
   - the worker/processor that issues the request (use connect-time
     validation if the underlying SDK does not expose a host-validation hook).
6. If the request can redirect, use `fetchWithSecureRedirects` with the same
   wrapper as the validator.
7. Add server-side tests that prove blocked targets fail validation:
   `127.0.0.1`, `169.254.169.254`, an RFC1918 literal, an RFC1918 hostname
   (DNS rebinding), `http://` on Cloud, and a URL containing
   `user:pass@host`.

## Anti-Patterns to Flag in Review

- `fetch(<user-supplied-url>)` (or `axios`, `got`, etc.) without an upstream
  call to a `validate*URL` helper, or without
  `addSecureOutboundConnectionValidation` on the request options.
- A tRPC mutation that persists a `host` / `endpoint` / `baseURL` / `webhookUrl`
  field without invoking the matching validator before the write.
- `StorageServiceFactory.getInstance({ endpoint })` (or any SDK client init
  that takes a user-controlled URL) without `connectionValidation` plumbed
  through.
- Custom URL parsing via `new URL(userInput)` instead of
  `parseOutboundUrl(userInput)`. The latter rejects embedded credentials and
  bad encoding, both of which are recurring SSRF/credential-leak vectors.
- Following redirects with `fetch(url)` (default `redirect: 'follow'`) on a
  user-controlled URL. Switch to `fetchWithSecureRedirects`.
- A new integration UI that validates only on the client side. Save-time
  validation must run server-side.
- Save-time validation present, use-time validation missing (or vice versa).
  Both layers are required; the worker may issue the request hours after the
  save and DNS will have moved.

## Env Allowlist Behavior

- On Langfuse Cloud, LLM connections, blob storage, and external media
  storage ignore both the exemption lists and `*_ALLOWED_HOSTS`. Webhooks and
  SSO discovery still read theirs. HTTPS is enforced for surfaces that require
  it (LLM base URL, blob storage endpoint).
- Self-hosted reads the per-surface exemption trio (`*_WHITELISTED_HOST`,
  `*_WHITELISTED_IPS`, `*_WHITELISTED_IP_SEGMENTS`) for LLM connections,
  webhooks, blob storage, external media storage, and SSO discovery. A
  non-empty `*_ALLOWED_HOSTS` on the same surface is a positive host list:
  listed hosts are trusted (including private targets) and every other host
  is rejected. Unset and empty leave the default-allow behavior in place.
  `LANGFUSE_WEBHOOK_ALLOWED_HOSTS` applies to webhook saves and delivery
  only.   `LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS` applies to every outbound LLM
  request, including provider default hosts and Langfuse AI. Bedrock keeps
  the AWS transport (VPC endpoints resolve to private IPs). When the list is
  set, that provider checks the host the transport calls:
  `bedrock-runtime.<region>.<partition>`, or the host of
  `AWS_ENDPOINT_URL_BEDROCK_RUNTIME` / `AWS_ENDPOINT_URL` when set. Blob storage
  has no positive host list. For external media S3 virtual-hosted addressing,
  connect-time validation also trusts `{bucket}.{allowlisted endpoint host}`
  for that bucket.
- `LANGFUSE_OUTBOUND_BLOCKED_IP_SEGMENTS` adds CIDR ranges to the built-in
  private-address block for outbound URL checks that already run. Blob
  storage stays opt-in, so these ranges do not by themselves turn blob
  validation on. Per-surface exemptions still win over those ranges.
- Blob storage endpoint validation is **opt-in** today on self-hosted (the
  helper is a no-op until the operator configures one of the exemption env
  vars). There is a `TODO(next major)` in `blobStorageEndpointValidation.ts`
  to flip the default; until then, do not rely on blob storage validation
  for new surfaces — wire your own wrapper that defaults to strict.

## Negative Tests (Required)

A change that adds a new outbound URL surface MUST include server-side tests
that assert each of the following fails validation:

- Loopback literal (`http://127.0.0.1`, `http://[::1]`)
- Cloud metadata literal (`http://169.254.169.254`)
- RFC1918 literal (`http://10.0.0.1`)
- Hostname that resolves to a private IP (DNS rebinding sanity check)
- URL with embedded credentials (`http://user:pass@host`)
- `http://` on Cloud (where HTTPS is required)
- An empty allowlist permits no internal targets on self-hosted

Pattern reference:
`worker/src/__tests__/llm-base-url-validation.test.ts` and the test files
adjacent to the wrappers above.
