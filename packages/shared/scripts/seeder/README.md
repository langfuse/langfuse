# Langfuse Seed CLI

One command to put any local test state into Langfuse — for developers and
for coding agents.

```bash
pnpm run seed -- doctor                  # check the stack, get the exact fix per failure
pnpm run seed -- list                    # scenarios and flags (--json for machines)
pnpm run seed -- trace-tree --observations 5000 --breadth 1000 --v4
pnpm run seed -- long-session --traces 300 --observations-per-trace 8
pnpm run seed -- many-traces --count 100000 --days 14
```

Every run validates its declared target, writes directly to the local
datastores or through a seeded environment's public API, verifies its writes
with exact readbacks, and prints UI deep links plus a machine-readable JSON
summary as the last stdout line. This file is the design explainer; the command
reference for agents lives in [AGENTS.md](./AGENTS.md) and the
`seed-test-data` skill.

## Why this exists

Two consumers need local seed data and both were underserved:

1. **Coding agents.** "Test the trace list with real data" used to end in
   ad-hoc ts-node scripts and Docker/ClickHouse debugging loops. Now
   `doctor` diagnoses the whole stack with a remediation command per
   failure, and the `seed-test-data` skill routes agents to a one-liner.
2. **Developers.** The default dx seed produces data the frontend shrugs
   at. These scenarios produce the shapes that actually break products:
   thousand-child fan-outs, 60-level chains, megabyte malformed payloads,
   unicode, monster sessions, 100k-trace lists.

The core design: every scenario is a plain function `(params) =>
SeedSummary` with two faces — the CLI for agents, and (future) direct
programmatic calls from the dx seed chain.

## Scenarios

### Agents activity demo

`agents-activity-demo` is curated synthetic telemetry for three familiar flows:
an Agentique-style research assistant, a Halo/Ask AI-style product assistant,
and a coding assistant. These are authored examples, not recordings or claims
about those products' architecture. `--stories agentique,halo,coding` selects
the ordinary conversation cohorts; the fixed Agentique hero is always included.
Each story has distinct logical agent IDs, tools, models and managed skills.
Six tasks per story cover research, product questions and proposed code changes.
Each conversation carries its earlier messages into later requests, delegates
specific work to each agent and ends with a complete answer in the native
Sessions view. Tool observations and model tool-result messages share the same
authored payload. Coding examples contain source excerpts, patch proposals and
test plans; they do not claim that code or tests actually ran.

An **agent run** is one AGENT span, a **trace** is one request, and a **session**
groups several requests in a conversation. Related observations record their
session and nearest owning agent run. The fixed hero is **one session, three
traces and six Researcher agent runs** (two, three and one per trace). Its other
agents contribute three Orchestrator, two Reviewer and three Writer runs:
**14 agent runs overall**. Summary counts, model calls, tokens, cost and exact
hero links come from the generated plan. Scheduled background jobs have
separate traces and no session; they are excluded from the hero totals.

Defaults are 120 conversations, 12 background jobs and 14 completed UTC days,
with irregular daily/hourly traffic and unequal costs, usage, durations and
agent participation. `--date` is the final completed UTC day (yesterday by
default); `--days` is bounded to 1–30. `historyWindow` prints the full inclusive
start and exclusive end. The default links select the final half of that
history: seven days, with the preceding seven available as baseline.
`displayWindow` and `comparisonWindow` make those boundaries explicit, and a
separate link opens the full history. With `--days 1`, a preceding comparison
period is intentionally unseeded.

```bash
# Inspect all stories without API calls or datastore writes.
pnpm run seed -- agents-activity-demo --environment production --date 2026-11-05 --id-prefix assistant-demo-20261105 --dry-run

# Small cohort, with the same explainable hero and distinct behavior examples.
pnpm run seed -- agents-activity-demo --environment production --date 2026-11-05 --id-prefix assistant-demo-small --conversations 6 --days 3 --background-jobs 2 --dry-run

# Restrict ordinary cohorts to research; the existing agents-mvp is unchanged.
pnpm run seed -- agents-activity-demo --environment production --stories agentique --id-prefix research-only --dry-run
```

The behavior cohorts separate several questions:

- Baseline work uses tools and skill version 1. A legacy product-answer router
  appears only in baseline conversations, before the default selected window.
  It does not appear in background or live work.
