# Are coding agents still advised to use Langfuse legacy APIs?

Research snapshot from primary sources: `langfuse/langfuse` (this checkout), plus shallow clones of `langfuse-docs`, `langfuse-python`, `langfuse-js`, `langfuse/skills`, `langfuse-cli`, `mcp-server-langfuse`, and `langfuse-examples` (cloned 2026-09-16). Org GitHub code search over `AGENTS.md` / `SKILL.md` / READMEs.

**TL;DR:** Intentional agent guidance (public skill, CLI tips, Python SDK README, deprecation FAQ) tells agents **not** to use legacy read/write APIs for new work. Agents are **still advised** to use the `api.legacy.*` SDK namespace in one documented case: **current SDK + self-hosted Langfuse v3**. Several high-traffic surfaces still *show* deprecated APIs as the example (`@langfuse/client` README, Python `Langfuse.api` docstring, JS `fetchObservation` implementation, Python `batch_evaluation`). CLI `__schema` still lists `traces` and `legacy-*` resources; only the skill’s CLI reference tells agents to skip them.

## 1. What “legacy APIs” means

“Legacy” is not one thing. In current Langfuse sources it is at least five families.

### 1.1 Deprecated public REST (v3 data model) — the main “legacy APIs”

Server Fern marks these `availability.status: deprecated`. Cloud sunset is **2026-11-16** (`V3_SUNSET_DATE` in `web/src/features/public-api/server/deprecations.ts`). Self-hosted keeps them until the deployment is on v4 `events_only`.

Canonical mapping (docs FAQ, all paths under `/api/public`):

| Deprecated | Replacement |
| --- | --- |
| `GET /observations`, `GET /observations/{id}` | `GET /v2/observations` |
| `GET /traces`, `GET /traces/{id}` | `GET /v2/observations` filtered by `traceId` |
| `GET /sessions`, `GET /sessions/{id}` | `GET /v2/observations` filtered by `sessionId` |
| `GET /metrics`, `GET /metrics/daily` | `GET /v2/metrics` |
| `GET /scores`, `GET /scores/{id}`, `GET /v2/scores` | `GET /v3/scores` |
| Dataset-run reads/writes (`GET/POST /dataset-run-items`, `GET /datasets/{name}/runs…`) | Experiments API / experiment runner SDK |
| Trace/observation events on `POST /ingestion`, plus `POST /traces`, `/spans`, `/generations`, `/events` | `POST /otel/v1/traces` (OTLP). `score-create` on ingestion is **not** deprecated. |

Fern sources: `fern/apis/server/definition/legacy/{observations-v1,metrics-v1,score-v1}.yml`, `trace.yml`, `sessions.yml`, `ingestion.yml`, `datasets.yml`, `dataset-run-items.yml`, `scores.yml`.

SDK aliases for the v1 observation/metrics/score **read** clients live under `client.api.legacy.*`:

- Python: `api.legacy.observations_v1`, `api.legacy.metrics_v1`, `api.legacy.score_v1`
- JS/TS: `api.legacy.observationsV1`, `api.legacy.metricsV1`, `api.legacy.scoreV1`

Those names are **not** the only deprecated SDK methods. `api.trace.list` / `api.trace.get` call `GET /traces` and are also deprecated, but they were **not** moved under `api.legacy.*`.

Cloud can 410 new orgs that hit deprecated GETs (`LEGACY_API_UNAVAILABLE_FOR_NEW_ORGANIZATION` in `web/src/features/public-api/server/legacyApiOrganizationCutoff.ts`).

Worker job `v4LegacyApiUsage*` tracks remaining production callers of these deprecated public APIs.

### 1.2 Legacy SDK tracing clients (pre-OpenTelemetry)

Separate from REST. Current SDK READMEs call these out as do-not-use for new instrumentation:

- Python v2/v3 style: `Langfuse().trace()`, `.span()`, `.generation()`, `api.trace.list` (`langfuse-python/README.md`).
- JS unscoped npm packages: `langfuse`, `langfuse-core`, `langfuse-node`, `langfuse-langchain` — `new Langfuse()`, `trace()`, `span()`, `api.traceList` (`langfuse-js/README.md`). Current packages are `@langfuse/*`.

