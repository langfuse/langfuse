# Agents prototype

Agents are an observation-level dimension identified by an exact, case-sensitive
name. This internal prototype discovers instrumented agents; it creates no agent
registry. The default overview combines cards, explainable activity changes and
session exploration. Prototype options expose list, activity and relationship
alternatives for comparison.

## Owners and data flow

- `AgentsPage` → `overview/AgentsOverview` / `useAgentsOverview`: one resolved
  project, environment and closed time range; bounded discovery, search, refresh,
  sorting and URL navigation. `AgentsTable` also retains the legacy paged explorer.
- `overview/prepareOverview` / `prepareRelationships`: pure card metrics, cohorts,
  session lanes, heatmap buckets and relationship presentation. Cards, list and
  visualizations share the same returned cohort.
- `appearance`: deterministic defaults, exact project/name keys, validated local
  persistence and the icon/emoji/mascot picker. Identity accents are independent
  of warning/error semantics.
- `prototype-options`: typed URL choices with project-scoped browser defaults.
  No new telemetry records names, identifiers, glyphs or search values.
- `AgentDetailPage`: scope and tab navigation, preserving `tab=runs` as AGENT
  invocations. Sessions is the default. Tabs sit immediately above the data
  workspace, which fills the remaining page height. `AgentProfileWorkspace`
  keeps statistics, charts, comparisons and coverage in an independently scrolling
  Agent details sidebar, closed by default. Narrow screens replace the body with
  details when requested; they never stack details above the table.
- `profile`: pure chart/session preparation, period-scoped session rows, executed
  tools, comparison evidence, coverage and genuine session peek. The peek reuses
  session detail APIs and conversation components; it loads content only on open.
  Tool breakdowns and available tool/skill declarations live in the sidebar.
  Signal and partial-coverage indicators remain beside the tabs; inspection
  closes details and returns to supporting sessions.
- `AgentSkills`: native-load/legacy evidence, authorized exact-name catalog links
  and a separate declaration view. A catalog match does not establish loaded version.
- `agent-map`: existing trace-local ancestry explorer and graph renderer.
- `server/agents-router`: project authorization, validated closed windows and
  environment-only scope. The shared `agents-projection` repository implements
  the replaceable bounded read model.

Fetched data stays in React Query. URL state owns the selected time, tab, filters,
drill-down and prototype variant. Appearance preferences legitimately cross routes;
transient pointer state and details disclosure stay local. Query results are never
copied into UI state. The overview List uses compact rows in a bounded table owner;
its rankings and coverage details expand below the table instead of preceding it.

## Identity and attribution

Resolve each field independently from `langfuse.agent.name/id/version`, then
`gen_ai.agent.name/id/version`. A nonempty name is required, with a maximum of
200 Unicode characters. IDs and versions are optional metadata, not grouping keys.
Reserved normalized keys are `langfuse_agent_name`, `langfuse_agent_id` and
`langfuse_agent_version`. User metadata cannot counterfeit them.

Every owned generation/tool must carry the agent name. Nested agents carry their
own identities. Ingestion does not infer identity from ancestors. Cost and tokens
are exclusive to explicitly attributed observations; missing attribution remains
visible in coverage. Names with punctuation retain exact identity and URL encoding.

## Metric contract

- An **invocation** is an AGENT observation. A **session** requires a genuine
  nonempty session ID. Repeated invocations do not inflate session count.
- A session can contain several agents and traces. System session count is the
  distinct union, not the sum of agent memberships. Sessionless traces remain
  accessible and contribute to appropriate totals, but never to session averages.
- Cards and session-table counts/costs use the selected interval. Session duration
  describes whole loaded session context. Whole-session cost is never charged to
  every participating agent. Session peeks explicitly show whole-session totals.
  Explicit signal drill-downs show the comparison cohort even outside a narrow
  selection and label their whole-session agent contributions separately.