- Tool-dropout research makes no tool calls despite a skill being available,
  produces an unverified answer and has weaker synthetic outcomes.
- A retry loop makes more model calls, costs more and takes longer, while
  retaining good outcomes. This is independent of tool dropout.
- A candidate model change coincides with weaker authored answer quality while
  tools continue working. Recovery uses the later skill version and a different
  model configuration. These are correlations in an authored fixture, not a
  causal claim, automatic diagnosis or optimization result.

Ordinary cohort AGENT spans own a numeric `answer_quality` score. Researcher runs also
own `citation_coverage`, and requests and sessions have boolean `task_success`.
A partially evaluated subset of agent runs has boolean `review_passed`, so the
quality selector can demonstrate both a numeric average and a boolean true rate
with honest coverage. Story, task, channel, tier and region metadata make the
native search and filter controls useful.
All scores are labeled synthetic and have explicit trace/run/session ownership;
no evaluator or model provider was called. Inspect them through native score
columns and trace details. Costs are provided fixture values, not current
provider-price claims, and AGENT parents contain no duplicated model totals.

A separate sessionless Product search trace ends with an AGENT error and a
failed document-search tool call before any model request. It adds an explicit
terminal failure without changing the hero or the existing cohorts. The run
is intentionally unscored and has no invented model usage or cache report;
its trace has `task_success=0`. Operational errors and low quality remain
separate signals. The summary prints failure counts and its trace link.

Model usage also varies cache reuse: research/product/coding baselines reuse
different prompt proportions, candidate-model regressions have lower reuse,
and recovery warms the cache again. A reported cold miss is explicit zero;
some calls omit cache reporting and remain unknown. `input` is the uncached
remainder and `input_cached_tokens` is the cache-read partition. Their sum
preserves each call's original inclusive input, while `total` tokens, provided
cost and the hero's 38,032 tokens / $0.103532 authored cost remain unchanged.

`--candidate-environment staging` creates a distinct comparison cohort in a
second environment. It must differ from `--environment`; links for both are
printed. All logical agent IDs include `--id-prefix`. Use a dedicated existing
demo project for a clean gallery; an environment is a filter boundary, not a
separate project or cleanup mechanism. Nothing is deleted. Use a fresh prefix
when changing the date, seed, stories or volume because timestamps are part of
ClickHouse storage keys.

Start the matching local app or disposable PR preview and set `NEXTAUTH_URL`.
For the default seeded project, omit `--credentials-file` to use its synthetic
key. For a dedicated existing project, pass `--project <project-id>
--credentials-file /private/path/demo-credentials.json`; the private file must
contain exactly `publicKey` and `secretKey` string fields. The CLI provisions
neither projects nor keys. It verifies key ownership before fixture writes,
refuses production targets and redirects, and keeps credentials and server
authentication payloads out of errors. Keep this file outside the checkout.

The public Skills API creates or reuses two exact versions per selected story
(six versions by default), checks file hashes and rejects conflicting content.
Reruns preserve a production label already assigned to a later version.
References bind to actual catalog IDs and versions, including `SKILL.md` and
observed `references/checklist.md` loads. Each agent also links to a real managed
chat prompt containing the exact system message recorded on its model calls.
Info shows a description, agent version, service and instrumentation scope.
Native
session records, events and scores use the official seeder infrastructure.
Write copies receive fresh revision timestamps while IDs and start/timestamp
storage keys remain deterministic, so same-prefix updates supersede older
fixture content without mutating the plan.
Bounded project-scoped readbacks check rows, agent runs, scores, exact managed
loads, hero totals and the absence of the retired router in the display window.
Bootstrap tables before seeding; bootstrap removes v4-only fixture data.

Live replay is **off by default**. Opt in with `--replay`; defaults are six
batches separated by five seconds. `--replay-count` accepts 1–20 and
`--replay-interval-ms` accepts 1000–15000, with at most four minutes of scheduled
delays and a five-minute replay deadline. There is no daemon or provider call.
Each batch emits newly identified, completed synthetic spans through
`/api/public/otel/v1/traces`, explicitly selecting v4 ingestion. Run-owned
scores use `/api/public/scores`. Live trace/span IDs and live session IDs are
separate from deterministic history; the logical agents remain the same.
Sessions span successive batches, and every third batch includes a sessionless
background job. Timestamped work, skill manifests and tool results are real
ingestion payloads, not a UI heartbeat. Queued rows, managed loads and scores
are verified before success. `replay.result` reports separate live counts and
links; its Agents link ends at replay completion and retains a selected window
of the same length as the static display period.
Replay requires history ending yesterday, so omit `--date` or choose the last
completed UTC day; an older explicit date is rejected before fixture writes.
Replay preserves the authored messages, tags, prompt references, model parameters
and instrumentation metadata from the historical examples.

