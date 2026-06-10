# RFC: Seeder 2.0 — One Seeding Engine, Two Callers

Status: proposed

Date: 2026-06-10

This revision supersedes the 2026-06-08 draft (preserved in git history at
`4b77c8ef7`). That draft proposed a scenario registry with profiles, budget
enforcement, manifest schemas, a verification framework, and a six-phase
plan. That is too much machinery before the key need is solved. This
revision is narrower and is designed to ship as one short, reviewable PR
plus one small follow-up.

## Key Need

Two callers need local seed data, and both are underserved today:

1. **Coding agents.** When an agent is asked to test something that needs
   data — trace list performance, a long session, a large observation tree,
   v4 events — there is no supported path. The agent improvises ad-hoc
   ts-node scripts or raw ClickHouse inserts and reliably gets stuck in
   Docker/ClickHouse/env loops: wrong env file, wrong ts-node compiler
   options, missing migrations, missing dev tables, stopped containers.
   Each loop burns most of a session.
2. **`pnpm run dx`.** The default seed works but is shallow: bulk rows are
   mostly three observation types, the "comprehensive" workflow is one
   fixed linear chain, large JSON fixtures are truncated before insert,
   and there are no branching trees or monster sessions. A fresh install
   has data, but not the data shapes that actually break the product.

The fix for both is the same artifact: a small set of **parameterized
scenario functions** with two faces — a stable CLI for agents, and direct
programmatic calls from the dx seed chain for humans. Not a registry
framework, not seed profiles, not a config-file family.

"Agentized bi-directionally" means concretely:

- agents can _drive_ the seeder: one command one-shots the state they need,
  locally or against staging via the public API;
- the configuration humans use is _itself agent-legible_: plain flags, env
  vars, and one preset file in code — no interactive-only paths, no state
  an agent cannot discover from `--help` and `AGENTS.md`.

## Design Principles

1. **One implementation, two callers.** Each scenario is a plain exported
   function `(params) => Promise<SeedSummary>`. The CLI parses flags into
   params; the dx seed chain calls the same functions with fixed small
   params. Nothing is reachable only through an interactive prompt.
2. **The CLI surface is an agent contract.** Scenario names, flag names,
   JSON output keys, and exit codes are stable and evolve additively.
   `seed list` and `--help` make it discoverable;
   `packages/shared/scripts/seeder/AGENTS.md` maps "I need X" to the exact
   command.
3. **Fail with the fix.** Every environment failure prints the exact
   remediation command (`pnpm run infra:dev:up`, `pnpm --filter=shared run
ch:reset`, ...). A `doctor` subcommand checks the whole stack up front
   so agents stop diagnosing Docker by trial and error.
4. **Deterministic and idempotent.** Scenarios accept a numeric `--seed`
   and an `--id-prefix`; identical params produce identical IDs, and
   re-runs are absorbed by ReplacingMergeTree instead of duplicating data.
5. **Cheap by default.** The dx variety pack stays within roughly +15s and
   a few MB over today's seed. Anything heavy is something you explicitly
   ask for with flags.

## CLI

Entry point `packages/shared/scripts/seeder/cli.ts`, wired like existing
seed scripts so env loading just works:

```jsonc
// packages/shared/package.json
"seed:scenario": "dotenv -e ../../.env -- tsx scripts/seeder/cli.ts"

// root package.json (convenience alias)
"seed": "pnpm --filter=shared run seed:scenario --"
```

### Usage

```bash
pnpm run seed -- doctor
pnpm run seed -- list
pnpm run seed -- trace-tree --observations 5000 --depth 8 --breadth 50 --kinds all
pnpm run seed -- long-session --traces 300 --observations-per-trace 8
pnpm run seed -- many-traces --count 100000 --days 14
```

### Subcommands

