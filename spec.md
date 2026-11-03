# Spec: OAuth2 client credentials with `private_key_jwt` for Langfuse LLM connections

Status: ready to build. Target: a fork of `github.com/langfuse/langfuse` (v4, current `main`).
Audience: an engineer or coding agent that has no prior context. Everything you need is here;
anything marked **VERIFY** must be confirmed against the code before you rely on it.

---

## 1. Background

We run Langfuse self-hosted (AWS ECS: `langfuse-websrv` and `langfuse-worker` containers).
Hundreds of AI agents send traces into it, one Langfuse **project per agent**.

We want to use the Langfuse-native features that call an LLM on our behalf:

- LLM-as-a-Judge evaluators (online on traces, and on dataset experiment runs)
- Prompt experiments
- Playground
- the "test connection" button on LLM connections

The only LLM we are allowed to call is the corporate **RBI GenAI Gateway**
(`https://genai.rbi.tech`, OpenAI chat-completions API and Anthropic Messages API).
The gateway does not accept static API keys. Every request needs
`Authorization: Bearer <access_token>`, where the access token comes from the corporate
**PingFederate** server via the OAuth2 **client credentials** grant, authenticated with
**`private_key_jwt`** (RFC 7523) instead of a client secret. Tokens expire (minutes to
hours), so they must be fetched and refreshed automatically.

Each agent has **its own** PingFederate client id and its own private key (a JWK). The
judge for agent X must use agent X's credential. Credentials must never be shared
between projects.

Langfuse v4 LLM connections support only static secrets (API key + optional extra headers,
Bedrock keys/default credentials, Vertex service-account key/ADC). There is no token flow.
This spec adds one.

## 2. Goal

Add a new authentication method to LLM connections of adapter **`openai`** and
**`anthropic`**: "OAuth2 client credentials (private_key_jwt)". When a connection uses it,
every LLM call made through that connection obtains (or reuses a cached) access token from
the configured token endpoint and sends it as `Authorization: Bearer <token>`.

It must work for project-owned connections (required) and organization-owned connections
(nice to have, same code path).

## 3. Non-goals

- No other OAuth2 grants (no `client_secret_basic/post`, no auth code, no refresh tokens).
- No token-exchange proxy service. The token is minted inside Langfuse.
- No changes to trace ingestion auth, SSO login, or the public API auth.
- No reading keys from AWS Secrets Manager or any external store. The JWK is stored in the
  connection like every other LLM credential (encrypted at rest).
- Decision-model adapters (TypeSafe / Jev), Azure, Bedrock, Google adapters: out of scope.
- Embedding / topic-clustering calls: out of scope unless they share the same code path
  (if they do, they get the feature for free; do not add special handling).

## 4. Functional specification

### 4.1 Data model

No Prisma migration. Reuse the existing `llm_api_keys` (`LlmApiKeys`) columns:

| Column | Value for an OAuth2 connection |
|---|---|
| `adapter` | `openai` or `anthropic` |
| `baseURL` | gateway URL, e.g. `https://genai.rbi.tech/v1` (openai) |
| `secretKey` | the **private JWK as a JSON string**, encrypted with the existing `encrypt()` exactly like API keys today |
| `displaySecretKey` | `kid:<kid>` if the JWK has a `kid`, otherwise `kid:none` (never any key material) |
| `config` (JSON) | `{ "oauth2": { ... } }` — see 4.2 |
| `extraHeaders` | still allowed; merged as today. A user-supplied `Authorization` header is rejected for OAuth2 connections (see 4.5) |

### 4.2 Config schema

Add to `packages/shared/src/interfaces/customLLMProviderConfigSchemas.ts` (**VERIFY** path;
it currently holds `OpenAIConfigSchema`, `BedrockConfigSchema`, `VertexAIConfigSchema`,
`LLMConnectionConfigSchema`):

```ts
export const OAuth2ClientCredentialsSchema = z
  .object({
    tokenEndpoint: z.url(),                     // must be https
    clientId: z.string().min(1),
    scope: z.string().min(1).optional(),
    assertionAlgorithm: z
      .enum(["RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512"])
      .optional(),                              // default: JWK "alg", else RS256 (RSA) / ES256 (EC)
  })
  .strict();
```

