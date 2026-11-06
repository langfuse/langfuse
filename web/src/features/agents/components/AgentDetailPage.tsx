import { useRouter } from "next/router";
import { type AgentIdentity } from "@langfuse/shared/agents";
import Page from "@/src/components/layouts/Page";
import { ErrorPage } from "@/src/components/error-page";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Skeleton } from "@/src/components/ui/skeleton";
import { api } from "@/src/utils/api";
import { useCanViewAgents } from "../agentsAccess";
import { useAgentsScope } from "../hooks/useAgentsScope";
import { useAgentDetail } from "../hooks/useAgentQueries";
import { agentScopeQuery, agentTabQuery } from "../hooks/agentsQuery";
import { AgentScopeControls } from "./AgentScopeControls";
import { AgentSummaryStats } from "./AgentSummaryStats";
import { AgentActivityTable } from "./AgentActivityTable";
import { AgentSessionsTable } from "./AgentSessionsTable";
import { AgentSkillsTable } from "./AgentSkillsTable";
import { AgentInfoPanel } from "./AgentInfoPanel";
import { AgentQueryError } from "./AgentQueryError";

const TABS = [
  "sessions",
  "invocations",
  "traces",
  "tools",
  "skills",
  "info",
] as const;

export function AgentDetailPage({
  projectId,
  identity,
}: {
  projectId: string;
  identity: AgentIdentity;
}) {
  const canView = useCanViewAgents(projectId);
  return canView ? (
    <AgentDetail projectId={projectId} identity={identity} />
  ) : (
    <ErrorPage title="Page not found" message="This page is not available." />
  );
}

function AgentDetail({
  projectId,
  identity,
}: {
  projectId: string;
  identity: AgentIdentity;
}) {
  const state = useAgentsScope(projectId);
  const router = useRouter();
  const utils = api.useUtils();
  const input = { ...state.scope, identity };
  const query = useAgentDetail(input, state.enabled);
  const tab =
    router.query.tab === "runs"
      ? "invocations"
      : (TABS.find((value) => value === router.query.tab) ?? "sessions");
  const content = (() => {
    if (state.error)
      return (
        <p className="text-muted-foreground p-4 text-sm">
          Choose a supported time range to inspect this agent.
        </p>
      );
    if (query.isError)
      return (
        <AgentQueryError
          retry={() => {
            query.refetch();
          }}
        />
      );
    if (query.isPending)
      return (
        <div className="p-4">
          <Skeleton className="h-20 w-full" />
        </div>
      );
    if (!query.data)
      return (
        <p className="text-muted-foreground p-4 text-sm">
          This agent was not observed in the selected time range and
          environment.
        </p>
      );
    return (
      <div className="flex min-h-96 flex-1 flex-col">
        <Tabs
          value={tab}
          onValueChange={(next) =>
            router.replace(
              {
                pathname: router.pathname,
                query: agentTabQuery(router.query, next),
              },
              undefined,
              { shallow: true },
            )
          }
          layout="fill"
        >
          <div className="shrink-0 px-4">
            <Tabs.List variant="underline" aria-label="Agent data">
              <Tabs.Trigger value="sessions" label="Sessions" />
              <Tabs.Trigger value="invocations" label="Invocations" />
              <Tabs.Trigger value="traces" label="Traces" />
              <Tabs.Trigger value="tools" label="Tools" />
              <Tabs.Trigger value="skills" label="Skills" />
              <Tabs.Trigger value="info" label="Info" />
            </Tabs.List>
          </div>
          <Tabs.Content value="sessions" layout="fill">
            <AgentSessionsTable input={input} />
          </Tabs.Content>
          <Tabs.Content value="invocations" layout="fill">
            <AgentActivityTable input={input} mode="invocations" />
          </Tabs.Content>
          <Tabs.Content value="traces" layout="fill">
            <AgentActivityTable input={input} mode="traces" />
          </Tabs.Content>
          <Tabs.Content value="tools" layout="fill">
            <AgentActivityTable input={input} mode="tools" />
          </Tabs.Content>
          <Tabs.Content value="info" layout="fill">
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-4">
              <AgentSummaryStats stats={query.data.stats} />
              <AgentInfoPanel input={input} />
            </div>
          </Tabs.Content>
          <Tabs.Content value="skills" layout="fill">
            <AgentSkillsTable input={input} />
          </Tabs.Content>
        </Tabs>
      </div>
    );
  })();
  return (
    <div className="ph-no-capture flex h-full min-h-0 flex-1 flex-col">
      <Page
        headerProps={{
          title: query.data?.displayName ?? identity.value,
          divider: false,
          breadcrumb: [
            {
              name: "Agents",
              href: `/project/${encodeURIComponent(projectId)}/agents?${agentScopeQuery(state.scope)}`,
            },
          ],
        }}
      >
        <div className="ph-no-capture flex min-h-0 flex-1 flex-col overflow-y-auto">
          <AgentScopeControls
            {...state}
            refresh={() => {
              if (!state.refreshWindow())
                Promise.all([
                  utils.agents.invalidate(),
                  utils.events.invalidate(),
                  utils.sessions.invalidate(),
                ]);
            }}
            refreshing={query.isFetching}
          />
          {content}
        </div>
      </Page>
    </div>
  );
}
