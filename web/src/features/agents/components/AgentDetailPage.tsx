import { useRouter } from "next/router";
import { type AgentIdentity } from "@langfuse/shared/agents";
import Page from "@/src/components/layouts/Page";
import { ErrorPage } from "@/src/components/error-page";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Button } from "@/src/components/design-system/Button/Button";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { TableHeaderControls } from "@/src/components/table/TableHeaderControls";
import { PageHeaderControlsPortal } from "@/src/components/layouts/page-header-controls-slot";
import { RefreshCw } from "@langfuse/icons";
import { Skeleton } from "@/src/components/ui/skeleton";
import { api } from "@/src/utils/api";
import { useCanViewAgents } from "../agentsAccess";
import { useAgentsScope } from "../hooks/useAgentsScope";
import { useAgentDetail } from "../hooks/useAgentQueries";
import { agentScopeQuery, agentTabQuery } from "../hooks/agentsQuery";
import { AgentEnvironmentLayout } from "./AgentEnvironmentLayout";
import { AgentSummaryStats } from "./AgentSummaryStats";
import { AgentActivityTable } from "./AgentActivityTable";
import { AgentSessionsTable } from "./AgentSessionsTable";
import { AgentSkillsTable } from "./AgentSkillsTable";
import { AgentInfoPanel } from "./AgentInfoPanel";
import { AgentQueryError } from "./AgentQueryError";
import { AgentOverview } from "./AgentOverview";

const TABS = [
  "overview",
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
      : (TABS.find((value) => value === router.query.tab) ?? "overview");
  const content = (() => {
    if (state.error)
      return (
        <div className="flex flex-col items-start gap-3 p-4">
          <Alert variant="warning">
            <Alert.Description>{state.error}</Alert.Description>
          </Alert>
          {state.hasInvalidFilters && (
            <Button
              text="Clear filters"
              variant="secondary"
              onClick={state.clearFilters}
            />
          )}
        </div>
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
              <Tabs.Trigger value="overview" label="Overview" />
              <Tabs.Trigger value="sessions" label="Sessions" />
              <Tabs.Trigger
                value="invocations"
                label="Agent runs"
                tooltip="Rows are recorded agent-run observations. Row cost is the observation’s recorded cost. Overview shows average owned model cost per completed run."
              />
              <Tabs.Trigger value="traces" label="Traces" />
              <Tabs.Trigger value="tools" label="Tools" />
              <Tabs.Trigger value="skills" label="Skills" />
              <Tabs.Trigger value="info" label="Info" />
            </Tabs.List>
          </div>
          <Tabs.Content value="overview" layout="fill">
            <AgentEnvironmentLayout input={input}>
              <AgentOverview input={input} />
            </AgentEnvironmentLayout>
          </Tabs.Content>
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
            <AgentEnvironmentLayout input={input}>
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-4">
                {query.isPending && <Skeleton className="mx-4 h-20" />}
                {query.isError && (
                  <AgentQueryError
                    retry={() => {
                      query.refetch();
                    }}
                  />
                )}
                {query.data && <AgentSummaryStats stats={query.data.stats} />}
                <AgentInfoPanel input={input} />
              </div>
            </AgentEnvironmentLayout>
          </Tabs.Content>
          <Tabs.Content value="skills" layout="fill">
            <AgentEnvironmentLayout input={input}>
              <AgentSkillsTable input={input} />
            </AgentEnvironmentLayout>
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
          <TableHeaderControls
            timeRange={state.timeRange}
            setTimeRange={state.setTimeRange}
          />
          <PageHeaderControlsPortal>
            <IconButton
              icon={RefreshCw}
              label="Refresh"
              variant="outline"
              disabled={query.isFetching}
              onClick={() => {
                if (!state.refreshWindow())
                  Promise.all([
                    utils.agents.invalidate(),
                    utils.events.invalidate(),
                    utils.sessions.invalidate(),
                  ]);
              }}
            />
          </PageHeaderControlsPortal>
          {content}
        </div>
      </Page>
    </div>
  );
}
