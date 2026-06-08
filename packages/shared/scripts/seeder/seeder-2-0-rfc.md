# RFC: Langfuse Seeder 2.0

Status: proposed

Date: 2026-06-08


## Summary

Improve the Langfuse in-repo seeder as the primary local seed-data path instead
of introducing a separate local-only tool around weak seed data.

Seeder 2.0 should make a fresh local Langfuse install useful for real product
debugging immediately. It should seed data that exercises the same data shapes
that have historically produced user-visible bugs: large JSON, huge sessions,
many observations per trace, all observation types, complicated agentic
workflow trees, score contract edge cases, v4 event parity, annotation queues,
datasets, prompt workflows, media, Unicode, metadata filters, and frontend
performance hot paths.

The default local path must stay cheap. `pnpm run dx` should offer seed profile
choices:

- `Standard`: close to today's seed in runtime and database size, with a small
  amount of higher-value edge-case data mixed in
- `Deep`: richer local product and frontend-performance coverage, still bounded
  enough for a laptop
- `Custom`: config-file driven advanced scenarios for a specific bug, feature,
  or targeted investigation

The key design shift is from "generate rows" to "install named scenarios with
source evidence, explicit budgets, verification, deep links, and an extension
path for future bugfixes."

## Decision Context

An earlier local-test-data direction considered a separate panel or CLI that
could prefill a local Langfuse installation for specific bugs and features.
Based on initial exploration, this RFC proposes a narrower repo-owned direction:

- improve the default Langfuse seeder itself
- keep exploratory notes as background context
- defer any separate panel until the seeder path has proven useful
- plan the implementation in phases inside the Langfuse repo

This RFC should live next to the seeder implementation in
`packages/shared/scripts/seeder`.

## Research Inputs

Research was performed against the repository and related local sources on
2026-06-08. No live APIs were used.

Primary sources:

- `packages/shared/scripts/seeder`
- `packages/shared/scripts/seeder/clickhouse-load-seed-plan.md`
- `langfuse-playground`
- common load-test ingestion patterns and fixture shapes
- `langfuse-docs`
- selected Langfuse git history and bugfix commits

Research areas covered:

- Langfuse bugfix history and user-facing data-shape pain
- current seeder architecture and gaps
- playground assets and load-test style ingestion patterns
- docs, academy, use cases, customer narratives, and blog-style product flows

## Goals

1. Make default local seed data much more useful for day-to-day product work.
2. Cover frontend and UI performance paths, not only backend ClickHouse load.
3. Seed realistic product loops from docs: trace -> monitor -> dataset ->
   experiment -> evaluation -> prompt fix -> annotation.
4. Preserve bugfix knowledge as durable regression scenarios whenever seed data
   could have exposed the issue locally.
5. Provide named scenarios that are deterministic, inspectable, verifiable, and
   extensible.
6. Add a seeder configuration file that can select profiles, scenarios, sizes,
   row budgets, payload budgets, and writer paths.
7. Make `pnpm run dx` seed-size aware with `Standard`, `Deep`, and `Custom`
   options, while keeping `Standard` close to current local setup cost.
8. Support both legacy v3 ClickHouse traces/observations/scores and v4
   `events_full` / `events_core` parity.
9. Include very large JSON and text payloads, but make destructive or very heavy
   payloads opt-in.
10. Include traces with many observations in one parent observation and many
   observations in one trace, including all observation kinds.
11. Include complicated agentic workflow trees with branching, retries, parallel
   tools, guardrails, evaluators, and failure paths.
12. Reuse existing seed/playground/load assets where they are strong.

## Non-Goals

- Do not seed customer data or raw support/debug dumps.
- Do not require model provider keys for default data.
- Do not replace dedicated load tests. Seeder 2.0 can reuse load-test ideas, but
  its primary job is rich local reproducibility.
- Do not make the first deliverable a UI panel.
- Do not make every pathological payload part of the normal local developer
  path.
- Do not make `pnpm run dx` materially slower or heavier by default.
- Do not mutate Linear or rely on private ticket state at seed runtime.

## Seeder Configuration And DX UX

The proposal needs a first-class seeder configuration file. Without it,
Seeder 2.0 risks becoming a pile of hardcoded scenarios and flags.

### Configuration Files

Recommended committed files:

```text
packages/shared/scripts/seeder/config/
  standard.config.json
  deep.config.json
  custom.example.config.json
```

Recommended ignored local file:

```text
packages/shared/scripts/seeder/config/custom.local.config.json
```

Rationale:

- `standard.config.json` is the source of truth for normal local development.
  It should be very close to today's `dx`/`db:seed:examples` behavior in time
  and storage cost.
- `deep.config.json` is the maintained richer local test-data pack.
- `custom.example.config.json` teaches contributors how to build a custom
  scenario config without reading all seeder internals.
- `custom.local.config.json` lets contributors generate a scenario-specific
  config for a bug investigation without committing local-only knobs.

If a custom config proves broadly useful, it should be promoted into a named
scenario or a maintained config file rather than staying as local drift.

### Config Shape

Sketch:

```json
{
  "profile": "standard",
  "seed": {
    "postgres": true,
    "clickhouse": true,
    "v4Events": "if-available",
    "media": "fallback-if-storage-missing"
  },
  "budgets": {
    "maxAdditionalRuntimeMsOverCurrentSeed": 15000,
    "maxAdditionalClickHouseRows": 5000,
    "maxPayloadBytesPerRecord": 1048576,
    "maxTotalSeedBytes": 250000000
  },
  "scenarios": [
    {
      "id": "observation-kind-matrix",
      "enabled": true,
      "size": "smoke"
    },
    {
      "id": "agentic-workflow-tree",
      "enabled": true,
      "size": "smoke"
    },
    {
      "id": "json-io-torture",
      "enabled": true,
      "size": "standard"
    }
  ],
  "verification": {
    "clickhouse": true,
    "apiReadback": false,
    "printUiLinks": true
  }
}
```

