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

| Scenario            | Covers                                                                                                                                                                                                                                                                                                                                                                   | Key flags                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trace-tree`        | one trace with a large, branching observation tree: all ten observation kinds always present, guaranteed depth backbone, hub node with many children, errors/retries/missing end times                                                                                                                                                                                   | `--observations`, `--depth`, `--breadth`, `--payload-bytes`, `--payload-style json\|text\|malformed\|unicode`, `--v4`                                                                             |
| `agent-timeline`    | one trace: a realistic LangGraph-style refine-loop agent (planner → retriever → generator → critic → loop) unrolled over N turns, with observations staggered across a real timeline and langgraph_node/step metadata                                                                                                                                                    | `--turns`, `--turn-gap-ms`, `--timing-only`                                                                                                                                                       |
| `agents-view`       | eight Agents profiles with attributed costs, nested agents, two meaningful skills per agent, production/staging data, Unicode/URL names and a partial-cost integration; 20 pipelines plus two name-only traces by default                                                                                                                                                | `--traces`, `--hours`, `--end-hour`, `--date YYYY-MM-DD`, `--v4` (default true)                                                                                                                   |
| `agent-graph`       | one trace that is large as a GRAPH, not as a tree: many distinct langgraph_node names with parallel branches per super-step, so the aggregated graph gets thousands of distinct node-pair connections from a few hundred observations                                                                                                                                    | `--nodes`, `--steps`, `--parallel`                                                                                                                                                                |
| `deep-chain`        | one trace whose observations form a single deep parent chain of sequential generations (child starts after parent ends; depth = observation count) — the mis-parented-instrumentation shape that collapses tree/timeline layouts at extreme depth                                                                                                                        | `--observations`                                                                                                                                                                                  |
| `long-session`      | one session with many traces for session-detail and virtualization work; creates the Postgres `trace_sessions` row the session page requires                                                                                                                                                                                                                             | `--traces`, `--observations-per-trace`, `--payload-bytes`, `--minutes`, `--session-id`, `--v4`                                                                                                    |
| `many-traces`       | trace-list and filter performance via `numbers()` bulk SQL; parent/score/prompt/session links all resolve                                                                                                                                                                                                                                                                | `--count`, `--days`, `--observations-per-trace`, `--scores-per-trace`, `--rich-payloads`                                                                                                          |
| `outlier-traffic`   | diurnal base traffic over the past N days with deterministic cost/latency/token outliers and hour-long latency incidents — built for the outlier chart strip above the trace table                                                                                                                                                                                       | `--days`, `--traces-per-day`, `--incidents`                                                                                                                                                       |
| `scored-traces`     | standalone traces with mixed current/legacy Python and JavaScript SDK attribution, each carrying numeric + categorical scores whose names contain SPACES (e.g. "Rouge Score") at observation and trace level, plus dual-level score names ("confidence", "verdict") present at both levels on the same trace                                                             | `--traces`                                                                                                                                                                                        |
| `session-shapes`    | diverse v4 session shapes for the session-detail view: a clean multi-turn CHAT session (renders as chat), a coding/AGENT session whose I/O lives on AGENT/TOOL observations with NO GENERATION, a MIXED session, and a MEDIA session whose messages carry langfuseMedia references                                                                                       | `--shape chat\|agent\|mixed\|media\|all`, `--turns`                                                                                                                                               |
| `annotation-queue`  | two human-annotation queues for the annotate UI: a "core types" queue with one of every score-field render path (categorical toggle/combobox, boolean, ranged/decimal/unranged numeric, text) over fresh trace items, and an "edge cases" queue adding archived/stale/partial scores, comments, and observation/session/deleted/completed items                          | `--core-items`, `--v4` (default true)                                                                                                                                                             |
| `custom-models`     | project-level model definitions (one tiered with a condition-gated second tier and a usage type priced at 0, one single-tier) plus a trace whose generations link to them, and one generation whose model matches no definition so its badge opens the create dialog                                                                                                     | —                                                                                                                                                                                                 |
| `evaluator-gallery` | project-owned code evaluators for gallery pagination and infinite-scroll testing; reconciles deterministic names through the seeded public API key so local and PR preview environments are supported                                                                                                                                                                    | `--count`                                                                                                                                                                                         |
| `support-agent`     | one demo-grade, fully handcrafted trace: a customer-support copilot resolving a duplicate-charge refund — input guardrail → intent classification → parallel context fan-out (CRM/billing/tickets) → 3-turn ReAct loop (llm.chat + Stripe tools) → drafted reply → output guardrail → send                                                                               | —                                                                                                                                                                                                 |
| `incident-session`  | one demo-grade, fully handcrafted multi-user v4 session: an on-call copilot and four engineers work a checkout-latency incident over seven turns — parallel, untraced and failing tool calls, a nested sub-agent, reasoning, markdown answers, a guardrail-flagged refusal, typed session scores and comments                                                            | `--v4` (default true)                                                                                                                                                                             |
| `timeline-shapes`   | a dozen SMALL traces (4-25 observations each), one per timeline morphology: rag answer, streamed chat, parallel fan-out, retry backoff with widening gaps, a 13-minute wait on a human, one slow tool dwarfing everything, an error cascade with failover, in-flight spans, zero-duration checkpoints, a ten-level ladder, 24 flat siblings, and a three-turn agent loop | `--shape all\|rag-answer\|streaming-chat\|parallel-fanout\|retry-backoff\|waiting-on-approval\|slow-tool\|error-cascade\|still-running\|checkpoint-marks\|deep-ladder\|flat-siblings\|mixed-loop` |

Common flags: `--project` (defaults to the seeded example project),
`--environment`, `--seed`, `--id-prefix`, `--dry-run` (instant, arithmetic
counts, writes nothing), `--json` (machine mode: pure-JSON stdout).

Scenarios compose: e.g. a session where one trace has zero observations is
two `long-session` runs sharing a `--session-id` with different
`--id-prefix` values.

## Agents view

```bash
pnpm run seed -- agents-view --environment production
```

The default fixture has eight agents and spans 08:00–12:00 UTC on the current
UTC day. Every agent has two meaningful skills, including the URL-special and
name-only profiles. Skill invocations carry the owning agent's name, so the
Skills tab can show invocation counts, trace coverage and drill-downs for each
profile. Skills remain a tool-name preview rather than a registry.

| Agent                   | Skills                                             |
| ----------------------- | -------------------------------------------------- |
| `agentique`             | `task-routing`, `response-orchestration`           |
| `intake`                | `requirements-extraction`, `intent-classification` |
| `research`              | `source-discovery`, `evidence-ranking`             |
| `verify`                | `evidence-audit`, `consistency-check`              |
| `verify-citation`       | `citation-resolution`, `source-attribution`        |
| `compose`               | `citation-style`, `answer-format`                  |
| `compose / résumé? v1#` | `résumé-style`, `locale-adaptation`                |
| `native-name-only`      | `integration-handshake`, `answer-normalization`    |

