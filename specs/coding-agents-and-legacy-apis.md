# Are coding agents still advised to use Langfuse legacy APIs?

Research snapshot from primary sources: `langfuse/langfuse` (this checkout), plus shallow clones of `langfuse-docs`, `langfuse-python`, `langfuse-js`, `langfuse/skills`, `langfuse-cli`, `mcp-server-langfuse`, and `langfuse-examples` (cloned 2026-09-16). Org GitHub code search over `AGENTS.md` / `SKILL.md` / READMEs.

**TL;DR:** Intentional agent guidance (public skill, CLI tips, Python SDK README, deprecation FAQ) tells agents **not** to use legacy read/write APIs for new work. Agents are **still advised** to use the `api.legacy.*` SDK namespace in one documented case: **current SDK + self-hosted Langfuse v3**. Several high-traffic surfaces still _show_ deprecated APIs as the example (`@langfuse/client` README, Python `Langfuse.api` docstring, JS `fetchObservation` implementation, Python `batch_evaluation`). CLI `__schema` still lists `traces` and `legacy-*` resources; only the skill’s CLI reference tells agents to skip them. In this server repo, `CONTRIBUTING.md` still describes batch `/api/public/ingestion` as current system behavior; in-product MCP observation tools already use Observations v2.

## 1. What “legacy APIs” means

“Legacy” is not one thing. In current Langfuse sources it is at least five families.

### 1.1 Deprecated public REST (v3 data model) — the main “legacy APIs”

Server Fern marks these `availability.status: deprecated`. Cloud sunset is **2026-11-16** (`V3_SUNSET_DATE` in `web/src/features/public-api/server/deprecations.ts`). Self-hosted keeps them until the deployment is on v4 `events_only`.

Canonical mapping (docs FAQ, all paths under `/api/public`):

| Deprecated                                                                                              | Replacement                                                                       |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `GET /observations`, `GET /observations/{id}`                                                           | `GET /v2/observations`                                                            |
| `GET /traces`, `GET /traces/{id}`                                                                       | `GET /v2/observations` filtered by `traceId`                                      |
| `GET /sessions`, `GET /sessions/{id}`                                                                   | `GET /v2/observations` filtered by `sessionId`                                    |
| `GET /metrics`, `GET /metrics/daily`                                                                    | `GET /v2/metrics`                                                                 |
| `GET /scores`, `GET /scores/{id}`, `GET /v2/scores`                                                     | `GET /v3/scores`                                                                  |
| Dataset-run reads/writes (`GET/POST /dataset-run-items`, `GET /datasets/{name}/runs…`)                  | Experiments API / experiment runner SDK                                           |
| Trace/observation events on `POST /ingestion`, plus `POST /traces`, `/spans`, `/generations`, `/events` | `POST /otel/v1/traces` (OTLP). `score-create` on ingestion is **not** deprecated. |

Fern sources: `fern/apis/server/definition/legacy/{observations-v1,metrics-v1,score-v1}.yml`, `trace.yml`, `sessions.yml`, `ingestion.yml`, `datasets.yml`, `dataset-run-items.yml`, `scores.yml`.

SDK aliases for the v1 observation/metrics/score **read** clients live under `client.api.legacy.*`:

- Python: `api.legacy.observations_v1`, `api.legacy.metrics_v1`, `api.legacy.score_v1`
- JS/TS: `api.legacy.observationsV1`, `api.legacy.metricsV1`, `api.legacy.scoreV1`

Those names are **not** the only deprecated SDK methods. `api.trace.list` / `api.trace.get` call `GET /traces` and are also deprecated, but they were **not** moved under `api.legacy.*`.

Cloud can 410 new orgs that hit deprecated GETs (`LEGACY_API_UNAVAILABLE_FOR_NEW_ORGANIZATION` in `web/src/features/public-api/server/legacyApiOrganizationCutoff.ts`). On `events_only`, the same routes 404 via `rejectInEventsOnlyMode`.

Worker job `v4LegacyApiUsage*` tracks remaining production callers of these deprecated public APIs.