Budgets are important. Each scenario should declare its expected row count,
payload size, and rough runtime contribution. The runner should refuse a
profile/config when the sum exceeds the profile budget unless the user passes
an explicit override for stress or pathological data.

### Profile Semantics

`Standard`:

- default for `pnpm run dx` in non-interactive mode
- close to today's seed runtime and database size
- can add a small number of high-value edge-case records, but should not add a
  second large dataset on top of the current seed
- should prefer replacing low-value synthetic shape with better synthetic shape
  over simply adding more rows
- should include no 10 MB payloads and no 10k-observation trace

`Deep`:

- opt-in local profile for engineers working on UI, eval, tracing, v4 events,
  datasets, or seeder behavior
- includes richer agentic workflows, full large JSON fixtures, session and trace
  monsters, media fallback/storage cases, annotation queue items, and v4 parity
  when available
- should remain laptop-friendly and deterministic

`Custom`:

- points to a config file
- intended for targeted bug reproduction, advanced feature testing, or focused
  exploration
- can enable stress/pathological scenario sizes only with explicit config and
  confirmation
- should print a manifest and exact verification checks

### `pnpm run dx` Options

`pnpm run dx` should become seed-profile aware. Exact CLI design can be decided
in implementation, but the target behavior should be:

```bash
pnpm run dx
pnpm run dx -- --seed standard
pnpm run dx -- --seed deep
pnpm run dx -- --seed custom --seed-config packages/shared/scripts/seeder/config/custom.local.config.json
```

Behavior:

- interactive TTY: ask for `Standard`, `Deep`, or `Custom`, defaulting to
  `Standard`
- non-interactive or CI-like mode: use `Standard`
- `Custom`: require `--seed-config` or a documented env var
- `Deep` and `Custom`: print estimated row counts, payload caps, and warnings
  before destructive reset/seed work begins

Implementation note: this likely wants a small root-level `dx` wrapper script
instead of the current long shell chain in `package.json`, otherwise argument
parsing and interactive prompts will stay brittle.

### Custom Config Playbook

The future `packages/shared/scripts/seeder/AGENTS.md` should document how to set
up advanced/custom seed configs:

1. Start from `custom.example.config.json`.
2. Choose the smallest scenario set that exercises the bug or feature.
3. Set explicit row, byte, and payload caps.
4. Prefer `Deep` before inventing a new custom config.
5. Use `Custom` for one-off reproduction and then promote useful configs into
   named scenarios.
6. Never commit `custom.local.config.json`, raw customer traces, secrets, or
   generated run manifests.
7. Always run dry-run/estimate first and include the printed manifest path in
   the test notes.

## Current Seeder Architecture

Current Langfuse seeding is split across Postgres product objects and
ClickHouse analytical data.

Postgres seed:

- `packages/shared/scripts/seeder/seed-postgres.ts`
- creates orgs, projects, users, memberships, API keys, prompts, datasets,
  score configs, annotation queues, evaluator configs/templates/executions,
  dashboards, media rows, trace sessions, LLM schemas, and in-app agent demo
  conversations
- richer fixtures are gated behind environments such as `examples` or `load`

ClickHouse seed:

- `seed-clickhouse.ts` resolves seed project IDs and calls
  `prepare-clickhouse.ts`
- `prepare-clickhouse.ts` invokes `SeederOrchestrator.executeFullSeed`
- `SeederOrchestrator` creates dataset experiment rows, evaluation rows,
  synthetic rows, support chat traces, framework traces, and media test traces
- `ClickHouseQueryBuilder` supports both curated inserts and SQL
  `INSERT ... SELECT FROM numbers()` bulk inserts
- `DataGenerator` produces traces, observations, scores, dataset run items, eval
  data, support chat data, and a small comprehensive AI workflow

Current useful coverage:

- 100k bulk observations in `bulk` mode
- 1k more realistic synthetic observations in `synthetic` mode
- eval traces and dataset experiment traces
- an 8-turn support chat session
- framework trace fixtures for Agno, AutoGen, BeeAI, Google ADK/Gemini/Vertex,
  Koog, LangGraph, LlamaIndex, Microsoft Agent, OpenAI Agents/Assistants, and
  Pydantic AI
- media traces for image, PDF, audio, and ChatML media references
- dataset version performance side script

Important current gaps:

- Huge JSON is loaded but deliberately truncated. `SeederOrchestrator` slices
  `nested_json.json` to 3 products and `chat_ml_json.json` to 4 messages.
- Scale and richness are split. Bulk mode has many rows but mostly
  `GENERATION`, `SPAN`, and `EVENT`; synthetic mode has newer observation types
  but only 1k observations.
- The comprehensive AI workflow is a fixed linear chain:
  `AGENT -> RETRIEVER -> EMBEDDING -> CHAIN -> TOOL -> GENERATION -> EVALUATOR -> GUARDRAIL`.
- Default data does not guarantee all observation kinds.
- Default data does not include large, branching trace trees or one trace with
  thousands of observations.
- V4 events are not a first-class seeder writer path.
- Annotation queues exist, but queue items and workflow states are skeletal.
- Score configs exist, but many generated scores have `config_id = null` and
  text/correction score coverage is weak.