- `OpenAIConfigSchema` gains optional `oauth2: OAuth2ClientCredentialsSchema`
  (it keeps `useResponsesApi`).
- Add an `AnthropicConfigSchema = z.object({ oauth2: OAuth2ClientCredentialsSchema.optional() }).strict()`.
- Extend every union / schema that lists allowed connection configs (at least
  `LLMConnectionConfigSchema`, the `config` union in `LLMApiKeySchema` in
  `packages/shared/src/server/llm/types.ts`, the tRPC input schema in
  `web/src/features/llm-api-key/types.ts`, and the public API schemas in
  `web/src/features/public-api/types/llm-connections.ts`). **VERIFY** with a repo-wide
  search for `OpenAIConfigSchema` and `LLMConnectionConfigSchema`; every place that
  accepts an OpenAI config must accept the new shape.
- `tokenEndpoint` must use `https:`. Reject anything else at write time.

### 4.3 Client assertion (exact contract — PingFederate rejects deviations)

A JWT signed with the private JWK:

| Part | Value |
|---|---|
| Header `alg` | `assertionAlgorithm` if set, else JWK `alg` if present, else `RS256` for `kty=RSA`, `ES256` for `kty=EC` |
| Header `kid` | the JWK `kid`, **only if present** (PingFederate selects the registered key by it) |
| Header `typ` | `JWT` |
| Claim `iss` | `clientId` |
| Claim `sub` | `clientId` |
| Claim `aud` | `tokenEndpoint` (exact string from config) |
| Claim `iat` | now (seconds) |
| Claim `exp` | now + 300 |
| Claim `jti` | random UUID v4, new for every assertion |

Use the `jose` library (`importJWK` + `SignJWT`). **VERIFY** whether `jose` is already a
dependency of `packages/shared`; if not, add it there. Do not hand-roll signing.

Supported `kty`: `RSA` and `EC`. Anything else → configuration error.
The JWK must contain the private part (`d`); a public-only JWK → configuration error.

### 4.4 Token request

```
POST {tokenEndpoint}
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer
&client_assertion=<signed JWT>
[&scope=<scope>]          # only when configured
```

- Timeout: 10 s.
- Non-200 → error `OAuth2 token endpoint returned <status>: <first 300 chars of body>`.
  Never include the assertion, the JWK, or a token in any error or log line.
- 200 without a string `access_token` → error `token response missing access_token`.
- `expires_in` missing or not an integer → treat as 300.
- The outbound call must go through the same SSRF protection used for LLM base URLs
  (`createSecureLlmFetch` / `validateLlmConnectionBaseURL` — **VERIFY** names) **and**
  the new allowlist in 4.6.

### 4.5 Token cache and call path

The single place where Langfuse turns a stored connection into credentials is
`openLLMConnection(connection)` in `packages/shared/src/server/llm/llmText.ts`
(**VERIFY**; it currently does `const apiKey = decrypt(connection.secretKey)` and builds
`extraHeaders` + `createFetch`). Every playground, judge, prompt-experiment and
test-connection call flows through it via `generateLLMText` / `streamLLMText`.

Change it so that, when `connection.config?.oauth2` is present:

1. Decrypt `secretKey` → parse JSON → JWK (parse once per call; cheap).
2. Get a token from an in-process cache (new module, e.g.
   `packages/shared/src/server/llm/oauth2ClientCredentials.ts`):
   - Cache key: SHA-256 of `tokenEndpoint | clientId | kid | scope` (never the JWK itself).
   - Return the cached token while `now < expiresAt`, where
     `expiresAt = fetchedAt + max(expires_in - 60, 0)` seconds.
   - **Single flight:** concurrent callers for the same key share one in-flight fetch
     (store the Promise in the map). A failed fetch is removed from the map so the next
     call retries.
   - Bound the cache size (e.g. 1 000 entries, evict oldest) — there are hundreds of projects.