Real application recordings can use the same project alongside this history.
Use a distinct application identity and record provenance in metadata; for local
applications, a `demo-live` environment makes them easy to select. Keep their
actual outputs, usage and failures. Do not apply authored synthetic scores to
real runs or describe this provider-free replay as an executed application.

```bash
# A real, finite ingestion run; private project credentials are optional only
# for the default seeded project. The default date keeps history recent.
NEXTAUTH_URL=http://localhost:3017 pnpm run seed -- agents-activity-demo --project <project-id> --credentials-file /private/path/demo-credentials.json --environment production --id-prefix assistant-live-demo --replay --replay-count 6 --replay-interval-ms 5000
```

### Agents regression fixture

`agents-mvp` creates eight observed agent identities with invocation spans,
model requests, native skill versions/resource paths, unknown telemetry,
rewrites and tombstones. It selects 11:00–15:00 UTC on `--date` (today by
default) and also writes older rows for index-pruning checks. Use a fresh
`--id-prefix` when changing the date or `--runs` (80 ordinary invocations by
default, up to 100000, plus one invocation crossing the selected period).
The parent aggregate deliberately repeats the three model leaves' 17,107 input
and 491 output tokens; Agents must count the leaves once. Start with
`pnpm run seed -- agents-mvp --environment production`; add `--runs 10000`
for a larger local cohort. Start the seeded web app first and set
`NEXTAUTH_URL` to its local or disposable PR preview URL (for example,
`NEXTAUTH_URL=http://localhost:3017`). The scenario uses only the synthetic
seed API key and verifies its project before creating two managed skill
versions in a prefix-scoped namespace through the public Skills API. Repeating
the same prefix reuses matching versions; conflicting content fails without
overwriting it. Native references contain exact catalog IDs and versions, and
one unregistered resource remains as an unresolved example. Add `--legacy-api`
to exercise queued public JSON ingestion in a separate trace namespace.
Add `--sessions` to group the agents into conversations across traces, with
synthetic messages, tool activity, and matching Postgres session records. The
same conversation includes several agents; standalone boundary-case traces
remain sessionless. The command prints session links. For the conversational
timeline, enable the Session View and Session Timeline previews for the local
demo account. This option preserves the fixture's stable storage keys and
accounting cases; use a fresh prefix for a dedicated conversation demo.
The main fixture writes v4 events only. Run table
bootstrap before seeding: `ch:dev-tables` rebuilds event tables and removes
v4-only fixture data.

Run `pnpm --filter @langfuse/shared run agents:verify --date 2026-11-05
--prefix agents-mvp-proof-20261105` after seeding that 80-invocation fixture.
This read-only verifier checks accounting, updates, tombstones, environment
changes, exact managed-skill catalog references for all eight agents, the
unresolved resource, source evidence and activity crossing the selected period.
Use `pnpm --filter @langfuse/shared run agents:benchmark --from
2026-11-04T11:00:00Z --to 2026-11-04T15:00:00Z --environment production
--output scripts/seeder/agents-mvp-performance.json` for the larger fixture.
The benchmark records client timings, query-log reads/memory and index pruning;
it only accepts local ClickHouse. These synthetic measurements are not a
production latency guarantee.

For mixed-project measurements, use a fresh prefix and date with
`--runs 80 --background-events 1000000 --unassigned-model-calls 2`.
Background generations have no agent identity and live on unrelated traces;
the two additional generations share the first agent's trace but have no
attribution. They produce a trace-level completeness warning without adding
their tokens or cost to any agent. Pass `--unassigned-model-calls 2` to
`agents:verify` for this fixture. Background writes are streamed in 10000-row
batches; the default fixture remains unchanged.

The checked-in mixed-project comparison uses newly inserted physical identity
columns. It does not measure cold reads of historical parts whose new column
defaults may still extract identity from metadata. No backfill, materialization,
table reset or resource-limit increase is needed for the fixture.