- Media is mostly trace-level; observation media is not a default scenario.
- Dashboards are minimal and do not intentionally exercise score/eval/dataset
  or v4 event queries.
- Determinism is weak because several fixtures use random IDs and `Math.random`.
- There is no scenario manifest, scenario list, or scenario-specific
  verification contract.
- Local v4 dev-table setup may need hardening before v4 scenarios can be
  promoted. A single local `pnpm --filter=shared run ch:dev-tables` run on
  2026-06-08 printed heredoc/backtick `command not found` symptoms and
  `Killed: 9`, and did not create `events_full` / `events_core`. Treat this as
  an unreproduced script-reliability lead; Phase 4 should reproduce or discard
  it before turning it into a requirement.

## Prior Art To Reuse

### `langfuse-playground/python/session-seed`

This is the strongest existing prototype for scenario-style seeding.

Reusable ideas:

- deterministic public-ingestion scenarios
- dry-run counts
- smoke, stress, and opt-in pathological sizes
- manifest output
- many sessions and many traces per session
- large I/O
- all observation kinds
- score/date/environment edge cases
- batching limits

Known dry-run counts:

| Size | Sessions | Traces | Observations | Scores | Ingestion events |
| --- | ---: | ---: | ---: | ---: | ---: |
| smoke | 20 | 110 | 139 | 30 | 279 |
| stress | 20 | 353 | 382 | 30 | 765 |
| pathological | 20 | 914 | 943 | 30 | 1,887 |

Existing size profile:

- smoke: 60-trace large session, 12 users, 18 tags, 100 KB I/O
- stress: 250 traces, 65 users, 80 tags, 250 KB I/O
- pathological: 750 traces, 125 users, 160 tags, 300 KB normal I/O plus 1 MB
  pathological payload
- batching: max 75 events or 2,500,000 bytes per ingestion batch

### Load-Test Ingestion Patterns

Common load-test corpora are useful prior art for seeder design because they
exercise realistic ingestion mix, request batching, payload sizes, and
cardinality pressure.

Useful data shapes:

- public ingestion batch with trace create/update, span create/update,
  generation create/update, embedding generation, child event, and score
- OTel payload with root span plus child generation
- `langfuse.environment`, `service.name`, trace tags, metadata, input/output
  JSON strings, model, usage, cost, model parameters
- large text fixtures around 1 MB
- nested JSON fixtures around 1 MB with hundreds of repeated objects
- high-dimensional embedding vectors

Caveats:

- Do not port load-test credential or CSV assumptions into the default seeder.
- Normalize environment names and prefer repo-standard env vars over load-test
  aliases.
- Validate fixture wiring before reuse; load-test processors can accidentally
  point at the wrong large fixture.

### `langfuse-playground/js/bug-repro/ingestTrace.js`

Useful pattern for replaying UI-downloaded trace JSON locally.

Caveat:

- Do not copy cleanup behavior as-is. It drops zero values, empty objects,
  `level`, and `statusMessage`, which are exactly the kinds of edge cases
  Seeder 2.0 should preserve.

### Agentic And OTel Playground Workflows

Reusable sources:

- `js/agent-trails`
- Pydantic AI examples
- LangGraph joke evaluation examples
- prompt upload examples
- Yaak prompt API examples with path-like names and chat placeholder shapes

Reusable ideas:

- multi-agent trees
- tool calls
- guardrails
- evaluators
- retries
- OTel span processors
- prompt usage/linkage
- structured output and tool schema round trips

### `clickhouse-load-seed-plan.md`

This plan is valuable backend/load prior art, but it is too backend-focused to
be the full Seeder 2.0 plan.

Useful ideas:

- SQL-level `INSERT INTO ... SELECT FROM numbers(N)` for cheap load
- configurable row counts, day windows, cardinality pools, length distribution,
  heavy metadata fraction, and max bytes
- deterministic trace/observation IDs
- trace/observation correlation without joins
- re-run idempotence through stable IDs and ReplacingMergeTree behavior
- sanity queries for length distribution, heavy metadata fraction, and orphan
  observations

Seeder 2.0 should keep this as a `bulk-load` and `pathological-clickhouse`
track, while adding UI, product, docs, bugfix-regression, and frontend
performance scenarios around it.

## Product Use-Case Scenarios From Docs

Docs and public narratives imply that default seed data should look like real
AI engineering work, not only toy chat completions.

| Scenario | Data shape | Main surfaces |
| --- | --- | --- |
| Support Agent Operations | Multi-turn sessions, router agent, account tools, billing/refund tools, escalation status, user feedback, safety/helpfulness/resolution scores | Traces, Sessions, Agent Graphs, Scores, Tags, Metadata, Annotation Queues, Dashboards |
| Enterprise RAG Assistant | retrieve, rerank, cite, generate, evaluate groundedness/relevance, expected document IDs | Traces, Datasets, Experiments, Evaluators, Prompt Management |
| Agent Benchmark Lab | dataset inputs, expected trajectory, tool-history metadata, model/prompt/tool variants, trajectory scores | Datasets, Experiments, LLM-as-judge, Code Evaluators, Agent Graphs |
| Prompt Lifecycle | prompt versions, labels, staging/production/shadow, Playground configs, linked generations, comments, rollback case | Prompts, Playground, Linked Traces, Prompt Metrics |
| Error Analysis Queue | sampled weak traces, high cost, high latency, low scores, open coding, failure categories, corrected outputs | Annotation Queues, Scores, Corrections, Comments, Filtering |
| Multimodal Inspection | image/audio/PDF inputs and outputs, media refs, image/audio token usage, extraction corrections | Media, Trace Detail, Usage/Cost, Datasets |
| Production Cost/Latency Debug | prod/staging time series, model mix, releases, retries, tool loops, p95 latency, cost outliers | Metrics, Dashboards, Traces, Releases, Environments |
| Multi-Tenant Team Workspace | multiple projects/environments, owner/admin/member/viewer/domain expert users, comments and assignments | Settings, RBAC, Project Switcher, Comments, Queues |