3. Send `Authorization: Bearer <token>` to the gateway:
   - **openai** adapter: pass the token as `apiKey` (the OpenAI provider already sends
     `Authorization: Bearer <apiKey>`).
   - **anthropic** adapter: the Anthropic provider sends `apiKey` as `x-api-key`, which the
     gateway ignores. Use the provider's native bearer option if the installed
     `@ai-sdk/anthropic` supports one (**VERIFY**: `authToken`). Otherwise inject
     `Authorization: Bearer <token>` via headers and pass a non-secret placeholder as
     `apiKey` only if the provider refuses to construct without one.
   - In both cases `Authorization` must be in the list of sensitive headers that the secure
     fetch strips on cross-origin redirects.
4. If `openLLMConnection` is synchronous today, make it `async` and update its callers.
   This is expected to be the bulk of the diff. Keep the non-OAuth2 path behaviorally
   identical.
5. On a gateway **401** from an OAuth2 connection, drop that cache entry and retry the LLM
   call **once** with a fresh token. Any other status: no retry beyond what Langfuse does
   today.

Write-time rule: for an OAuth2 connection, reject `extraHeaders` containing
`Authorization` (case-insensitive) — it would conflict with the minted token.

### 4.6 SSRF allowlist for token endpoints (mandatory)

Without this, any project admin could make the Langfuse server POST to any URL.

- New env var `LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS`: comma-separated list of exact
  URLs (scheme + host + path, no wildcards). Add it to the env schemas of both `web` and
  `worker` (**VERIFY** `web/src/env.mjs` and the worker/shared env module).
- Unset or empty ⇒ the OAuth2 auth method is **disabled**: creating/updating such a
  connection fails with a clear error, and calls through an existing one fail with a clear
  error. No silent fallback.
- `tokenEndpoint` must match an entry exactly, checked at write time **and** at call time.

### 4.7 Validation on create / update / test

Extend `validateSecret` in `web/src/features/llm-api-key/server/llmConnectionService.ts`
(**VERIFY**) so that for an OAuth2 connection:

- `secretKey` parses as JSON, `kty` ∈ {RSA, EC}, has `d`; `importJWK` succeeds with the
  resolved algorithm.
- `tokenEndpoint` is https and on the allowlist.
- Error messages name the problem but never echo key material.

"Test connection" must perform a real token fetch followed by the existing test completion,
so a wrong client id / key / scope surfaces in the UI.

On **update**, the existing rule "leave the secret empty to keep the stored one" must keep
working for OAuth2 connections (the user can change `scope` without re-pasting the JWK).

### 4.8 UI

In `web/src/features/public-api/components/CreateLLMApiKeyForm.tsx` (**VERIFY**), for
adapters `openai` and `anthropic` add an **Authentication** select:
`API key` (default, current behavior) | `OAuth2 client credentials (private_key_jwt)`.

When OAuth2 is selected:

- The secret field label becomes "Private JWK (JSON)", multi-line textarea.
- Show inputs: Token endpoint (required), Client ID (required), Scope (optional),
  Assertion algorithm (optional select).
- Hide nothing else (base URL, custom models, extra headers stay).
- In the connection list, show the auth method and `displaySecretKey` (`kid:...`).
  Never show the JWK.

### 4.9 Public API

`PUT /api/public/llm-connections` (and the organization variant if it shares the schema)
accepts `config.oauth2` and a JWK string as `secretKey`, with the same validation as 4.7.
`GET` responses may include `config.oauth2` (it contains no secrets) and must never include
`secretKey`. This endpoint is how hundreds of agent projects get provisioned by automation.

### 4.10 Logging and telemetry

- Log (info) on each token fetch: connection id, token endpoint host, `expires_in`. Nothing else.
- Never log the JWK, the assertion, the access token, or full token-endpoint response bodies
  on success.
- Token-fetch failures that make an evaluator fail must surface through the existing
  evaluator block mechanism (`EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID` —
  **VERIFY**) so the project sees "auth invalid" instead of silent errors.

## 5. Tests (all must pass; follow the repo's existing test style)

Unit (`packages/shared`):

1. Assertion: header `alg`/`kid`/`typ` and claims `iss`/`sub`/`aud`/`iat`/`exp`/`jti` exactly
   per 4.3; verify the signature with the public part of a generated RSA JWK and an EC JWK.