Replacement: Python `get_client()` + `start_as_current_observation` / `@observe`; JS `@langfuse/tracing` + `@langfuse/otel`.

### 1.3 Legacy evaluators (product, not REST namespace)

Trace-level and dataset-item LLM-as-a-Judge rules. UI labels them Legacy. Public skill has `references/trace-evaluator-upgrade.md` to migrate them **off** that model, not to keep using it.

### 1.4 Legacy export sources / write modes

Blob export `LEGACY_TRACES_OBSERVATIONS`. Self-host `LANGFUSE_MIGRATION_V4_WRITE_MODE=legacy`. These are operator/migration knobs, not coding-agent REST recipes.

### 1.5 Other “legacy” that is out of scope

Internal auth migration (`API_AUTH_MIGRATION=legacy`), eval-rule `mappingType: legacy`, CLI npm package `langfuse-cli` vs a deprecated package name, BullMQ schedule cleanup. Not public product APIs for agents.

## 2. What agents are told to use instead

Primary agent-facing corpus:

| Surface | What it tells agents |
| --- | --- |
| `langfuse/skills` `SKILL.md` | Use latest SDKs/APIs. Fetch docs from `llms.txt`. Prefer CLI over raw REST. |
| `skills/.../references/cli.md` | Prefer `observations` / `metrics` / `scores` over `legacy-*-v1s`. **Always query via `observations`, not `traces`.** |
| Docs FAQ `deprecated-api-migration.mdx` | Explicitly “for programmatic use, e.g. by coding agents”; full endpoint + SDK method map. |
| Docs `query-via-sdk.mdx`, `public-api.mdx` | Defaults are `api.observations` and `api.metrics`. `api.legacy.*` calls deprecated endpoints. |
| Python SDK README | Do not use `trace()` / `api.trace.list`. Query with Observations API v2. |
| JS SDK root README | Do not `npm install langfuse`. Query with Observations API v2, not `GET /traces`. |
| Fern `api.yml` | Only live path: OTel ingest + `GET /v2/observations` + `GET /v2/metrics`. |

The dedicated “Langfuse for coding agents” marketing page (`md-override/coding-agents.md`) is about **observing coding-agent spend**, not about which Langfuse REST surface those agents should call.

`mcp-server-langfuse` is **prompt management only**. The in-product MCP (`/api/public/mcp`) is documented as secondary to the skill for agents that can run a CLI.

## 3. Where agents are still pointed at legacy APIs

### Still advised on purpose (compatibility)

These pages **tell** a current SDK to call `api.legacy.*` when the **server** is still Langfuse v3:

- Docs self-host matrix: `content/self-hosting/upgrade/versioning.mdx` — “Use the legacy APIs `api.legacy.observations_v1` / `api.legacy.metrics_v1`”.
- v3→v4 upgrade FAQ: “use `client.api.legacy.*` in the meantime”.
- Python/JS SDK upgrade guides: checklist item “move to `api.legacy.observations_v1`” when querying a v3 server; default `api.observations` requires server v4.
- Compatibility page: “use the `api.legacy.*` resources until you upgrade your server to v4”.
- Data-migration cookbook: against a v3 **source**, `src.api.legacy.observations_v1.get_many` and `api.legacy.score_v1.create` are “the only option”.

That is the remaining official “please use legacy APIs” advice. It is scoped to **v3 servers / v3 sources**, not to Langfuse Cloud / v4.

### Still shown as the example (agents will copy this)

These are current default-branch files an agent will hit before the FAQ:

1. **`langfuse-js/packages/client/README.md` quickstart** still has:

   `const trace = await langfuse.api.trace.get("trace-id");`

   That is a deprecated GET. The package README also links `https://langfuse.com/llms.txt`, so this is in the agent path.

2. **Python `Langfuse.api` docstring** (`langfuse/_client/client.py`) still teaches `api.trace.get` / `api.trace.list` as how to fetch traces, then (correctly) says prefer v2 `api.observations` and that `api.legacy.*` is “not recommended for new workflows”. Mixed signal in one docstring.

3. **JS `LangfuseClient.fetchObservation`** is `@deprecated Use api.observations.get` but is **bound to** `api.legacy.observationsV1.get`. `fetchObservations` already goes to v2. Agents that follow the deprecated helper, or copy e2e tests, hit v1.