## Bug-Derived Scenario Backlog

These scenarios come from local git-history research. The assertion that a seed
would have prevented the bug is an inference unless explicitly proven by a
test; still, each scenario captures a concrete data shape that would have made
the bug class visible locally.

Priority meanings:

- P0: candidate for Standard or Standard-adjacent rich seed
- P1: scenario pack / local CI candidate
- P2: targeted regression fixture

Reviewability requirement:

Before a backlog row is promoted into implementation, expand its source
evidence with a commit or PR title, affected files or product surfaces, the bug
class, the failing data shape, whether the seed-prevention claim is proven or
inferred, and the verification check the scenario should expose. The table below
is intentionally compressed; the scenario registry should carry the full
`sourceEvidence` metadata.

| Priority | Scenario ID | Evidence shorthand | Candidate seed data to create |
| --- | --- | --- | --- |
| P0 | `session-monster-ui` | `5a051ed46`, `b6469e9b6`, `01dc43088`, `23c7204cd`, `eb6fa1569`; session and trace tree files | One session with many traces and 1k/10k/30k observation tiers, mixed row heights, long names, scores, costs, media, errors, deep links, rapid expand/collapse/scroll target data |
| P0 | `json-io-torture` | `0b10d8aee`, `99ff3073b`, `efb0e9425`, `e51b3ebcd`; JSON viewer files | Observations with 858 KB, 1 MB, 10 MB I/O; >50k JSON nodes; depth >200; long strings; parsed and stringified JSON; malformed/incomplete JSON |
| P0 | `media-storage-edge` | `94b20abc2`, `3b20b1b0`, `0690b07c4`, `86b307849`; `seed-media.ts` | image/PDF/audio/video in trace and observation input/output/metadata, ChatML media refs, missing media rows, invalid content type, long trace/observation IDs |
| P0 | `agent-tool-shape-zoo` | `1ede00d88`, `c4f50a1e3`, `98232eb43`, `a1ab29445`, `d596cd109`, `9667816ae`; framework fixtures | OpenAI Agents, LangGraph, Microsoft Agent, AI SDK, Pydantic AI, OTel traces with tool definitions, stringified tools, malformed tool entries, empty response text, thinking-only/tool-only messages |
| P1 | `prompt-playground-roundtrip` | `fd9548019`, `dd0c90e02`, `792baf8d5`, `033616dda`; Playground prompt config | prompts with 5+ tools, structured output schema, one malformed tool beside valid schema, cleared tools/schema in a new version, prompt-to-playground-to-prompt round trip data |
| P0 | `score-contract-zoo` | `6b2e5be3f`, `a2aeeac38`, `78c89e79a`, `d3e467a49`, `60c8c3a9b`, `80bb8e559`, `17ec5a6a1`, `026c26703`, `07938af87`, `027b90fd7` | NUMERIC, BOOLEAN, CATEGORICAL, TEXT, CORRECTION scores on trace/observation/session/dataset-run subjects; annotations; empty-string correction; same timestamp pagination; URL-unsafe cursors |
| P1 | `score-filter-cardinality` | `f557a982f`, `33fd825a6`, `2f035f856`, `0a45d7dde`, `550e8bd5e` | high-cardinality categorical names/values, numeric score filters, score names that differ from trace names, hidden events-table score columns |
| P0 | `dataset-json-versioning` | `809775fea`, `0cf2a3347`, `cd3d02b75`, `df4d78218`, `8834a3af4`, `f41085dd5` | large JSONB dataset items, update/delete version timelines, null/non-string prefill values, invalid JSONPath, array slices, schemas with arrays missing `items`, v4 dataset run items |
| P0 | `annotation-queue-workflow` | `1875fe4b4`, `053185ed9`, `ea14d09da`, `2f738af2b`, `d676ee2c0` | queues containing trace, observation, and session items; legacy and events-backed reads; parent trace lookup from events; assignment deletion; duplicate creation race data |
| P0 | `v4-events-parity` | `25365ba03`, `d74059f54`, `2bd367a7`, `19ccc4768`, `f0a5b343d` | `events_full`/`events_core` traces where `release !== version`, batch I/O as objects and strings, events-only traces, delete/download/export flows |
| P0 | `observations-v2-field-groups` | `4a214d12e`, `6c11a8f06`, `612ffdfad`, `ed7573225`, `841f0fbfe`, `be8b88c65`, `2e61f7403`, `71a5dedf2` | non-JSON `model_parameters`, model and `providedModelName`, usage pricing tiers, `fields=usage` without `model`, multi-env filters, optional trace context |
| P1 | `prompt-version-label-zoo` | `099cbc76d`, `8dd5d0a08`, `86af0efae`, `b207a95c0`, `60d9a4ca`, `bd0eda471` | prompt with 100+ versions, empty labels, production/latest labels, prompt references, unresolved prompt fetch, Unicode variables, day-boundary observation counts |
| P0 | `unicode-search-export` | `b6c2e914`, `e51b3ebcd`, `afe51cd07`, `53bfe1880`, `d1a57bab7`, `1647e080b` | escaped CJK/Arabic, double-escaped strings, surrogate pairs, incomplete surrogates, non-ASCII filenames/tags, input-only/output-only search terms |
| P1 | `browser-translation-dom-mutation` | `86080e8e8`; `_app.tsx` workaround | localized/non-ASCII trace, prompt, and dataset names plus a Playwright mode that simulates Google Translate wrapping text nodes |
| P1 | `clickhouse-metadata-filter-semantics` | `02121f418`, `04d812f0f`, `aa2f7568a`, `b6358008c`, `5537506a6` | metadata with missing keys vs empty strings, dotted keys, high cardinality, nested metadata, score joins with nulls, events filters requiring I/O subqueries |
| P1 | `sessions-export-cutoffs` | `d6d117d08`, `87f30be6f`, `19ccc4768`, `1647e080b` | v4 sessions with cutoff-window traces, many observations, usage metrics, non-ASCII I/O, trace downloads near and above payload limits |