Write shortcuts that share the v3 ingestion pipeline (code-labeled Legacy, `rateLimitResource: "legacy-ingestion"`): `POST /traces`, `POST/PATCH /spans`, `POST/PATCH /generations`, `POST /events`. `GET /metrics/daily` carries the metrics deprecation in the Next handler but is not in Fern’s deprecated operation list. Prompt `GET/POST /prompts` (v1) vs `/v2/prompts` is an older split; v1 is not Fern-`deprecated`.

### 1.2 Legacy SDK tracing clients (pre-OpenTelemetry)

Separate from REST. Current SDK READMEs call these out as do-not-use for new instrumentation:

- Python v2/v3 style: `Langfuse().trace()`, `.span()`, `.generation()`, `api.trace.list` (`langfuse-python/README.md`).
- JS unscoped npm packages: `langfuse`, `langfuse-core`, `langfuse-node`, `langfuse-langchain` — `new Langfuse()`, `trace()`, `span()`, `api.traceList` (`langfuse-js/README.md`). Current packages are `@langfuse/*`.

Replacement: Python `get_client()` + `start_as_current_observation` / `@observe`; JS `@langfuse/tracing` + `@langfuse/otel`.

Important false positive: Python `from langfuse import Langfuse` / `Langfuse()` remains a current v4 constructor. The legacy call is `langfuse.trace()` (and its span/generation object model), not construction itself. Likewise, OTel attributes named `langfuse.trace.*`, `POST /ingestion` with `score-create`, and trace deletion endpoints are current uses of trace vocabulary, not deprecated trace reads.

### 1.3 Legacy evaluators (product, not REST namespace)

Trace-level and dataset-item LLM-as-a-Judge rules. UI labels them Legacy. Public skill has `references/trace-evaluator-upgrade.md` to migrate them **off** that model, not to keep using it.

### 1.4 Legacy export sources / write modes

Blob export `LEGACY_TRACES_OBSERVATIONS`. Self-host `LANGFUSE_MIGRATION_V4_WRITE_MODE=legacy`. These are operator/migration knobs, not coding-agent REST recipes.

### 1.5 Other “legacy” that is out of scope

Internal auth migration (`API_AUTH_MIGRATION=legacy`), eval-rule `mappingType: legacy`, CLI npm package `langfuse-cli` vs a deprecated package name, BullMQ schedule cleanup. Not public product APIs for agents.

## 2. What agents are told to use instead

Primary agent-facing corpus:

| Surface                                    | What it tells agents                                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `langfuse/skills` `SKILL.md`               | Use latest SDKs/APIs. Fetch docs from `llms.txt`. Prefer CLI over raw REST.                                          |
| `skills/.../references/cli.md`             | Prefer `observations` / `metrics` / `scores` over `legacy-*-v1s`. **Always query via `observations`, not `traces`.** |
| Docs FAQ `deprecated-api-migration.mdx`    | Explicitly “for programmatic use, e.g. by coding agents”; full endpoint + SDK method map.                            |
| Docs `query-via-sdk.mdx`, `public-api.mdx` | Defaults are `api.observations` and `api.metrics`. `api.legacy.*` calls deprecated endpoints.                        |
| Python SDK README                          | Do not use `trace()` / `api.trace.list`. Query with Observations API v2.                                             |
| JS SDK root README                         | Do not `npm install langfuse`. Query with Observations API v2, not `GET /traces`.                                    |
| Fern `api.yml`                             | Only live path: OTel ingest + `GET /v2/observations` + `GET /v2/metrics`.                                            |

The dedicated “Langfuse for coding agents” marketing page (`md-override/coding-agents.md`) is about **observing coding-agent spend**, not about which Langfuse REST surface those agents should call.

`mcp-server-langfuse` is **prompt management only**. The in-product MCP (`POST /api/public/mcp`) is documented as secondary to the skill for agents that can run a CLI. Its observation tools call **Observations v2** (`getObservationsV2FromEventsTableForPublicApi`); they do not wrap `GET /traces`. Dataset-run MCP tools are blocked in `events_only`.

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

5. **SDK test suites** (Python live*provider/e2e, JS openai e2e) still assert via `api.legacy.observations_v1` / `observationsV1`. Agents working \_in* the SDK repos will imitate that.

6. **CLI `__schema`** still exposes `traces` and `legacy-observations-v1s` / `legacy-metrics-v1s` / `legacy-score-v1s`. The skill’s CLI reference counters this; an agent that only reads `__schema` can still pick them.