| Scenario               | Covers                                                                                                                                                                                                                                                                                                                                                                   | Key flags                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trace-tree`           | one trace with a large, branching observation tree: all ten observation kinds always present, guaranteed depth backbone, hub node with many children, errors/retries/missing end times                                                                                                                                                                                   | `--observations`, `--depth`, `--breadth`, `--payload-bytes`, `--payload-style json\|text\|malformed\|unicode`, `--v4`                                                                             |
| `agent-timeline`       | one trace: a realistic LangGraph-style refine-loop agent (planner → retriever → generator → critic → loop) unrolled over N turns, with observations staggered across a real timeline and langgraph_node/step metadata                                                                                                                                                    | `--turns`, `--turn-gap-ms`, `--timing-only`                                                                                                                                                       |
| `agent-graph`          | one trace that is large as a GRAPH, not as a tree: many distinct langgraph_node names with parallel branches per super-step, so the aggregated graph gets thousands of distinct node-pair connections from a few hundred observations                                                                                                                                    | `--nodes`, `--steps`, `--parallel`                                                                                                                                                                |
| `deep-chain`           | one trace whose observations form a single deep parent chain of sequential generations (child starts after parent ends; depth = observation count) — the mis-parented-instrumentation shape that collapses tree/timeline layouts at extreme depth                                                                                                                        | `--observations`                                                                                                                                                                                  |
| `long-session`         | one session with many traces for session-detail and virtualization work; creates the Postgres `trace_sessions` row the session page requires                                                                                                                                                                                                                             | `--traces`, `--observations-per-trace`, `--payload-bytes`, `--minutes`, `--session-id`, `--v4`                                                                                                    |
| `many-traces`          | trace-list and filter performance via `numbers()` bulk SQL; parent/score/prompt/session links all resolve                                                                                                                                                                                                                                                                | `--count`, `--days`, `--observations-per-trace`, `--scores-per-trace`, `--rich-payloads`                                                                                                          |
| `outlier-traffic`      | diurnal base traffic over the past N days with deterministic cost/latency/token outliers and hour-long latency incidents — built for the outlier chart strip above the trace table                                                                                                                                                                                       | `--days`, `--traces-per-day`, `--incidents`                                                                                                                                                       |
| `scored-traces`        | standalone traces with mixed current/legacy Python and JavaScript SDK attribution, each carrying numeric + categorical scores whose names contain SPACES (e.g. "Rouge Score") at observation and trace level, plus dual-level score names ("confidence", "verdict") present at both levels on the same trace                                                             | `--traces`                                                                                                                                                                                        |
| `session-shapes`       | diverse v4 session shapes for the session-detail view: a clean multi-turn CHAT session (renders as chat), a coding/AGENT session whose I/O lives on AGENT/TOOL observations with NO GENERATION, a MIXED session, and a MEDIA session whose messages carry langfuseMedia references                                                                                       | `--shape chat\|agent\|mixed\|media\|all`, `--turns`                                                                                                                                               |
| `annotation-queue`     | two human-annotation queues for the annotate UI: a "core types" queue with one of every score-field render path (categorical toggle/combobox, boolean, ranged/decimal/unranged numeric, text) over fresh trace items, and an "edge cases" queue adding archived/stale/partial scores, comments, and observation/session/deleted/completed items                          | `--core-items`, `--v4` (default true)                                                                                                                                                             |
| `custom-models`        | project-level model definitions (one tiered with a condition-gated second tier and a usage type priced at 0, one single-tier) plus a trace whose generations link to them, and one generation whose model matches no definition so its badge opens the create dialog; `--usage-states` adds root/child inferred, empty, zero, and error usage/cost fixtures              | `--usage-states`                                                                                                                                                                                  |
| `evaluator-gallery`    | project-owned code evaluators for gallery pagination and infinite-scroll testing; reconciles deterministic names through the seeded public API key so local and PR preview environments are supported                                                                                                                                                                    | `--count`                                                                                                                                                                                         |
| `assistant-skills`     | bundled assistant skills imported through the seeded public API key, with production labels and an assistant catalog tag; unchanged versions are reused                                                                                                                                                                                                                  | `--tag`, `--demo`, `--demo-files`                                                                                                                                                                 |
| `support-agent`        | one demo-grade, fully handcrafted trace: a customer-support copilot resolving a duplicate-charge refund — input guardrail → intent classification → parallel context fan-out (CRM/billing/tickets) → 3-turn ReAct loop (llm.chat + Stripe tools) → drafted reply → output guardrail → send                                                                               | —                                                                                                                                                                                                 |
| `incident-session`     | one demo-grade, fully handcrafted multi-user v4 session: an on-call copilot and four engineers work a checkout-latency incident over seven turns — parallel, untraced and failing tool calls, a nested sub-agent, reasoning, markdown answers, a guardrail-flagged refusal, typed session scores and comments                                                            | `--v4` (default true)                                                                                                                                                                             |
| `timeline-shapes`      | a dozen SMALL traces (4-25 observations each), one per timeline morphology: rag answer, streamed chat, parallel fan-out, retry backoff with widening gaps, a 13-minute wait on a human, one slow tool dwarfing everything, an error cascade with failover, in-flight spans, zero-duration checkpoints, a ten-level ladder, 24 flat siblings, and a three-turn agent loop | `--shape all\|rag-answer\|streaming-chat\|parallel-fanout\|retry-backoff\|waiting-on-approval\|slow-tool\|error-cascade\|still-running\|checkpoint-marks\|deep-ladder\|flat-siblings\|mixed-loop` |
| `agents-activity-demo` | curated synthetic research, product-answer and coding history: repeated agent runs within traces, multi-trace sessions, sessionless jobs, baseline-only routing, model/skill revisions, run-owned quality scores and opt-in finite OTLP replay                                                                                                                           | `--date`, `--days`, `--conversations`, `--background-jobs`, `--candidate-environment`, `--credentials-file`, `--stories`, `--replay`, `--replay-count`, `--replay-interval-ms`                    |

Common flags: `--project` (defaults to the seeded example project),
`--environment`, `--seed`, `--id-prefix`, `--dry-run` (instant, arithmetic
counts, writes nothing), `--json` (machine mode: pure-JSON stdout).

For queue setup testing, use `annotation-queue --setup-demo --core-items 4`.
It seeds Answer quality and Safety review queues with different, nonalphabetical
score config orders and a shared Feedback config, plus a Start here queue with
four pending items and intentionally empty `scoreConfigIds`. This empty queue is
a test fixture; the application still requires a config when saving. The demo
uses separate queue names and adds `-setup` to the ID prefix, preserving the
default keyboard QA fixtures. It includes observation, session, and completed
examples but skips the missing-object item.

Add `--score-config-count 60` to seed a larger, varied project catalog. With
`--setup-demo`, Answer quality selects 35 fields and Safety review selects 34,
using different subsets and orders; Start here stays unconfigured. The default
is nine configs, and the supported range is 9–500. Use a fresh project and
`--id-prefix` for an independent fixture: queue names are reused within a project.

Scenarios compose: e.g. a session where one trace has zero observations is
two `long-session` runs sharing a `--session-id` with different
`--id-prefix` values.

### Managed assistant skills

With the seeded local web app running, import the checked-in assistant catalog:

```bash
pnpm run seed -- assistant-skills
```

This imports the checked-in Halo `langfuse` skill and its complete text-file tree through `/api/public/skills` using the synthetic seed API key. Its dedicated entrypoint is maintained in `packages/langfuse-skills/halo/langfuse/SKILL.md`; reference files are synced from `langfuse/skills`. MCP serves both original upstream skills independently. Resource contents and paths relative to the skill's `SKILL.md` are preserved. The scenario adds the `in-app-agent` tag and labels each imported version `production`. Re-running reuses unchanged versions. Names match each skill's frontmatter, so `--seed` and `--id-prefix` do not create independent copies. The scenario verifies all production file contents through the API and prints UI links. Use `--dry-run` to inspect the catalog without writing, or `--tag <tag>` to select a different catalog tag.

For a distinct end-to-end check, run `pnpm run seed -- assistant-skills --demo`.
It also creates an instructions-only `local-assistant-check` skill. Open the
seeded project, open the assistant, start a new chat and send:
"Run the local assistant check skill." The expected response is exactly
"Hosted skills are connected." Open Skills → local-assistant-check to inspect
its `SKILL.md` instructions.

For file-list and usage-layout checks, run `pnpm run seed -- assistant-skills --demo-files 25`. This also creates `local-many-files` with 25 files: `SKILL.md` and 24 synthetic reference files. The count can be 1-100; the default of 0 leaves this fixture out. The fixture does not receive the assistant catalog tag. Open the skill's Usage tab to check scrolling with a long file list.

To use these skills in the local assistant, set the following worker environment
and restart the worker:

```dotenv
LANGFUSE_AI_FEATURES_HOST=http://localhost:3000
LANGFUSE_AI_FEATURES_PUBLIC_KEY=pk-lf-1234567890
LANGFUSE_AI_FEATURES_SECRET_KEY=sk-lf-1234567890
LANGFUSE_IN_APP_AGENT_SKILLS_TAG=in-app-agent
```

The keys above are the public synthetic development fixtures. The assistant exposes repository skills and tagged hosted production skills through a read-only Mastra `SkillSource`. Mastra discovers the skills and loads their instructions and references. Hosted manifests take precedence by name; missing, unselected, or failed hosted lookups fall back to repository skills. A failed hosted catalogue request retains the repository catalogue. Leaving the tag unset uses only repository skills and makes no skill API requests.

Selected manifests and file content are cached for each run. Failed content requests can be retried; caller cancellation propagates. Edit an imported skill in Skills, create a version and assign `production`; the next assistant run discovers the updated version. The checked-in catalogue supplies both the seed input and the runtime repository skills.

### Experiment filter fixture

`NEXTAUTH_URL=http://localhost:3010 pnpm run seed -- experiment-filters --id-prefix experiment-targets`
creates the runs **Filter A**, **Filter B**, and **Filter C** over 60 shared
items. Their distinct numeric `quality`, categorical `verdict`, boolean
`approved`, status, item metadata (`category`, `cohort`) and event metadata
(`region`, `variant`) make experiment targeting visible. Filter C omits items
6, 12, …, 60. Each run also omits ten quality scores.