## Developer Seed Profiles

Seeder 2.0 should make the developer-facing seed profile explicit.

| Profile | Intended use | Default behavior |
| --- | --- | --- |
| `standard` | normal `pnpm run dx` and local development | current seed behavior plus a small number of high-value scenario rows; no meaningful runtime/storage increase |
| `deep` | richer local product, UI, and FE performance testing | maintained advanced pack; larger but bounded and deterministic |
| `custom` | targeted bug/feature reproduction | reads a config file; can opt into stress/pathological sizes with explicit budgets and confirmation |

Scenario-level sizes should stay separate from developer profiles:

| Scenario size | Intended use | Availability |
| --- | --- | --- |
| `smoke` | tiny representative shape | allowed in `standard`, `deep`, and `custom` |
| `standard` | bounded local shape | allowed in `standard`, `deep`, and `custom` |
| `deep` | rich product/UI shape | allowed in `deep` and `custom` |
| `stress` | frontend performance and table virtualization work | `custom` by default, optionally selected by `deep` for specific maintained scenarios |
| `pathological` | known worst cases such as 10 MB JSON or 30k observations | explicit `custom` only |
| `bulk-load` | ClickHouse write/query pressure | explicit `custom` only |

Recommended first scenario targets:

| Scenario | `standard` | `deep` | `custom` examples |
| --- | ---: | ---: | --- |
| `session-monster-ui` | 60 traces, ~150 observations | 250 traces, ~400 observations | 1k traces, 10k observations, or 30k observations |
| `json-io-torture` | 100 KB payload and maybe one 1 MB payload if runtime is acceptable | full 1.1 MB JSON and 1 MB text | 10 MB or 50 MB payload if system limit allows |
| `observation-kind-matrix` | 1 trace, all kinds, ~20 observations | 5 traces, all kinds, ~100 observations | 1 trace with 1k or 10k observations |
| `agentic-workflow-tree` | 1 branching tree, ~75 observations | 3 trees, ~300 observations | one very large tree with 1k or 10k observations |
| `v4-events-parity` | skipped unless v4 tables are reliably available and cost is tiny | mirrored legacy/v4 scenarios | mirrored stress tree or huge I/O |

The Standard profile should be "edge-case rich" rather than "row-count huge."
Deep and Custom profiles are where the repo learns how to create much more
advanced data without imposing it on every `dx` run.

## Proposed Architecture

### Scenario Registry

Add a typed registry under `packages/shared/scripts/seeder`.

Candidate structure:

```text
packages/shared/scripts/seeder/
  config/
    standard.config.json
    deep.config.json
    custom.example.config.json
  scenarios/
    registry.ts
    types.ts
    standard-pack.ts
    deep-pack.ts
    bugfix-regressions/
    product-workflows/
    perf/
    v4/
  builders/
    trace-builder.ts
    observation-tree-builder.ts
    event-builder.ts
    score-builder.ts
    dataset-builder.ts
    annotation-builder.ts
    media-builder.ts
    prompt-builder.ts
    large-payload-builder.ts
  writers/
    postgres-writer.ts
    clickhouse-legacy-writer.ts
    clickhouse-v4-event-writer.ts
    ingestion-writer.ts
    otel-writer.ts
    media-writer.ts
  verification/
    clickhouse-checks.ts
    api-checks.ts
    manifest.ts
    ui-links.ts
  AGENTS.md
```

Scenario contract sketch:

```ts
type SeederScenarioSize =
  | "smoke"
  | "standard"
  | "deep"
  | "stress"
  | "pathological"
  | "bulk-load";

type SeederProfile = "standard" | "deep" | "custom";

type SeederWriterPath =
  | "postgres"
  | "legacy-clickhouse"
  | "v4-events"
  | "public-ingestion"
  | "otel"
  | "media-storage";

type SeederScenario = {
  id: string;
  title: string;
  status: "standard" | "deep" | "custom-only" | "experimental";
  featureAreas: string[];
  sourceEvidence: Array<{
    kind: "commit" | "doc" | "playground" | "load-test" | "manual-research";
    ref: string;
    note: string;
  }>;
  sizes: Partial<Record<SeederScenarioSize, SeederScenarioPlan>>;
  defaultProfiles: SeederProfile[];
  budgets: {
    rows?: number;
    payloadBytesPerRecord?: number;
    estimatedRuntimeMs?: number;
  };
  requires: string[];
  writerPaths: SeederWriterPath[];
  creates: {
    postgres?: string[];
    clickhouse?: string[];
    media?: string[];
  };
  verification: VerificationCheck[];
  uiLinks: UiLinkTemplate[];
  risks: string[];
};
```

