import { useRouter } from "next/router";
import { type AgentIdentity } from "@langfuse/shared/agents";
import Page from "@/src/components/layouts/Page";
import { ErrorPage } from "@/src/components/error-page";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Skeleton } from "@/src/components/ui/skeleton";
import { api } from "@/src/utils/api";
import { useCanViewAgents } from "../agentsAccess";
import { useAgentsScope } from "../hooks/useAgentsScope";
import { agentScopeQuery } from "../hooks/agentsQuery";
import { AgentScopeControls } from "./AgentScopeControls";
import { AgentSummaryStats } from "./AgentSummaryStats";
import { AgentRunsTable } from "./AgentRunsTable";
import { AgentTracesTable } from "./AgentTracesTable";
import { AgentSkillsTable } from "./AgentSkillsTable";
import { AgentInfoPanel } from "./AgentInfoPanel";
import { AgentQueryError } from "./AgentQueryError";

const TABS = ["runs", "traces", "info", "skills"] as const;

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
  const query = api.agents.detail.useQuery(input, { enabled: state.enabled });
  const tab = TABS.find((value) => value === router.query.tab) ?? "runs";
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
      <>
        <div className="text-muted-foreground shrink-0 px-4 pb-2 text-xs">
          <span className="break-all">
            {identity.kind === "id" ? "Stable ID" : "Name identity"}:{" "}
            {identity.value}
          </span>
        </div>
        <AgentSummaryStats stats={query.data.stats} />
        <div className="flex min-h-96 flex-1 flex-col">
          <Tabs
            value={tab}
            onValueChange={(next) => state.update({ tab: next })}
            layout="fill"
          >
            <div className="shrink-0 px-4">
              <Tabs.List variant="underline" aria-label="Agent data">
                <Tabs.Trigger value="runs" label="Runs" />
                <Tabs.Trigger value="traces" label="Traces" />
                <Tabs.Trigger value="info" label="Info" />
                <Tabs.Trigger value="skills" label="Skills" />
              </Tabs.List>
            </div>
            <Tabs.Content value="runs" layout="fill">
              <AgentRunsTable input={input} />
            </Tabs.Content>
            <Tabs.Content value="traces" layout="fill">
              <AgentTracesTable input={input} />
            </Tabs.Content>
            <Tabs.Content value="info" layout="fill">
              <AgentInfoPanel input={input} />
            </Tabs.Content>
            <Tabs.Content value="skills" layout="fill">
              <AgentSkillsTable input={input} />
            </Tabs.Content>
          </Tabs>
        </div>
      </>
    );
  })();
  return (
    <div className="ph-no-capture flex h-full min-h-0 flex-1 flex-col">
      <Page
        headerProps={{
          title: query.data?.displayName ?? identity.value,
          titleBadges: (
            <Badge
              text={identity.kind === "id" ? "Agent ID" : "Name identity"}
              color="filled"
            />
          ),
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
              if (!state.refreshWindow()) utils.agents.invalidate();
            }}
            refreshing={query.isFetching}
          />
          {content}
        </div>
      </Page>
    </div>
  );
}