The printed Agents list and profile links pin the generated UTC window with
`dateRange`; each profile also has a Skills link with `tab=skills`. Use those
links when reviewing a fixture on a later day. Set
`NEXTAUTH_URL` when the app uses a port other than 3000.

To enrich an existing fixture while keeping its trace IDs and original window,
pin its original date and reuse its prefix and other flags:

```bash
NEXTAUTH_URL=http://localhost:3017 pnpm run seed -- agents-view --environment production --date YYYY-MM-DD --id-prefix original-prefix --v4
```

Replace `YYYY-MM-DD` and `original-prefix` with the fixture's original UTC date
and prefix. Keep its environment, `--seed`, `--traces`, `--hours` and
`--end-hour` unchanged; the defaults use 20 pipelines and four hours ending at
12:00 UTC. `--date` defaults to today when omitted or empty. It accepts a valid
UTC calendar date in `YYYY-MM-DD` form. Choose a fresh `--id-prefix` when changing
the date or timing instead of pinning the original date: events include
`start_time` in their ORDER BY key, so reusing IDs with different timestamps
leaves both versions in storage.

## Topics

After applying the normal Postgres and ClickHouse migrations, seed either fixture:

```bash
pnpm run seed -- topics
pnpm run seed -- topics --batch evaluation --id-prefix topics-eval-s42
```

The default batch creates 12 discovery traces across three themes and three
assignment traces (two familiar themes and one new theme), with v4 events enabled
by default. `--batch discovery` seeds IDs `-t00` through `-t11`;
`--batch assignment` seeds `-t12` through `-t14`. Process the `discovery` tag,
choose **Update topics** with **Small sample mode**, then process the
held-out `assignment` tag after publishing a map.

The evaluation batch creates 100 traces (`-e00` through `-e99`) with five intent
themes and cross-cutting tool outcomes: 20 each of timeout, denied access,
invalid JSON, empty results, and success. Each trace has a generation and a
child tool. Intent has 100 applicable traces; Issues has 80 and needs **Small
sample mode** with the default minimum-count settings.

Seeding makes no model calls. Theme/outcome labels remain outside trace metadata
and I/O.

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
- Determinism: same `--seed`, flags and UTC anchor date produce byte-identical
  data. Ids never contain dates; timestamps default to the current UTC day.
  `agents-view --date YYYY-MM-DD` pins that anchor for later re-runs. Reuse a
  prefix only with the original date and timing; use a fresh `--id-prefix` for
  another date or independent copy.

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

- time anchors come from `utcDayStartMs()` or a scenario's validated `--date`
  (UTC midnight, computed in TS — ClickHouse's `today()` is server-timezone)
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
- the v4 read path is the per-user "V4 Preview" sidebar toggle or
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