The registry should support:

- `seed:list`
- `seed:dry-run`
- `seed:run --scenario <id> --size smoke|standard|deep|stress|pathological|bulk-load`
- `seed:run --profile standard|deep`
- `seed:run --profile custom --config <path>`
- `seed:verify --scenario <id>`
- `seed:manifest --last`

### Builder Layer

Builders should be deterministic and composable. They should accept a seeded
random source or explicit deterministic counters rather than using global
`Math.random` directly.

Critical builders:

- `LargePayloadBuilder`
  - full `nested_json.json`
  - 1 MB text
  - 10 MB JSON/text
  - malformed JSON
  - deeply nested JSON
  - stringified JSON inside JSON
  - Unicode and escaped Unicode
- `ObservationTreeBuilder`
  - deep linear chain
  - wide branch
  - many children under one parent
  - mixed observation types
  - missing end times
  - same timestamps
  - errors/warnings/status messages
  - retries and loops encoded as metadata
- `AgenticWorkflowBuilder`
  - supervisor agent
  - planner
  - retriever + embedding
  - parallel tools
  - generator
  - evaluator
  - guardrail allow and block paths
  - human escalation branch
- `ScoreBuilder`
  - numeric, boolean, categorical, text, correction
  - linked to trace, observation, session, dataset run
  - queue/config linkage
  - same timestamp pagination
  - URL-unsafe and empty-string values
- `ProductWorkflowBuilder`
  - support workflow
  - RAG workflow
  - prompt lifecycle workflow
  - dataset/experiment/eval loop
  - annotation queue workflow

### Writer Layer

Keep writer paths explicit. Each scenario should declare why it uses each path.

Writer path guidance:

- `postgres`: product fixtures such as projects, prompts, datasets, score
  configs, annotation queues, comments, dashboards, media DB rows
- `legacy-clickhouse`: direct v3 traces, observations, scores, dataset run items
  and high-volume rows
- `v4-events`: direct v4 event rows or helper-based writes for
  `events_full` / `events_core` parity
- `public-ingestion`: API-realistic ingestion scenarios where auth, batching,
  workers, and ingestion contracts matter
- `otel`: OTel-specific trace shape and span-attribute mapping
- `media-storage`: blob upload when local S3/MinIO is configured; fallback
  reference rows when it is not

Do not hide writer differences. A scenario seeded by direct ClickHouse may be
useful for UI and query debugging, but it does not validate ingestion API
behavior.

### Verification Layer

Every scenario needs a machine-readable verification contract.

Examples:

```sql
SELECT count()
FROM observations
WHERE project_id = {projectId: String}
  AND trace_id = {traceId: String};
```

```sql
SELECT type, count()
FROM observations
WHERE project_id = {projectId: String}
  AND trace_id = {traceId: String}
GROUP BY type
ORDER BY type;
```

```sql
SELECT count()
FROM
(
  SELECT project_id, trace_id
  FROM observations
  WHERE project_id = {projectId: String}
) AS o
LEFT ANTI JOIN
(
  SELECT project_id, id
  FROM traces
  WHERE project_id = {projectId: String}
) AS t
  ON o.project_id = t.project_id
 AND o.trace_id = t.id;
```

Verification should cover:

- row counts
- parent observation integrity
- all observation types present
- score/config linkage
- annotation queue linkage
- dataset run item linkage
- media rows and fallback rows
- v4 `events_full` / `events_core` parity
- input/output/metadata length distribution
- expected truncation in `events_core`
- API readback when writer path uses public ingestion or OTel
- UI deep links and filters for manual checks

### Run Manifests

Each run should create an ignored manifest file and print its path.

Manifest fields:

- timestamp
- git SHA
- scenario IDs
- size profile
- project IDs
- writer paths
- created entity IDs
- counts by table/entity
- verification results
- deep links
- seed config

Do not commit generated run manifests by default. Commit the manifest schema and
docs.

## Standard And Deep Pack Proposal

The Standard pack should run with normal local seeding. It must remain close to
today's local seed runtime and database size. It should be rich enough that a
developer sees realistic product data on first local launch, but not so rich
that every `pnpm run dx` pays for stress data.

Candidate Standard scenarios:

1. `observation-kind-matrix`
   - one trace containing `SPAN`, `GENERATION`, `EVENT`, `AGENT`, `TOOL`,
     `CHAIN`, `RETRIEVER`, `EVALUATOR`, `EMBEDDING`, `GUARDRAIL`
   - parent/child links, same timestamps, missing end times, status messages

2. `agentic-workflow-tree`
   - one complicated support/RAG agent workflow
   - branching subagents, parallel tools, retry branch, failed tool call,
     guardrail block path, evaluator output, human escalation metadata

3. `json-io-torture-standard`
   - one 100 KB JSON/text case
   - one 1 MB JSON/text case if runtime is acceptable
   - parsed object, stringified object, malformed JSON, escaped Unicode

4. `session-monster-standard`
   - one session with many traces and enough observations to exercise session
     detail virtualization, row height variance, and score badges

5. `score-contract-zoo-standard`
   - all score data types, trace/observation/session/dataset-run subjects,
     linked score configs, empty-string and long text values

6. `annotation-queue-workflow-standard`
   - one queue with trace, observation, and session items
   - pending/completed items, assignees, queue-linked scores, comments

7. `prompt-lifecycle-standard`
   - prompt versions, labels, one Playground-ready config, one linked generation
   - path-like prompt name and Unicode variables