7. **Public skill instrumentation reference** still lists “Trace input/output” as a baseline. That matches the **v3 trace object**. The v4 skill (`v4-project-migration.md`) separately says not to add `set_current_trace_io()` just to keep legacy evaluators alive. Mild contradiction for agents instrumenting apps.

8. **`CONTRIBUTING.md` “System behavior / Ingestion API”** still documents `(/public/api/ingestion)` as how the system works (validate, upsert `traces`/`observations`, `207`) with **no OTel replacement or deprecation**. An agent that only reads contributor docs can treat batch ingestion as the current write path. Fern `api.yml` and `deprecations.ts` already say otherwise.

### Not advising legacy (checked)

- `langfuse/langfuse` `AGENTS.md` / package `AGENTS.md`: no instruction to call public legacy REST. “Legacy” there is BullMQ schedules, eval IDs, seed scenarios.
- `langfuse-python/AGENTS.md` and `langfuse-js/AGENTS.md`: maintainer workflow only; they do **not** tell coding agents which public API generation to use.
- Public skill `SKILL.md` and `references/cli.md`: actively anti-legacy for Cloud/v4.
- GitHub `gh search code --owner langfuse --filename SKILL.md "legacy"`: only the evaluator-upgrade and v4-migration playbooks (migrate **away**).

## 4. Deep audit of the documentation surface

The docs need to be assessed as an agent retrieval system, not only as current product pages.

### Agent discoverability

- Live `https://langfuse.com/llms.txt` tells agents to install the public skill before implementing, points at the current API reference, and lists Docs, Integrations, and Self-Hosting titles inline. FAQ, guides, resources, blog, and changelog are one hop away in section indexes.
- The live `llms-docs.txt` prominently includes **Observations API**, **Public API**, **Query via SDKs**, current SDK upgrade guides, and **Versions & Compatibility**. These are internally consistent about v4.
- The live `llms-faq.txt` contains both the canonical **deprecated API migration** page and **Missing events after POST /api/public/ingestion**. A generic agent search can therefore retrieve either current migration guidance or a legacy troubleshooting recipe.
- `scripts/copy_md_sources.js` appends an “Agent Instructions” footer to nearly every Markdown page. It sends agents to semantic search, `llms.txt`, the public skill, the API reference, and the CLI. This is strong global steering, but the footer says the CLI can “read or write traces” without adding “via observations/OTel”; the skill must supply that distinction.
- Changelog Markdown gets an additional machine-readable warning: examples are historical and must not be used for implementation. Blogs do **not** get that warning.
- `llms-blog.txt` indexes old and new blog posts together. This includes pages with legacy snippets, so blogs remain directly discoverable even though they are not inline in the main `llms.txt`.
- Marketing landing pages including `/agents` and `/coding-agents` are intentionally excluded from `llms.txt`; an agent following the generated index reaches the skill/current docs instead.
- The docs MCP's direct-page tool warns that changelog examples are historical. Its semantic-search tool has no equivalent instruction, and the search provider indexes the wider corpus, so stale changelog/blog excerpts can still arrive without that guardrail.

### Current docs that correctly steer away from legacy

- `content/faq/all/deprecated-api-migration.mdx` is the canonical and most complete answer. It explicitly says its Markdown is for coding agents, maps every deprecated REST/SDK method, and distinguishes the surviving `score-create` event.
- `content/docs/api-and-data-platform/features/{public-api,query-via-sdk}.mdx`, `components-mdx/compat/detail-v1-read-apis.mdx`, and current SDK overview/upgrade pages consistently recommend Observations/Metrics v2, Scores v3, experiments, and OTel.
- `content/integrations/native/opentelemetry/{index,migration-to-v4}.mdx` explicitly says OTLP replaces `POST /api/public/ingestion`.
- Current engineering resources sampled in depth (`deepeval`, `golden-dataset-evaluation`, `chatbot-intent-analytics`, Ragas, human-in-the-loop scoring, external evaluation pipelines) query root observations through `api.observations.get_many`, not trace GETs.

### Intentional compatibility guidance (safe when read in context)