For `quality > 0.8`, the per-experiment matches are:

| Experiment | Matching item numbers, repeated every six items | Count |
| ---------- | ----------------------------------------------- | ----- |
| Filter A   | 4, 5                                            | 20    |
| Filter B   | 2, 3                                            | 20    |
| Filter C   | 1                                               | 10    |

Adding `level:ERROR` to Filter B narrows its matching items to 2, 8, …, 56
(10 items). These are per-experiment matches; the comparison table's item
coverage mode still determines how the sets are combined.

For query-volume and suggestion-cardinality checks, use a fresh prefix:

`pnpm run seed -- experiment-filters --items 12000 --extra-score-names 600 --id-prefix experiment-options-perf`

This creates 34,000 events and 130,000 scores. Each event gets one additional
numeric score, cycling through 600 names; Filter B places those scores on the
trace, while A and C place them on the root observation. Readback verifies both
row counts and the expected quality matches (4,000 / 4,000 / 2,000).

## Topics

```bash
pnpm run seed -- topics
pnpm run seed -- topics --batch evaluation --id-prefix topics-eval-s42
```

The default seeds discovery and held-out assignment traces; `evaluation` adds varied requests and tool outcomes. Both include v4 events and make no model calls. Theme/outcome labels stay out of trace metadata and I/O.