8. `media-reference-standard`
   - image/PDF/audio references in trace and observation fields
   - storage-backed blobs when configured, fallback rows when not configured

9. `dataset-experiment-standard`
   - one production-derived dataset, one run, a failed row, run-level scores,
     large expected output, source trace IDs

10. `v4-events-parity-smoke`
    - gated on local v4 dev tables being available
    - one logical workflow mirrored into legacy rows and v4 events

If runtime pressure is too high, scenarios 1-6 should remain Standard and 7-10
can move to Deep until optimized.

Candidate Deep additions:

- full large JSON and text fixtures
- larger session-detail and trace-tree monsters
- richer annotation queue workflows
- richer dataset experiment loops
- v4 event parity when local v4 tables are available
- framework zoo promotion for agent/tool shape coverage
- prompt Playground round-trip edge cases

## UI And Frontend Performance Coverage

Seeder 2.0 should explicitly support UI and frontend performance work.

Required FE-focused scenarios:

- `session-monster-ui`
  - session detail virtualization
  - many traces in one session
  - mixed row heights
  - long names and large JSON cells
  - score badges and comments
  - media rows
- `trace-tree-monster-ui`
  - one trace with thousands of observations
  - many children under one parent observation
  - deep and wide tree shapes
  - all observation kinds
- `json-viewer-torture-ui`
  - huge JSON, deeply nested JSON, stringified JSON, malformed JSON
  - long strings and Unicode
- `events-table-score-ui`
  - v4 events rows with score columns, hidden/default-visible behavior,
    filters, and truncated/full I/O reads
- `browser-translation-ui`
  - localized long UI-visible strings
  - Playwright simulation of DOM mutation from browser translation

These should produce links and recommended manual checks. Later, Playwright
tests can consume the same scenarios.

## V3 And V4 Data Strategy

Seeder 2.0 needs explicit v3/v4 coverage because local development now needs to
test both legacy and events-backed paths.

V3:

- write `traces`, `observations`, `scores`, `dataset_run_items_rmt`
- support direct ClickHouse for speed and volume
- preserve parent-child consistency and project consistency

V4:

- create or verify `events_full`, `events_core`, materialized views, and staging
  dependencies
- seed events with microsecond timestamps
- include metadata as name/value arrays where applicable
- include full-fidelity values in `events_full`
- expect truncation in `events_core` and verify it
- seed traces where `release !== version`
- seed object and string I/O in batch paths
- seed events-only traces and logical twins of v3 traces

Open implementation question:

- Should v4 seeding write direct event rows using existing test utilities such
  as `createEvent` / `createEventsCh`, or should it exercise OTel/public
  ingestion and workers for v4? The likely answer is both, but separate
  scenarios should make the tradeoff visible.

## Bugfix Scenario Extension Playbook

Extensibility is core. Seeder 2.0 should make it normal for bugfix work to ask:

"Could a seed scenario have exposed this locally?"

If yes, the bugfix should add or extend a scenario. If no, the reason should be
shortly noted in the PR or nearby test plan.

Proposed implementation artifact:

- `packages/shared/scripts/seeder/AGENTS.md`

Purpose:

- tell future contributors how to extend the seeder for a bugfix
- keep regression scenario additions consistent
- prevent one-off hardcoded fixtures with no verification

Extension checklist:

1. Read the bugfix commit/PR/tests and identify the failing data shape.
2. Classify the bug:
   - payload size
   - tree shape
   - observation type
   - score shape
   - v3/v4 parity
   - API contract
   - UI virtualization/rendering
   - Unicode/search/export
   - media/storage
   - dataset/eval/annotation workflow
3. Decide whether to extend an existing scenario or add a new one.
4. Add source evidence:
   - commit hash or PR ref
   - affected files
   - short note on the data shape
   - mark inference if the seed-prevention claim is not proven
5. Add deterministic data through builders, not ad hoc inline random objects.
6. Add verification:
   - ClickHouse counts/shape checks
   - API readback where relevant
   - UI deep link/manual check where relevant
7. Add size-profile behavior:
   - Standard if small, cheap, and broadly useful
   - Deep if rich but still bounded
   - Custom/stress/pathological if large or specialized
8. Run seed dry-run, seed verify, and the smallest targeted product test.
9. Update the scenario manifest docs.
10. Do not include customer data, secrets, raw downloaded traces, or bulky
    recoverable artifacts.

Suggested `AGENTS.md` skeleton:

```md
# Seeder Extension Contract

When a bugfix reveals a data shape that local seed data did not cover, add or
extend a Seeder 2.0 scenario.

Required fields:

- scenario id
- source evidence
- data shape
- writer path
- size profiles
- Standard/Deep/Custom config behavior
- runtime, row, and payload budgets
- verification checks
- UI/API links or readback checks

Rules:

- deterministic IDs and clocks
- no customer data
- no secrets
- no unverified fixtures
- mark seed-prevention claims as inference unless proven by a test
- prefer extending a scenario over adding a duplicate
```

This turns the seeder into product memory. Every seedable bugfix can become a
small local reproduction asset for future contributors.

## Implementation Plan

### Phase 0: Make Current Seeder Observable

No seed-data behavior change yet. This phase can add config parsing and
read-only inspection commands, but existing seed commands and `pnpm run dx`
should continue producing the same default data.

- add committed `standard.config.json`, `deep.config.json`, and
  `custom.example.config.json`
- add support for an ignored `custom.local.config.json`
- add seed profile config parsing for `standard`, `deep`, and `custom` without
  changing the default selected data yet