4. **Python `langfuse/batch_evaluation.py`** still pages with `api.trace.list` and `api.legacy.observations_v1.get_many`. Production SDK code, not just tests.

5. **SDK test suites** (Python live_provider/e2e, JS openai e2e) still assert via `api.legacy.observations_v1` / `observationsV1`. Agents working *in* the SDK repos will imitate that.

6. **CLI `__schema`** still exposes `traces` and `legacy-observations-v1s` / `legacy-metrics-v1s` / `legacy-score-v1s`. The skill’s CLI reference counters this; an agent that only reads `__schema` can still pick them.

7. **Public skill instrumentation reference** still lists “Trace input/output” as a baseline. That matches the **v3 trace object**. The v4 skill (`v4-project-migration.md`) separately says not to add `set_current_trace_io()` just to keep legacy evaluators alive. Mild contradiction for agents instrumenting apps.

### Not advising legacy (checked)

- `langfuse/langfuse` `AGENTS.md` / package `AGENTS.md`: no instruction to call public legacy REST. “Legacy” there is BullMQ schedules, eval IDs, seed scenarios.
- `langfuse-python/AGENTS.md` and `langfuse-js/AGENTS.md`: maintainer workflow only; they do **not** tell coding agents which public API generation to use.
- Public skill `SKILL.md` and `references/cli.md`: actively anti-legacy for Cloud/v4.
- GitHub `gh search code --owner langfuse --filename SKILL.md "legacy"`: only the evaluator-upgrade and v4-migration playbooks (migrate **away**).

## 4. Answer

**On Langfuse Cloud and v4 servers: no, coding agents are not supposed to use legacy APIs.** The skill, CLI tips, Python/JS root READMEs, Fern API intro, and the agent-oriented deprecation FAQ all point at Observations/Metrics v2, Scores v3, OTel ingest, and experiments.

**Yes, they are still advised to use `api.legacy.*` when talking to a self-hosted v3 server** (or a v3 migration source). That is documented on purpose in compatibility and SDK upgrade pages.

**Yes, they can still be *accidentally* steered onto legacy APIs** by copy-paste surfaces that have not been updated: JS client README `api.trace.get`, Python `api` docstring + `batch_evaluation`, JS `fetchObservation` → v1, SDK tests, and unfiltered CLI schema.

Highest-leverage cleanups if the goal is “agents never start on v1”:

1. Replace the `@langfuse/client` README REST example with `api.observations.getMany`.
2. Rewrite the Python `api` property docstring so `api.trace.*` is not the first fetch pattern.
3. Point `fetchObservation` at v2 (or delete it) so the deprecation text matches the binding.
4. Keep CLI `__schema` but make resource descriptions / skill discovery even louder; the skill already has the right prefer-rules.

## Sources

- `langfuse/langfuse`: `fern/apis/server/definition/{api,trace,ingestion,legacy/*}.yml`, `web/src/features/public-api/server/{deprecations,legacyApiOrganizationCutoff}.ts`, `packages/shared/src/server/v4/legacyApiUsage.ts`
- `langfuse/langfuse-docs`: `content/faq/all/deprecated-api-migration.mdx`, `content/docs/api-and-data-platform/features/{public-api,query-via-sdk,cli,agent-skill}.mdx`, `content/self-hosting/upgrade/{versioning,upgrade-guides/upgrade-v3-to-v4}.mdx`, `content/docs/observability/sdk/upgrade-path/{python-v3-to-v4,js-v4-to-v5}.mdx`
- `langfuse/langfuse-python`: `README.md`, `langfuse/_client/client.py`, `langfuse/batch_evaluation.py`, `langfuse/api/legacy/`
- `langfuse/langfuse-js`: `README.md`, `packages/client/README.md`, `packages/client/src/LangfuseClient.ts`
- `langfuse/skills`: `skills/langfuse/SKILL.md`, `references/{cli,instrumentation,v4-project-migration,trace-evaluator-upgrade}.md`
- `langfuse/langfuse-cli`: OpenAPI-driven `legacy-*` resource names
- `langfuse/mcp-server-langfuse`: prompts only