- Tool calls count executed TOOL observations. Model tool-call requests are a
  separate representation, never an additive second count. Zero-tool sessions
  remain in tools/session denominators.
- Native skill resource references take precedence per observation; duplicate
  resource files for one skill do not inflate its load count. Legacy skill-tool
  names/input provide a labelled fallback. Native availability is a declaration,
  separate from observed loads and project catalog membership.
- Recent/baseline cohorts use whole observed sessions' last activity timestamps,
  aggregating each agent's attributed activity. Current cards retain strict period
  accounting. Overlapping attributed intervals are unioned for active duration.

## Comparisons, discovery and coverage

The selected activity window, comparison windows and discovery lookback are three
explicit scopes. Comparisons anchor at the selected end: the most recent hour
versus the preceding 14 days, optionally seven. Discovery looks back 30 days and
may find agents with no activity in the selected interval. First/last known times
refer to that bounded history, never agent creation or lifetime.

Comparisons need at least 20 qualifying historical and five recent sessions.
Open/clipped units are excluded and counted. “Settled observed” means closed
execution spans and at least five minutes of quiet; it is not an application
completion signal. The canonical trace mirror wrapper is context, not an open
execution. Missing/capped history suppresses trustworthy comparisons. Signals
describe unusual tool usage, missing tools, cost, duration or observation counts;
they are suggestions to inspect evidence, not health or outcome-quality scores.

The projection bounds agents, sessions, rows, tool/skill groups, activity points,
graph evidence, query time, memory, bytes read and response size. Coverage states
are part of the UI contract. Rankings describe the returned cohort, not a claimed
global top-N. Unknown buckets differ from measured zeroes. Comparison sparklines
use normalized session-cohort progress, not synchronized clock time.

Calls use directed trace-ancestry or explicitly declared handoff evidence. Shared
observed tools, declared available tools and task/area/topic labels are separate
undirected similarity views. Seeded illustrative labels/handoffs carry provenance.
No similarity or co-occurrence creates a causal call. The existing per-agent map
retains its 100-trace/20,000-row preview limits and unknown ancestry boundaries.

## Reproducible walkthrough

Use the official seed CLI and its printed links:

```sh
NEXTAUTH_URL=http://localhost:3017 pnpm run seed -- agents-rfc --environment production --id-prefix agents-rfc-session-20261015 --managed-skills
NEXTAUTH_URL=http://localhost:3017 LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES=true pnpm --filter web run dev --port 3017
```

The RFC scenario includes real shared/multi-trace sessions, repeated invocations,
sessionless activity, zero tools, both tool representations, native and legacy
skills, managed definitions, Unicode names, stable history, recent deviations,
ongoing/sparse activity, dormant agents and distinct causal/similarity evidence.
Its default selected range is October 15, 2026, 11:00–15:00 UTC. Existing
`agents-view` fixtures and their invocation/skills links remain valid. See the
[seeder catalog](../../../../packages/shared/scripts/seeder/README.md) for options
and the deterministic prefix/reseed contract.

Review cards → changed agent → supporting sessions → session peek → Tools/Skills.
Compare list, timeline/heatmap, calls/similarity and identity treatments. Zoom and
Back preserve scope. Enable identity badges in prototype options to inspect the
session/trace badge experiment; missing sampled identity remains unknown.

## Production aggregation boundary

Preserve the browser-safe `AgentSessionProjection` contract, its units, provenance
and coverage while replacing the read adapter. Native agent columns, deduplicated
materialized aggregates, backend global ranking and scalable historical cohorts
can land independently of cards/tables/charts. Explicit cross-session handoff
instrumentation and terminal-session lifecycle need their own contracts.

Native skill columns from main are consumed directly; older skill evidence keeps
its fallback label. Shared appearance persistence can replace the local adapter
without introducing an agent registry. This prototype adds no schema migration,
queue, external inference pipeline, public API or SDK propagation contract.
