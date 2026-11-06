# Agents

`components/AgentsPage.tsx` owns the observed-agent index. `AgentDetailPage.tsx`
owns the Sessions, Invocations, Traces, Tools, Skills and Info workspace. The
feature gate and server permissions are owned by `agentsAccess.ts` and the router.
The index defaults to the compact table, with server sorting and column controls;
the gallery is available through its view selector. Both use the same list query.

`hooks/useAgentsScope.ts` keeps environment, date range and pagination in the URL.
The default is a closed seven-day window; a selected window is at most 30 days.
Refresh advances an implicit default window; an explicit URL window stays fixed.
Gallery links freeze the effective range and preserve the identity kind. Names
and IDs remain distinct. Dot-only identities use a query route because browsers
normalize dot path segments. `hooks/agentsQuery.ts` owns the pure URL and display
adapters. No client effect mirrors query results into local state.
`hooks/useAgentQueries.ts` owns the typed tRPC query hooks consumed by the UI.

Sessions is the default activity view and embeds the native session explorer.
It lists genuine sessions with participating traces, and opens the existing
session detail and conversation experience. Session metrics include all agents
in the session within the selected window and environment. The session page
opens the recorded conversation across traces. Sessionless traces remain
available in Traces; they are not assigned synthetic session IDs. Session IDs
must be propagated to related observations for complete metrics. A root carrying
an ID outside the selected period does not reassign otherwise sessionless
children in this view.

Invocations are AGENT observations. Ended/open/error-level are recorded states,
not success or quality judgments. `tab=runs` remains an invocation-tab alias.
`AgentActivityTable` embeds the same native events explorer as Tracing and Users, including
its filters, saved views, column settings, sorting, pagination and trace peek.
Its immutable `agentScope` restricts membership to traces containing selected
agent activity in the parent window and environment. Traces uses the native
root default; Invocations and Tools restrict rows to this agent's actual AGENT
and TOOL spans, respectively. Their type facet is fixed by the backend scope.
Editable observation
filters narrow that set; clearing filters and applying a saved view cannot
broaden membership. Rows and their metrics retain native observation semantics.
The parent owns the date picker; the embedded explorer does not display an
independent project-wide date picker. Its persisted filters have an agent
namespace per activity mode, as does its remembered saved-view selection. The
catalog of saved views remains shared. Switching tabs resets active table URL
state while retaining the parent date, environment and agent identity. Query
placeholders include the immutable membership scope and mode.
Exports preserve this scope in a versioned worker-job envelope. Workers that
cannot recognize that envelope reject the job rather than exporting a broader
dataset. Charts and bulk mutations stay unavailable until their query/job paths
support the scope.

Model cost and tokens are attributed model-call metrics within the selected
period, with priced and usage-known coverage displayed alongside them. Missing
measurements stay Unknown. The UI does not infer lifetime totals or attribute
ambiguous model calls to a run.
Calls with an agent identity but no verified owning run remain in agent totals.
Identity-less model calls in participating traces are excluded from agent totals
because they may belong to another agent. Info retains attribution and coverage
details in a disclosure, alongside the agent's period stats.

Info is observed telemetry from the last source run, with a separate model-source
link. It is not managed agent configuration. Skill loads are observed activity,
not a measure of effectiveness. A managed skill link is shown only after the
router verifies the exact project, skill ID and version; unresolved names are
never used to guess a catalog link.

Tables own the remaining viewport and have compact rows. The profile workspace
retains a useful minimum height and its outer page scrolls on short screens.
There are no relationship maps, inferred similarities, quality scores,
historical configuration diffs, generated summaries, or large stacked chart panels.

Existing pageviews measure entry into the preview; there are no new events.
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
