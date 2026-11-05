# Agents

`components/AgentsPage.tsx` owns the observed-agent gallery. `AgentDetailPage.tsx`
owns a compact summary and the Runs, Traces, Info and Skills workspace. The
feature gate and server permissions are owned by `agentsAccess.ts` and the router.

`hooks/useAgentsScope.ts` keeps environment, date range and pagination in the URL.
The default is a closed seven-day window; a selected window is at most 30 days.
Refresh advances an implicit default window; an explicit URL window stays fixed.
Gallery links freeze the effective range and preserve the identity kind. Names
and IDs remain distinct. Dot-only identities use a query route because browsers
normalize dot path segments. `hooks/agentsQuery.ts` owns the pure URL and display
adapters. No client effect mirrors query results into local state.

Runs are AGENT observations. Ended/open/error-level are recorded states, not
success or quality judgments. Traces are distinct traces containing the agent.
Model cost and tokens are attributed model-call metrics within the selected
period, with priced and usage-known coverage displayed alongside them. Missing
measurements stay Unknown. The UI does not infer lifetime totals or attribute
ambiguous model calls to a run.

Info is observed telemetry from the last source run, with a separate model-source
link. It is not managed agent configuration. Skill loads are observed activity,
not a measure of effectiveness. A managed skill link is shown only after the
router verifies the exact project, skill ID and version; unresolved names are
never used to guess a catalog link.

Tables own the remaining viewport and have compact rows. The profile workspace
retains a useful minimum height and its outer page scrolls on short screens.
There are no relationship maps, inferred similarities, quality scores, sessions
aggregation, historical configuration diffs, or large stacked chart panels.

Existing pageviews measure entry into the preview; there are no new events.
Only route shape may leave the browser: agent identities, environments and search
values are removed from analytics URL/referrer properties, including persisted
initial/session attribution, and from replay page/network URLs and headers.
Agents tRPC request URLs retain procedure names while their query payload is
removed. Customer-controlled DOM content is blocked with `ph-no-capture`; network
bodies retain the app-shell redaction. The existing deployment gates remain:
HIPAA initializes no PostHog client, and self-hosted deployments do not record.
Missing data and transport errors render inline; the server and
shared query seam own error reporting. The shared seed CLI includes a repeatable
accounting fixture and a scale benchmark; see the seeder README for commands.