- add `seed:list` over current implicit data groups
- add manifest schema
- add dry-run counts where possible
- add verification helpers for current traces/observations/scores
- document current seed entry points and project IDs
- record current gaps in code comments/docs

### Phase 1: Scenario Registry And Standard Rich Pack

- add typed scenario registry
- add deterministic seed context
- add Standard pack with:
  - observation-kind matrix
  - agentic workflow tree
  - JSON I/O Standard torture
  - session monster Standard
  - score contract zoo
  - media reference fallback
- teach `pnpm run dx` to default to Standard and accept Deep/Custom options
- wire into existing seed commands conservatively
- keep current `bulk` mode available

### Phase 2: UI/FE Performance Scenarios

- port useful parts of `session-seed`
- add one trace with many observations under one parent
- add deep/wide trace tree builder
- add JSON viewer torture payloads
- add manual UI deep links and recommended filters
- later: consume the same scenarios from Playwright tests

### Phase 3: Product Loop Scenarios

- support agent operations
- enterprise RAG assistant
- prompt lifecycle / Playground lab
- dataset experiment loop
- annotation/error-analysis queue
- multimodal inspection
- production cost/latency debug

### Phase 4: V4 Events Parity

- stabilize or guard local v4 dev table creation
- add v4 event writer
- create mirrored v3/v4 logical scenarios
- verify `events_full` vs `events_core` truncation and fidelity
- seed events-only reads and exports

### Phase 5: Bugfix Regression Workflow

- add `packages/shared/scripts/seeder/AGENTS.md`
- add bugfix scenario template
- add source-evidence fields to scenario registry
- add docs explaining when a PR should extend the seeder
- backfill the highest-value scenarios from the bug-derived backlog

### Phase 6: Stress, Pathological, And Bulk Load

- adapt `clickhouse-load-seed-plan.md` into named Custom-only `bulk-load`
  scenarios
- add parameterized ClickHouse row generators
- add opt-in pathological payload confirmation
- add runtime and memory guardrails
- keep Standard local seed fast

## Testing Plan

Unit-level:

- deterministic builder snapshots for representative scenarios
- parent-child tree integrity tests
- large payload generator tests
- score shape tests
- v4 event serialization tests

Integration-level:

- seed dry-run produces expected counts
- seed run writes expected Postgres and ClickHouse rows
- seed verify catches missing tables and orphan observations
- public ingestion scenarios can be read back through the public API
- OTel scenarios can be read back with expected span attributes

UI/manual:

- scenario manifests print deep links
- session detail opens on the monster session
- trace detail opens on the monster trace and JSON torture trace
- score filters show expected names/values
- annotation queues contain seeded items
- prompt Playground can load seeded prompt/tool/schema cases
- events table can show truncated list values and full detail values

Performance:

- capture baseline render/interaction timings for the monster scenarios before
  using them to judge frontend changes
- keep Standard scenarios bounded enough for normal local use
- keep stress/pathological scenarios opt-in

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Standard seed becomes too slow | Use explicit budgets; keep Standard edge-rich, not huge |
| Seed data becomes hard to understand | Use named scenarios, manifests, source evidence, and deep links |
| Direct ClickHouse bypasses ingestion bugs | Keep writer path explicit; add separate public-ingestion and OTel scenarios |
| V4 dev tables are unreliable locally | Guard v4 scenarios and fix table setup before making them Standard |
| Large payloads break local laptops | Pathological confirmation, byte caps, and dry-run estimates |
| Fixtures become random and flaky | Deterministic IDs, deterministic clocks, seeded random source |
| Bugfix scenarios duplicate each other | Registry tags and the extension checklist prefer extending existing scenarios |
| Seeder accumulates stale product narratives | Source evidence and docs references per scenario |
| Customer data leaks into fixtures | No raw customer data; synthetic or scrubbed shapes only |

## Open Questions

1. Should `db:seed:examples` map to Standard or Deep once `pnpm run dx` has a
   seed profile selector?
2. What runtime and database-size budget is acceptable for the Standard seed on
   a laptop?
3. Should the first implementation fix v4 dev table creation before adding v4
   scenarios, or should v4 scenarios be guarded behind availability checks?
4. Should public ingestion scenarios be part of Standard seed, or only Deep and
   Custom?
5. What is the safe Standard cap for local JSON payload size: 100 KB, 1 MB, or
   both?
6. Should bugfix scenario additions become an explicit PR checklist item?
7. Where should generated run manifests live, and how should they be ignored?
8. Which existing framework fixtures should be promoted to Standard versus
   Deep?
9. Should Custom config selection use only CLI flags, or also
   `LANGFUSE_SEED_PROFILE` / `LANGFUSE_SEED_CONFIG` env vars?

## Recommended First Slice

Implement one deterministic scenario that proves the architecture:

`agentic-workflow-tree-standard`

It should create:

- one trace in legacy ClickHouse
- all observation kinds
- branching parent-child structure
- many children under one parent
- a failed tool call and retry
- evaluator and guardrail branches
- large but bounded input/output JSON
- numeric, categorical, boolean, text, and correction scores
- linked score configs
- a generated manifest
- verification queries for counts, parent integrity, observation kinds, and
  score linkage

If v4 tables are available, create a mirrored logical v4 event scenario. If not,
the manifest should record that v4 verification was skipped because local v4
tables were unavailable.

This first slice is small enough to implement safely but proves the main Seeder
2.0 principles: named scenario, rich data shape, bug-prevention value,
determinism, writer-path clarity, budgets, profile-aware configuration, and
verification.

## Next Step After This RFC

Implement Phase 0 plus the recommended first slice. Do not start with a UI
panel.