- `doctor` — preflight the stack and print PASS/FAIL with the exact fix:
  - Postgres reachable and migrations applied → `pnpm run infra:dev:up`,
    `pnpm --filter=shared run db:reset`
  - ClickHouse reachable and `traces` table present →
    `pnpm --filter=shared run ch:reset`
  - v4 dev tables (`events_full`, `events_core`) present (warn-only) →
    `pnpm --filter=shared run ch:dev-tables`
  - MinIO/S3 and Redis reachable (warn-only; needed for media and the API
    writer respectively)

  Exits non-zero on hard failures. Supports `--json`. Scenario runs invoke
  the same checks first, so a misconfigured environment fails in seconds
  with instructions instead of a stack trace.

- `list` — print scenarios with their flags and defaults (`--json` too).
- `<scenario> [flags]` — run one scenario.

### Scenarios v1

Each scenario covers one recurring "agent, please fill in..." request:

| Scenario       | Covers                                                                                                   | Key flags                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `trace-tree`   | one trace with a large/branching observation tree, all observation kinds, many children under one parent | `--observations`, `--depth`, `--breadth`, `--kinds`, `--payload-bytes`, `--payload-style json\|text\|malformed\|unicode` |
| `long-session` | one session with many traces for session-detail and virtualization work                                  | `--traces`, `--observations-per-trace`, `--with-scores`                                                                  |
| `many-traces`  | trace-list and filter performance                                                                        | `--count`, `--days`, `--users`, `--tags`                                                                                 |

Common flags: `--project <id>` (defaults to the seeded example project),
`--environment <name>`, `--seed <n>`, `--id-prefix <s>`, `--dry-run`
(print planned counts, write nothing), `--json`.

Scenario functions live in `packages/shared/scripts/seeder/scenarios/` and
are registered in one plain object map — no typed registry, no metadata
schema. They reuse the existing `DataGenerator` / `ClickHouseQueryBuilder`
and the record types from `src/server/test-utils` rather than inventing a
builder layer.

### Output Contract

Human-readable progress on stderr; one final JSON summary line on stdout
(`--json` suppresses the progress lines):

```json
{
  "scenario": "trace-tree",
  "params": { "observations": 5000, "depth": 8, "breadth": 50 },
  "projectId": "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
  "traceIds": ["tree-a1b2-root"],
  "sessionIds": [],
  "counts": { "traces": 1, "observations": 5000, "scores": 120 },
  "verified": { "observations": 5000 },
  "links": ["http://localhost:3000/project/7a88.../traces/tree-a1b2-root"],
  "durationMs": 4200
}
```

`verified` is a cheap post-write count readback — not a verification
framework. If readback does not match the plan, exit non-zero and say so.
The deep links let both humans and browser-driving agents jump straight to
the seeded state. Flag names and JSON keys are treated as a public,
additive-only contract.

## Writer Paths

- `--target clickhouse` (default, PR 1): direct inserts plus the Postgres
  rows scenarios need (sessions, score configs). Fast, deterministic, no
  running app required. This is the local one-shot path.
- `--target api` (PR 2): build the same logical data as public ingestion
  batches and POST them to `LANGFUSE_BASE_URL` with `LANGFUSE_PUBLIC_KEY` /
  `LANGFUSE_SECRET_KEY`. Respect batch limits, then poll the public API
  until the data is readable (`--wait`), so agents get a one-shot,
  verified result. Because the target is just env vars, the same command
  emulates realistic ingestion against local web+worker **or staging**.

The writer difference stays visible in the summary (`"target": "..."`).
Direct ClickHouse data is for UI/query debugging; only the API path
validates ingestion behavior.

V4 note: the API writer exercises the real pipeline and is the preferred
way to produce v4 `events_*` data once local dev tables exist. The
`ch:dev-tables` script showed unreproduced reliability issues on 2026-06-08
(`Killed: 9`, tables not created); `doctor` reports v4 table presence as a
warning, and direct v4 row writing stays out of scope until that script is
trusted.

## `pnpm run dx` Integration

Default dx behavior keeps its current shape and cost. Variety comes from a
small **preset** — a list of scenario calls with fixed small params,
defined in one code file (`scenarios/presets.ts`), invoked at the end of
the examples seed:

- one `trace-tree` with all observation kinds, branching, one ~1 MB
  payload, a failed/retried tool call (~150 observations)
