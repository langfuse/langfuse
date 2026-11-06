# Agents

`components/AgentsPage.tsx` owns the observed-agent index. `AgentDetailPage.tsx`
owns the Overview, Sessions, Agent runs, Traces, Tools, Skills and Info workspace. The
feature gate and server permissions are owned by `agentsAccess.ts` and the router.
The index defaults to the gallery; the compact table, with server sorting and column
controls, is available through the inset Table/Gallery switch. Both use the same
list query, native search composer, and filter sidebar.

`hooks/useAgentsScope.ts` derives environment conditions from the native URL filter
state and uses the shared project date selection. Its closed query window is at
most 30 days. Refresh advances relative windows; absolute selections stay fixed.
The date picker and refresh control occupy the standard page-header slot.
Legacy environment query parameters redirect to a visible native filter once;
clearing that filter cannot restore a hidden restriction.
Gallery links freeze the effective range and preserve the identity kind. Names
and IDs remain distinct. Dot-only identities use a query route because browsers
normalize dot path segments. `hooks/agentsQuery.ts` owns the pure URL and display
adapters. No client effect mirrors query results into local state.
`hooks/useAgentQueries.ts` owns the typed tRPC query hooks consumed by the UI.

Overview is the default profile view. It compares the selected period with the
preceding period of equal length. The gallery retains identities from either
period so zero current activity remains visible. A green recent-activity marker
means observed telemetry within the last hour of wall-clock time; it does not
claim availability or health. It respects reduced-motion preferences.

Sessions embeds the native session explorer.
It lists genuine sessions with participating traces, and opens the existing
session detail and conversation experience. Session metrics include all agents
in the session within the selected window and environment. The session page
opens the recorded conversation across traces. Sessionless traces remain
available in Traces; they are not assigned synthetic session IDs. Session IDs
must be propagated to related observations for complete metrics. A root carrying
an ID outside the selected period does not reassign otherwise sessionless
children in this view.

Agent runs are AGENT observations. Ended/open/error-level are recorded states,
not success or quality judgments. `tab=runs` is the canonical route and activity
API mode; saved links to the former tab redirect without changing table filters.
`AgentActivityTable` embeds the same native events explorer as Tracing and Users, including
its filters, saved views, column settings, sorting, pagination and trace peek.
Its immutable `agentScope` restricts membership to traces containing selected
agent activity in the parent window and environment. Traces uses the native
root default; Agent runs and Tools restrict rows to this agent's actual AGENT
and TOOL spans, respectively. Their type facet is fixed by the backend scope.
Editable observation
filters narrow that set; clearing filters and applying a saved view cannot
broaden membership. Rows and their metrics retain native observation semantics.
The parent owns the date picker; the embedded explorer does not display an
independent project-wide date picker. Its filters are URL-owned, without hidden
environment defaults or session-storage fallback. Remembered saved-view selections
have an agent namespace per activity mode. The
catalog of saved views remains shared. Switching tabs resets active table URL
state while retaining the date, native environment predicates and agent identity. Query
placeholders include the immutable membership scope and mode.
Exports preserve this scope in a versioned worker-job envelope. Workers that
cannot recognize that envelope reject the job rather than exporting a broader
dataset. Native environment predicates require the v2 envelope, so workers that
only recognize the legacy single-environment scope fail closed. Generic dashboard
charts and bulk mutations remain disabled inside the scoped native table. The
agent-specific activity pulse shares its exact filtered row cohort. Session
pulses count distinct active sessions in each bucket; these counts are not additive.

Model cost and tokens are attributed model-call metrics within the selected
period, with priced and usage-known coverage displayed alongside them. Missing
measurements stay Unknown. The UI does not infer lifetime totals or attribute
ambiguous model calls to a run.
Calls with an agent identity but no verified owning run remain in agent totals.
Identity-less model calls in participating traces are excluded from agent totals
because they may belong to another agent. Info retains attribution and coverage
details in a disclosure, alongside the agent's period stats. Average own run cost
uses completed period-started runs with observed model calls and complete pricing
for those calls, separate from period spend. Child-agent costs stay separate.

Cache hit rate is cached input tokens divided by inclusive input tokens for
model calls with consistent, explicitly reported cache usage. It is token-weighted,
not a mean of per-call percentages. Missing or contradictory reporting remains
Unknown; an explicit zero is a cache miss. Overview shows reporting coverage and
compares the same metric across equal periods.

Quality uses numeric or boolean scores directly attached to recorded AGENT spans.
Repeated evaluations average per run before averaging across runs. Trace/session
scores cannot establish individual-agent quality. Model comparisons use observed
owned model names and do not assert causality. Observed relationships follow
explicit parent chains through ordinary spans, within a bounded recent-trace
sample; missing ancestry, cycles and truncation remain visible in coverage.

Info is observed telemetry from the last source run, with a separate model-source
link. It is not managed agent configuration. Skill loads are observed activity,
not a measure of effectiveness. A managed skill link is shown only after the
router verifies the exact project, skill ID and version; unresolved names are
never used to guess a catalog link.

Tables own the remaining viewport and have compact rows. The profile workspace
retains a useful minimum height and its outer page scrolls on short screens.
Overview charts scroll separately from full-height native table tabs. Manual
groups, inferred similarities, historical configuration diffs and generated
summaries are outside this preview.

Existing pageviews measure entry into the preview. Pulse drilling reuses
`pulse:drill_in`; selecting a quality metric records `agents:quality_score_selected`
with metric type/source/config-presence only, never names or values.
Only route shape may leave the browser: agent identities, environments and search
values are removed from analytics URL/referrer properties, including persisted
initial/session attribution, and from replay page/network URLs and headers.
Agents tRPC request URLs and shared-table requests carrying `agentScope` retain
procedure names while their query payload is removed. Customer-controlled DOM
content is blocked with `ph-no-capture`; network
bodies retain the app-shell redaction. The existing deployment gates remain:
HIPAA initializes no PostHog client, and self-hosted deployments do not record.
Missing data and transport errors render inline; the server and
shared query seam own error reporting. The shared seed CLI includes a repeatable
accounting fixture and a scale benchmark; see the seeder README for commands.