- `content/self-hosting/upgrade/versioning.mdx`, `content/docs/compatibility.mdx`, the Python/JS upgrade guides, and `components-mdx/compat/detail-read-apis-v2.mdx` tell **current SDK + OSS v3 server** users to use `api.legacy.*`. The tables make the server-version constraint explicit.
- `content/guides/cookbook/example_data_migration{,-jp}.mdx` uses `api.trace.list` and `api.legacy.observations_v1` only against a v3 migration source and calls both deprecated on v4.
- `content/faq/all/v3-sdk-observation-lookup-404.mdx` gives a v3-only `useEventsTable=true` workaround, then offers migration to the current SDK. Its title and options constrain the advice.
- `content/self-hosting/upgrade/upgrade-guides/upgrade-v2-to-v3.mdx` and old SDK upgrade pages show legacy APIs as “before” states. Their versioned titles make that historical role clear.
- `content/integrations/other/promptfoo.mdx` says `npm install langfuse` because Promptfoo itself currently requires that package, and separately uses `@langfuse/client` for direct Langfuse code. This looks suspicious in a text search but is explicit third-party compatibility, not general SDK advice.
- `content/integrations/gateways/kong-ai-plugin.mdx` mentions a community plugin using `/api/public/ingestion`, but the adjacent callout marks it deprecated and the primary setup uses OTel.
- `content/integrations/frameworks/pipecat.mdx` documents `langfuse.trace.input` / `.output` OTel attributes only as deprecated compatibility for legacy evaluators; those strings are attributes, not the old SDK method.

### Docs that can mislead an agent

1. **Current FAQ actively troubleshoots deprecated ingestion without a migration warning.** `content/faq/all/self-hosting-missing-events-after-ingestion.mdx` starts “If you are not seeing events … posted to `/api/public/ingestion`” and tells readers to inspect legacy `traces`, `observations`, and `scores` tables. It never says the path is deprecated, version-scopes the procedure, or links OTel migration. It is listed in live `llms-faq.txt` and its live Markdown carries the generic agent footer, making it a high-confidence-looking agent answer.
2. **A 2026 blog about optimizing the agent skill contains obsolete implementation instructions.** `content/blog/2026-03-24-optimizing-ai-skill-with-autoresearch.mdx` tells the skill to detect `langfuse.trace()` and links prompts with `trace.generation(...)`. The live Markdown has only the generic agent footer, not the changelog historical-code warning. `llms-blog.txt` advertises it specifically as an agent-skill article, so it is a likely retrieval result for agents.
3. **Older blogs contain copy-ready legacy tracing.** `blog/showcase-llm-chatbot.mdx`, `blog/update-2023-08.mdx`, and `blog/2024-04-python-decorator.mdx` use `langfuse.trace` / `trace.generation`. Their age is visible but there is no machine-readable “historical example” warning equivalent to changelog.
4. **Operational wording names deprecated read endpoints as if current.** `content/self-hosting/configuration/scaling.mdx` describes a recommended `FINAL` optimization and says it affects `GET /api/public/observations` and the observations CTE in `GET /api/public/traces`. The feature itself is legitimate for mixed migration deployments, but the paragraph does not call those GETs deprecated or identify its applicable server/write modes.
5. **Agent footer’s “read or write traces” wording is underspecified.** `lib/agent-instructions-footer.js` sends every agent to `npx @langfuse/cli api <resource> <action>` to “read or write traces.” The CLI schema exposes a `traces` resource, while the public skill is where the crucial “always query via observations, not traces” rule lives. An agent that follows only the footer + schema can choose the deprecated resource.
6. **The v3 observation-lookup FAQ uses an old namespace without naming it.** `content/faq/all/v3-sdk-observation-lookup-404.mdx` presents `langfuse.api.observations.get(..., useEventsTable=true)` as the workaround. The v3 scope is clear from the title, but the snippet is easy to lift as a current query pattern and does not call this observations resource legacy v1. Current migration docs place it under `api.legacy.observations_v1` or use v2 `get_many`.

### Historical content with adequate guardrails