- one `long-session` with ~50 traces
- existing bulk/synthetic/framework data unchanged

Selection is via env var, not argument threading through the dx shell
chain (which is brittle) and not an interactive prompt:

```bash
pnpm run dx                            # default preset, ~current cost
LANGFUSE_SEED_PRESET=rich pnpm run dx  # bigger trees/sessions, still laptop-safe
```

Presets are named bundles of the same scenario calls, so an agent that
wants to change what dx seeds edits or reads exactly one file — or skips
presets entirely and runs scenario commands directly after dx.

## AGENTS.md

`packages/shared/scripts/seeder/AGENTS.md` ships in PR 1 and is the
discovery point for agents:

- "Never write ad-hoc seed scripts or raw ClickHouse inserts; use these
  commands."
- Run `pnpm run seed -- doctor` first when anything fails.
- A need→command table for the v1 scenarios, including how to target
  staging with the API writer.
- A short extension checklist for adding a scenario: plain function,
  deterministic IDs from `--seed`/`--id-prefix`, register it in the map,
  add a row to the table. (A "did this bugfix need a seed scenario?"
  process can come later; it is not part of this slice.)

## PR Plan

**PR 1 (this RFC's deliverable):**

- `cli.ts` with `doctor`, `list`, `trace-tree`, `long-session`,
  `many-traces` (ClickHouse target only)
- JSON summary output with readback counts and deep links
- `seed:scenario` / root `seed` scripts
- preset file + dx wiring + `LANGFUSE_SEED_PRESET`
- `AGENTS.md`
- existing seeder behavior otherwise unchanged

**PR 2:**

- `--target api` with batch limits, `--wait` readback, staging support

**Later, only as needed (deliberately deferred):**

- more scenarios pulled from the data-shape checklist below (scores zoo,
  annotation queue items, dataset experiment loop, media edge cases)
- explicit v4 parity scenarios, after `ch:dev-tables` is reliable
- Playwright/perf tests consuming scenario output
- config files/profiles — only if flags + presets prove insufficient

Dropped from the previous draft: typed scenario registry with source
evidence, budget enforcement engine, manifest schema, verification
framework, UI-link templates, interactive dx profile selector,
Standard/Deep/Custom config file family, and the six-phase rollout. The
bug-research backlog from that draft remains valuable input; its essence
is compressed below and the full tables live in git history.

## Appendix: Data Shapes The Parameters Must Be Able To Express

Distilled from bugfix-history research (full evidence in `4b77c8ef7`).
These guide scenario parameter design; they are not 16 separate scenarios:

- all ten observation kinds in one tree; many children (1k+) under one
  parent; deep chains; same-timestamp siblings; missing end times
- sessions with hundreds of traces and mixed row heights
- payloads at 100 KB / 1 MB / 10 MB; deeply nested JSON; stringified JSON
  inside JSON; malformed JSON; long single strings
- Unicode: CJK/Arabic, escaped and double-escaped strings, surrogate
  pairs, non-ASCII names and tags
- scores: numeric/boolean/categorical/text/correction on
  trace/observation/session/dataset-run subjects, config-linked and
  config-less, empty-string corrections, same-timestamp pagination
- v4: `release !== version`, events-only traces, object vs string batch
  I/O, `events_core` truncation vs `events_full` fidelity
- metadata: missing key vs empty string, dotted keys, high cardinality
- media refs in trace and observation fields, with and without storage
- long trace/observation IDs and path-like prompt names

## Open Questions

1. Should `many-traces` reuse the orchestrator bulk path or the SQL
   `numbers()` generator from `load-seed-clickhouse.ts`? (Both exist;
   pick at implementation time, keep the flag contract identical.)
2. Where exactly does the dx preset hook in — end of the `examples`
   branch of `seed-postgres.ts`, or `ch:seed`? (Both projects must exist
   first; decide at implementation.)
3. Should the ClickHouse target ever write v4 event rows directly, or is
   the API writer the only v4 path? Leaning: API-only until dev tables
   are reliable.
