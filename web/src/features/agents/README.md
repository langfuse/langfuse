# Agents prototype

Agents are an observation-level dimension, identified by a stable, case-sensitive
name. The internal Agents page lists observed agents; it does not create a registry.
All aggregates require a bounded project time window. List metrics are fetched for
the visible page, so the list is ordered by trace count with a name tie-breaker.
Cost sorting is deliberately unavailable until the backend can rank the full result.

## Owners and data flow

- `AgentsPage` / `AgentsTable`: shared project date range, environment filters,
  name search, offset pagination, and the two-query list/metrics pattern.
- `AgentDetailPage`: resolves one closed window for stats, Pulse, runs,
  observations, skills and the map. Pulse selection changes the URL window without
  changing the saved project default; browser Back restores it. Explicit date-picker
  choices persist. Environment filters survive list/profile/map navigation.
- `AgentStats` and `AgentSkills`: independent queries with loading, empty and retry
  states; no query results mirrored into local state.
- `agent-map/buildAgentMapData`: pure trace-scoped ancestry and call counts. The
  map reuses the trace graph renderer and offers a connection table when the graph
  becomes too large. Missing ancestors, cycles and unnamed callers stay explicit.
- `server/agents-router`: project authorization and bounded, validated inputs.
- Shared `src/server/repositories/agents.ts`: compact-event query builders, project
  and window bounds, metadata-name prefilter, usage/cost aggregation and sample caps.
- Shared `OtelIngestionProcessor`: resolves identity independently for each span in
  both direct and legacy write paths. It does not infer or inherit agent identity.

## Instrumentation contract

The first nonempty string wins independently for each field:

| Field | Preferred attribute | Standard fallback |
| --- | --- | --- |
| Name | `langfuse.agent.name` | `gen_ai.agent.name` |
| ID | `langfuse.agent.id` | `gen_ai.agent.id` |
| Version | `langfuse.agent.version` | `gen_ai.agent.version` |

Names support at most 200 Unicode characters because `events_core` truncates
metadata values at that boundary. Longer names are omitted instead of being merged
under a truncated identity. IDs and versions are optional; a valid name is required.
The ingestion resolver writes reserved observation metadata keys
`langfuse_agent_name`, `langfuse_agent_id` and `langfuse_agent_version` after user
metadata. Reserved keys supplied in user/trace metadata are removed so they cannot
counterfeit identity or leak an ancestor's name to an unnamed observation.

Set the name on every generation, tool and span owned by an agent. A nested agent
sets its own name on its subtree. Existing `AGENT` type mapping is unchanged; an
unnamed AGENT span is not listed. A named generation contributes usage and cost
even without a named AGENT span. No SDK propagation API is added by this change.

Current JS SDK manual instrumentation, with a configured Langfuse span processor:

```ts
import { startObservation } from "@langfuse/tracing";

const agent = startObservation("research", {}, { asType: "agent" });
agent.otelSpan.setAttribute("langfuse.agent.name", "research");
const generation = agent.startObservation("answer", {}, { asType: "generation" });
generation.otelSpan.setAttribute("langfuse.agent.name", "research");
// Record the generation's usage and output before ending it.
generation.end();
agent.end();
```

Cost is exclusive: it sums observations carrying this exact name and does not
roll up sub-agents. Frameworks that name only the invocation span have incomplete
attributed usage/cost. Rewritten event rows can temporarily inflate sums until
background merges, matching the existing Users queries. No `FINAL` or mutation is
introduced to hide that storage limitation. Statistics, first/last seen and average
cost per trace refer to the selected window, never to lifetime totals.

The tracing search bar already accepts `metadata.langfuse_agent_name = research`.
Names with spaces or punctuation should be quoted in the search grammar.

## Bounded previews

Skills match known skill-tool tokens case-insensitively, including `Skill` and
`skills`, and extract an attribute/input name with a tool-name fallback. They show
up to 50 skills, with an explicit limit notice. This is not registry membership or
version tracking. Tool input is truncated in compact events, so matching is best
effort and carries a visible preview label.

The map loads the 100 most recently active traces containing the agent within the
window, then at most 20,000 skeleton rows from that same window and environment.
It fetches no input/output. Cap detection reads one extra row and is surfaced in
the UI. Window boundaries can exclude ancestors; those calls have an unknown
caller, not an invented root. The nearest AGENT ancestor is the caller, including
unnamed boundaries. Counts are distinct sampled spans and traces, not a complete
project-wide graph. Cross-trace calls require a future explicit caller attribute.
Same-name self-calls keep their counts in Connections and appear as ↻ counts on
diagram nodes; calls between unnamed agents remain grouped without claiming identity.

## Reproducible review

```sh
NEXTAUTH_URL=http://localhost:3017 pnpm run seed -- agents-view --environment production --v4
NEXTAUTH_URL=http://localhost:3017 LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES=true pnpm --filter web run dev --port 3017
```

Use the CLI's printed links and sign in with the seeded demo account. The default
fixture spans 08:00–12:00 UTC on the current UTC day; set the date picker to that
window. It includes 8 agents, nested citation runs, named generation costs, skills,
production/staging data, a name-only agent with incomplete cost, and a name with URL
punctuation. Changing timing parameters needs a fresh `--id-prefix`.

Review Agents → research → Runs → trace peek; select a Pulse bar and verify stats
and rows narrow together. Open compose → Skills for citation-style; open verify →
Agent map for verify-citation edges. Switch to Observations to inspect attributed
generations. Check the name-only profile and the URL-special name. The prototype
is gated by the existing internal feature control, including direct page entry.

## Path to production aggregation

Keep the UI-facing `AgentMetrics`, `AgentSkillsResult` and `AgentMapSkeletonResult`
contracts stable while replacing their repository implementation:

1. Add `agent_name`, `agent_id`, `agent_version` to both event tables and update
   the TO-table materialized view without dropping it. Coordinate this with the
   native skill column shape. Reuse the existing per-span resolver; switch
   `AGENT_NAME_EXPR` / `HAS_AGENT_EXPR` to the native columns. Dual-write the
   reserved metadata key for one compatibility release so saved filters still work.
   Backfill historical normalized metadata only if its query cost is acceptable.
2. Add the native Agent dimension to filter, chart and public metrics registries.
   An actual observation-table column then uses the same field. The current
   metadata filter remains a supported compatibility path during transition.
3. Replace visible-page metrics with a backend-ranked aggregate result before
   enabling cost/token sorting. Return explicit total/approximation information
   and define deduplication guarantees; avoid silently sorting only one page.
4. Replace tool-name skills matching with native loaded/available skills while
   preserving the window and provenance in the response. Registry versions and
   custom tool-argument mappings are separate capabilities.
5. Replace sampled skeletons with backend call aggregation, retaining coverage and
   truncation fields. Introduce caller identity for cross-trace handoffs. Inclusive
   subtree cost, step graphs and baseline outliers need their own accounting/data
   contracts; they must not change the meaning of current exclusive totals.

No migration, new queue, external service, SDK change, ancestor resolution at
ingestion, or public API contract is required for this prototype.