2. `alg` resolution order: explicit config > JWK `alg` > kty default.
3. No `kid` header when the JWK has no `kid`.
4. Token request body is exactly per 4.4; `scope` present only when configured.
5. Cache: second call within validity makes no HTTP request; call after
   `expires_in - 60` refetches; `expires_in` missing ⇒ 300.
6. Single flight: 10 concurrent calls ⇒ 1 HTTP request.
7. Failed fetch is not cached; next call retries.
8. Non-200 and missing `access_token` produce the specified errors without secrets.
9. Allowlist: unset ⇒ disabled error; endpoint not listed ⇒ error; exact match ⇒ ok.
10. Public-only JWK and unsupported `kty` ⇒ configuration error.

Integration (worker, use a local HTTP server like the existing `secureLlmFetch` tests):

11. OpenAI adapter + OAuth2 connection: a fake token endpoint and a fake
    `/v1/chat/completions`; assert the completion request carries
    `Authorization: Bearer <token from fake endpoint>`.
12. Same for the Anthropic adapter (`/v1/messages`), asserting the bearer header.
13. Gateway answers 401 once, then 200 ⇒ exactly one token refetch and one retry.
14. Non-OAuth2 connections: existing test suite unchanged and green.

Web server tests:

15. Create / update / test via tRPC and via `PUT /api/public/llm-connections`; stored
    `secretKey` is encrypted, `displaySecretKey` is `kid:<kid>`, responses never contain
    the JWK.
16. Update with empty secret keeps the stored JWK.
17. `Authorization` in `extraHeaders` on an OAuth2 connection is rejected.

## 6. Acceptance criteria

- [ ] A project admin can create an OAuth2 connection in the UI and via the public API.
- [ ] "Test connection" succeeds against a real PingFederate + RBI GenAI Gateway pair.
- [ ] An LLM-as-a-Judge evaluator using that connection scores live traces for more than
      2× the token lifetime with no manual action (proves refresh).
- [ ] Two projects with different client ids each get their own token; neither ever sends
      the other's token (assert via the cache key test and a manual check of gateway logs).
- [ ] With `LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS` unset, the feature is unusable and
      says so; API-key connections are unaffected.
- [ ] No secret material appears in logs, API responses, UI, or error messages.
- [ ] All existing Langfuse tests pass.

## 7. Deployment notes (our infra, not the fork)

Infrastructure lives in a separate CDK repo (`rbcz-aap-cicd-artifacts` +
`rbcz-aap-cicd-environment-prod/prod.yml`). After the fork image is built:

- Point `application_versions.langfuse-websrv` and `langfuse-worker` at the fork images.
- Add to **both** containers' `environment`:
  `LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS: https://login.rbinternational.com/as/token.oauth2`
- Both tasks need outbound HTTPS to `login.rbinternational.com` and `genai.rbi.tech`.
- If the gateway host resolves to private IPs, add it to
  `LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST` (existing Langfuse setting).

## 8. Reference values

| Item | Value |
|---|---|
| Token endpoint (prod) | `https://login.rbinternational.com/as/token.oauth2` |
| Gateway base URL (openai adapter) | `https://genai.rbi.tech/v1` (**VERIFY** with the gateway team) |
| Default assertion algorithm | `RS256` |
| Assertion lifetime | 300 s |
| Refresh margin | 60 s before `expires_in` |
| Token HTTP timeout | 10 s |

Example private JWK shape (values elided — never commit a real one):

```json
{ "kty": "RSA", "kid": "agent-x-2026", "alg": "RS256", "n": "...", "e": "AQAB", "d": "...", "p": "...", "q": "...", "dp": "...", "dq": "...", "qi": "..." }
```

A working reference implementation of the same flow in Python (assertion, request, cache,
refresh margin) exists in the FinOps agent at
`rbcz-aws-agents-finops/agent/src/finops_agent/auth/oidc.py`. Section 4.3 and 4.4 are the
binding contract; the Python file is only a cross-check.

## 9. Delivery

- One PR on the fork, branch `feat/llm-connection-oauth2-private-key-jwt`.
- Keep the change additive and isolated (new module + schema extensions + the call-path
  change) so it can be rebased onto upstream releases and offered upstream.
- PR description lists every **VERIFY** item from this spec and what was found.
