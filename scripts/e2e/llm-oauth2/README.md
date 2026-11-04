# OAuth2 LLM connections: docker-compose end-to-end harness

Runs Langfuse built from this branch against a real Keycloak and a fake LLM
gateway, and checks OAuth2 client credentials on LLM connections end to end
through the public API. It is run by hand (or by an agent), not in CI.

## What is in here

| File                           | Purpose                                                                                                                                                                                                                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker-compose.oauth2.yml`    | Override for `docker-compose.build.yml`: adds `keycloak` and `fake-llm`, turns on OAuth2 for `langfuse-web` / `langfuse-worker`, sets the `LANGFUSE_INIT_*` org, project and API keys. Compose project name `lf-oauth2-e2e`.                                                                                      |
| `keycloak/realm.template.json` | Realm `lf-e2e`, access token lifespan 120 s, one confidential client with a service account per auth method: `cs-basic`, `cs-post` (client secret), `cs-jwt` (Signed JWT with client secret), `pk-jwt` (Signed JWT, public key from `generated/`).                                                                |
| `fake-llm/server.mjs`          | Node built-ins only. `/v1/chat/completions` (OpenAI) and `/v1/messages` (Anthropic) verify the bearer token as an RS256 JWT against the realm JWKS (signature + `exp`) and return a judge-shaped answer. `/fault/token` proxies to the Keycloak token endpoint with fault modes. `/control`, `/stats`, `/health`. |
| `setup.sh`                     | Generates an RSA key pair (JWK with `kid`) and random client secrets into `generated/` and renders `generated/realm.json`.                                                                                                                                                                                        |
| `compose.env`                  | Interpolation file passed with `--env-file`, so Compose does not read the repository-root `.env`. Keeps `NEXT_PUBLIC_LANGFUSE_CLOUD_REGION` empty (self-hosted mode).                                                                                                                                             |
| `run-scenarios.mjs`            | Node built-ins only. Runs the scenarios, prints `PASS`/`FAIL` per scenario, saves the output to `generated/last-run.txt`, exits non-zero on any `FAIL`.                                                                                                                                                           |

`generated/` is git-ignored. No key material is committed.

Host ports: Langfuse `3000` (web), `3030` (worker), Keycloak `18080` and
fake-llm `18090` (both bound to `127.0.0.1` only), plus the ports of `docker-compose.build.yml` (Postgres `5432`, Redis
`6379`, ClickHouse `8123`/`9000`, MinIO `9090`/`9091`). Stop the local dev
infra first (`pnpm run infra:dev:down`) or those ports clash.

## Run

From the repository root:

```bash
E2E_COMPOSE="docker compose --env-file scripts/e2e/llm-oauth2/compose.env \
  -f docker-compose.build.yml -f scripts/e2e/llm-oauth2/docker-compose.oauth2.yml"
bash scripts/e2e/llm-oauth2/setup.sh
$E2E_COMPOSE build langfuse-worker   # one image at a time; parallel builds
$E2E_COMPOSE build langfuse-web      # can hit DNS errors (retry once)
$E2E_COMPOSE up -d --wait
node scripts/e2e/llm-oauth2/run-scenarios.mjs
$E2E_COMPOSE down -v
```

Always pass `--env-file scripts/e2e/llm-oauth2/compose.env`. Without it,
Compose fills the `${VAR:-default}` values of `docker-compose.build.yml` from
the repository-root `.env`: its `localhost` service URLs break the containers,
and a `NEXT_PUBLIC_LANGFUSE_CLOUD_REGION` there is baked into the web image at
build time, which turns the stack into Cloud mode (no `http` token endpoints,
no host whitelist). An image built that way has to be rebuilt.

The run takes about 5 minutes (two waits for token expiry). It can be run
again against the same stack: it first deletes evaluators and evaluation
rules named `e2e-*`, re-enables `pk-jwt` and resets fake-llm. `setup.sh`
keeps existing key material; `setup.sh --force` regenerates it, which needs a
`down` first because Keycloak only imports the realm into a fresh container.

UI login (local test values): `e2e@langfuse.local` / `e2e-password`, project
`OAuth2 e2e`.

## Configuration on the Langfuse side

```
LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS=http://keycloak:8080/realms/lf-e2e/protocol/openid-connect/token,http://fake-llm:8090/fault/token
LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST=keycloak,fake-llm
LANGFUSE_LLM_OAUTH2_TOKEN_MAX_RETRIES=2
```

The token endpoints are plain `http`, which is only allowed because their
hosts are also in `LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST` (self-hosted
only). The same list lets the connections use `http://fake-llm:8090` as base
URL.

## Scenarios