Use `--batch discovery`, summarize those traces, then update topics with **Small sample mode**. Process `--batch assignment` after the map is published to check assignment to existing topics. These processing steps require configured models. The evaluation batch also needs small sample mode for facets with fewer than the normal minimum of applicable summaries. Use `pnpm run seed -- list` for flags.

## The contract (additive-only)

Scenario names, flag names, JSON summary keys, and exit-code semantics are a
public contract for agents and scripts — evolve them additively, never
rename or remove.

- The last stdout line is a JSON summary: `traceIds`, `sessionIds`,
  `counts`, `verified` (exact `uniqExact` ClickHouse readbacks — every key
  is asserted, shortfalls exit non-zero), `links`, `durationMs`.
- Every error prints `error:` and `fix:` lines, never a stack trace —
  including a missing `.env` (the CLI is a thin bootstrap in `cli.ts` that
  prechecks env vars before importing `src/server`, whose env schema would
  otherwise throw at import).
- Determinism: same `--seed` and flags produce byte-identical data. Ids
  never contain dates; timestamps anchor to the current UTC day, so
  same-day re-runs overwrite in place and later-day re-runs re-anchor the
  same ids. Independent copies come only from `--id-prefix`.

## Data integrity guarantees

Seeded data behaves like production data:

- parents start before and end after their children (waterfall containment,
  in scenarios and in the bulk SQL)