- Changelog entries such as `2024-07-04-query-traces-via-sdks.mdx` and `2025-02-05-public-api-wrapper-sdks.mdx` contain deeply obsolete calls (`fetch_traces`, unscoped `langfuse`, `api.trace.get`). Both canonicalize to the current Query via SDKs page, are excluded from sitemap/`llms.txt` as duplicate canonical pages, and direct Markdown fetches receive the explicit changelog warning. They are lower risk on direct fetch, but semantic search does not carry that tool-level warning and may still expose excerpts from their old bodies.
- The deprecated migration FAQ deliberately contains “Before” curl examples for legacy endpoints. Headings, tables, and adjacent “After” examples make those safe.

### Docs cleanup priority

1. Add a v3-only/deprecation banner plus OTel migration link to `self-hosting-missing-events-after-ingestion.mdx`, or split/archive it.
2. Add the historical-code warning to blog Markdown globally, or at least to blogs with old SDK snippets; fix the 2026 autoresearch article first because it directly targets agent-skill authors.
3. Change the global agent footer to “query observations and metrics; ingest tracing with current SDKs/OTel,” or link the CLI reference’s anti-legacy rule directly.
4. Add the same historical-code policy to semantic-search results/indexing that direct changelog Markdown and the MCP direct-page tool already have.
5. Label the v3 observation-lookup workaround as legacy v1 and point current readers at v2 `get_many`.
6. Version-scope the `scaling.mdx` paragraph that names legacy GET routes.
7. Preserve the v3 compatibility guidance; it is necessary and already well constrained.

## 5. Answer

**On Langfuse Cloud and v4 servers: no, coding agents are not supposed to use legacy APIs.** The skill, CLI tips, Python/JS root READMEs, Fern API intro, and the agent-oriented deprecation FAQ all point at Observations/Metrics v2, Scores v3, OTel ingest, and experiments.

**Yes, they are still advised to use `api.legacy.*` when talking to a self-hosted v3 server** (or a v3 migration source). That is documented on purpose in compatibility and SDK upgrade pages.

**Yes, they can still be _accidentally_ steered onto legacy APIs** by copy-paste surfaces that have not been updated: JS client README `api.trace.get`, Python `api` docstring + `batch_evaluation`, JS `fetchObservation` → v1, SDK tests, and unfiltered CLI schema.

Highest-leverage cleanups if the goal is “agents never start on v1”:

1. Replace the `@langfuse/client` README REST example with `api.observations.getMany`.
2. Rewrite the Python `api` property docstring so `api.trace.*` is not the first fetch pattern.
3. Point `fetchObservation` at v2 (or delete it) so the deprecation text matches the binding.
4. Add deprecation/version guards to the stale ingestion FAQ and old-code blogs, especially the 2026 agent-skill article.
5. Make the global Markdown agent footer name observations/OTel rather than generic “traces,” and make CLI resource discovery louder; the skill already has the right prefer-rules.
6. Point `CONTRIBUTING.md` ingestion at OTel + v4, or mark the batch path deprecated so in-repo agents do not treat it as current.

## Sources

- `langfuse/langfuse`: `fern/apis/server/definition/{api,trace,ingestion,legacy/*}.yml`, `web/src/features/public-api/server/{deprecations,legacyApiOrganizationCutoff}.ts`, `packages/shared/src/server/v4/legacyApiUsage.ts`, `CONTRIBUTING.md` ingestion section, `web/src/features/mcp/server/observations/tools/listObservations.ts`
- `langfuse/langfuse-docs`: `content/faq/all/deprecated-api-migration.mdx`, `content/docs/api-and-data-platform/features/{public-api,query-via-sdk,cli,agent-skill}.mdx`, `content/self-hosting/upgrade/{versioning,upgrade-guides/upgrade-v3-to-v4}.mdx`, `content/docs/observability/sdk/upgrade-path/{python-v3-to-v4,js-v4-to-v5}.mdx`
- `langfuse/langfuse-python`: `README.md`, `langfuse/_client/client.py`, `langfuse/batch_evaluation.py`, `langfuse/api/legacy/`
- `langfuse/langfuse-js`: `README.md`, `packages/client/README.md`, `packages/client/src/LangfuseClient.ts`
- `langfuse/skills`: `skills/langfuse/SKILL.md`, `references/{cli,instrumentation,v4-project-migration,trace-evaluator-upgrade}.md`
- `langfuse/langfuse-cli`: OpenAPI-driven `legacy-*` resource names
- `langfuse/mcp-server-langfuse`: prompts only