| #   | Scenario                                                                                                                                                                                                          | What it proves                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Preflight                                                                                                                                                                                                         | Langfuse, Keycloak and fake-llm are up; leftovers from an earlier run are removed.                                                                                                                                                          |
| 1   | `PUT /api/public/llm-connections` for the Keycloak preset × 4 auth methods × 2 adapters, and Custom `private_key_jwt` (`assertionAudience` = token endpoint) × 2 adapters → 200/201                               | Every method/adapter passes write-time validation (schema, allowlist, `http` rule, JWK parsing); no response echoes secret material.                                                                                                        |
| 1b  | One LLM-as-a-Judge evaluator per connection on one rule, one trace → every job `COMPLETED`, one score each                                                                                                        | Every method × adapter really gets a token from Keycloak (basic, post, HS256 assertion, RS256 assertion with issuer `aud` and with token-endpoint `aud`) and the gateway accepts it (`Authorization: Bearer`, no `x-api-key` on Anthropic). |
| 2   | Evaluator on `e2e-kc-private_key_jwt-openai`, ingest a span (OTLP JSON) → score                                                                                                                                   | The live evaluator path (worker) works with OAuth2.                                                                                                                                                                                         |
| 3   | Wait 125 s (> 120 s token lifespan), ingest again → score, fake-llm saw a new token                                                                                                                               | Cached tokens are refreshed before they expire.                                                                                                                                                                                             |
| 4   | `POST /control {gateway401Once: true}`, ingest → score; fake-llm saw exactly one injected 401 and a new token                                                                                                     | A gateway 401 drops the cached token, fetches a new one and retries once.                                                                                                                                                                   |
| 5   | Connection with token endpoint `/fault/token` (Custom, `client_secret_basic`), `tokenMode: "503"`, ingest → job `ERROR` containing `unavailable after 3 attempts`, proxy saw 3 attempts, evaluator still `active` | Transient token failures are retried (`MAX_RETRIES=2` ⇒ 3 attempts), then fail without blocking the evaluator.                                                                                                                              |
| 6   | Disable Keycloak client `pk-jwt` via the admin API, wait 65 s for the cached token to age out, ingest → job `ERROR`, evaluator `paused` with `LLM_CONNECTION_AUTH_INVALID`                                        | A rejected credential (`401 invalid_client`) blocks the evaluator. The client is re-enabled afterwards.                                                                                                                                     |
| 7   | `PUT` with a token endpoint not on the allowlist → 400 naming the endpoint (`... not in LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS: <url>`)                                                                      | The allowlist is enforced at write time.                                                                                                                                                                                                    |
| 8   | `docker compose logs langfuse-web langfuse-worker` searched for the JWK `d`, the client secrets and JWT-shaped strings (`eyJ….eyJ….…`)                                                                            | No credential or token is logged. Only counts are printed, never the matched value.                                                                                                                                                         |

Expected output (shape):

```
=== 1. PUT connection per method x adapter (Keycloak preset x4, Custom private_key_jwt x2)
  - e2e-kc-client_secret_basic-openai: 201
  ...
PASS 1. PUT connection per method x adapter (...) (10 connections)
...
Summary: 10 passed, 0 failed
```

The script reads job executions straight from Postgres
(`docker compose exec postgres psql`), because the public API does not expose
them. Scores come from `GET /api/public/v3/scores` (the v1/v2 score reads
answer 404 in the default v4 `events_only` mode), evaluator status from
`GET /api/public/v2/evaluators/{id}`.

## Fake LLM

Judge answer: the evaluator asks for a structured object
`{ score, scoreExplanation }` (see
`packages/shared/src/server/evals/llmEvaluatorExecution.ts`). fake-llm fills
whatever JSON schema the request carries:

- OpenAI-compatible (`createOpenAICompatible` with structured outputs):
  `response_format.json_schema.schema` → `choices[0].message.content` is the
  JSON text. A forced function tool call is answered with `tool_calls`.
- Anthropic: unknown model ids (`fake-judge`) use the AI SDK's `jsonTool`
  mode, a forced tool named `json` → answered with a `tool_use` block whose
  `input` is the object. `output_config.format.schema` (native structured
  output) is answered with a JSON text block.

Values: numbers get the schema `maximum` (else `1`), booleans `true`, enums
their first value, strings a fixed sentence. Streaming is not supported
(answers 400).

Control and inspection (host port 18090):

```bash
curl -X POST localhost:18090/control -H 'content-type: application/json' \
  -d '{"tokenMode":"503"}'          # "ok" | "503" | "slow" (15 s delay, then proxy)
curl -X POST localhost:18090/control -H 'content-type: application/json' \
  -d '{"gateway401Once":true}'      # next valid LLM request gets a 401
curl -X POST localhost:18090/control -H 'content-type: application/json' \
  -d '{"reset":true}'               # zero the counters
curl localhost:18090/stats          # counters, token fingerprints (sha256, 12 hex) with azp/iat
```

fake-llm logs a SHA-256 fingerprint of each token, never the token itself.