- `completion_start_time` (TTFT) falls inside the generation's duration
- scores reference observations and sessions of their own trace; each score
  name maps to exactly one data_type; BOOLEAN string values are
  `True`/`False` (production casing)
- generations link to real Postgres prompts (the trace-detail prompt badge
  resolves) or carry NULLs — never fabricated ids
- session/user pools are `--id-prefix`-scoped, with their `trace_sessions`
  rows created

## ClickHouse determinism rules (the hard-won part)

ReplacingMergeTree dedups by the full ORDER BY tuple, so **any value that
lands in an ORDER BY key must not come from the sequential rng stream or
the wall clock** — otherwise re-runs silently duplicate rows and
`uniqExact` readbacks cannot see it. Concretely:

- time anchors come from `utcDayStartMs()` (UTC midnight, computed in TS —
  ClickHouse's `today()` is server-timezone)
- per-row variation comes from the stateless `jitter(seed, index, max)`
  (scenarios) or salted `xxHash32(number)` columns (bulk SQL); wrap hash
  inputs in `toUInt64` — xxHash32 hashes the binary representation, and a
  type-narrowing modulo silently changes the hash of the same value
- the sequential `Rng` stream is fine for anything NOT in an ORDER BY key
  (names, payload contents, usage numbers)

Relevant ORDER BY keys: v3 observations sort on `type`; all v3 tables sort
on `toDate(...)`-style time keys; `events_full` sorts on microsecond
`start_time`.

## v3 + v4

`--v4` mirrors every observation into `events_full` following the canonical
mapping in `clickhouse/scripts/dev-tables.sh`: one synthetic trace span per
trace (`span_id = 't-<traceId>'`, `parent_span_id = ''`) carries the
trace-level fields the v4 aggregations read, and root observations hang off
it. `events_core` fills via the materialized view. Facts that matter:

- `events_full` has no `id` column; `span_id` is the row identifier
- the v4 read path is the per-user "V4 preview" sidebar toggle or
  `LANGFUSE_MIGRATION_V4_WRITE_MODE=events_only` server-side; the trace URL
  is identical in both modes
- `many-traces` is deliberately v3-only — its traces correctly show "not
  found" in events-only mode

## Relationship to `pnpm run dx`

The dx flow is unchanged: the CLI is additive and no presets are wired in.
The shared bulk builders that dx's `ch:seed` step uses received the same
integrity fixes (resolvable parents/prompts/scores, deterministic re-runs),
so dx-seeded bulk data is strictly better-shaped than before, at the same
cost.

## Layout

- `cli.ts` — env-precheck bootstrap; `cli-main.ts` — the actual CLI
- `doctor.ts` — stack checks (Postgres, migrations, project, ClickHouse +
  tables + memory pressure, Redis, MinIO, web app), each with a fix command
- `scenarios/` — one file per scenario plus `rng.ts` (Rng/jitter/anchor),
  `payload.ts`, `event-mirror.ts` (v3→v4 mapping), `verify.ts` (readbacks)
- `seed-postgres.ts`, `seed-clickhouse.ts`, `utils/` — the pre-existing dx
  seed path (the bulk builders in `utils/clickhouse-builder.ts` are shared)

## What's next (deliberately not built yet)

- **Ingestion API writer**: build trace and observation data as public
  ingestion batches against a target URL, with batch limits and `--wait`
  readback — the same command would then emulate realistic ingestion against
  local web+worker or staging.
- **dx presets**: a `scenarios/presets.ts` invoked from the examples seed,
  selected via `LANGFUSE_SEED_PRESET`, to give default dx data more variety
  without flags or interactivity.
- More scenarios as needs surface: score zoo (blocked on the insert
  schema's non-nullable `value` for TEXT scores), annotation queue items,
  multi-run dataset experiment loops (single-run structured I/O is available
  through `experiment-io`), media edge cases, deliberate orphan shapes
  behind explicit flags.

The original design discussion (registry/profiles/budgets alternatives,
bug-history research) lives in git history: `4b77c8ef7` (first RFC draft)
and this file's own history as `seeder-2-0-rfc.md`.
