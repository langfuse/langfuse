import { useRouter } from "next/router";
import { Bot } from "@langfuse/icons";
import { type AgentSort } from "@langfuse/shared/agents";
import Page from "@/src/components/layouts/Page";
import { ErrorPage } from "@/src/components/error-page";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Button } from "@/src/components/design-system/Button/Button";
import { AgentPagination } from "./AgentPagination";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useCanViewAgents } from "../agentsAccess";
import { useAgentsScope } from "../hooks/useAgentsScope";
import { agentPage } from "../hooks/agentsQuery";
import { AgentScopeControls } from "./AgentScopeControls";
import { AgentGalleryCard } from "./AgentGalleryCard";
import { AgentQueryError } from "./AgentQueryError";
import { AgentSearchInput } from "./AgentSearchInput";
import { useAgentList } from "../hooks/useAgentQueries";
import { AgentsTable } from "./AgentsTable";

const SORTS: { value: AgentSort; label: string }[] = [
  { value: "lastSeen", label: "Last seen" },
  { value: "runs", label: "Most invocations" },
  { value: "cost", label: "Highest model cost" },
  { value: "name", label: "Name" },
];

export function AgentsPage({ projectId }: { projectId: string }) {
  const canView = useCanViewAgents(projectId);
  return canView ? (
    <AgentsList projectId={projectId} />
  ) : (
    <ErrorPage title="Page not found" message="This page is not available." />
  );
}

function AgentsList({ projectId }: { projectId: string }) {
  const state = useAgentsScope(projectId);
  const router = useRouter();
  const search =
    typeof router.query.search === "string" ? router.query.search : "";
  const sort =
    SORTS.find((s) => s.value === router.query.sort)?.value ?? "lastSeen";
  const defaultDirection = sort === "name" ? "asc" : "desc";
  const direction =
    router.query.direction === "asc" || router.query.direction === "desc"
      ? router.query.direction
      : defaultDirection;
  const view = router.query.view === "gallery" ? "gallery" : "table";
  const page = agentPage(router.query.page);
  const pageSize = 24;
  const query = useAgentList(
    {
      ...state.scope,
      page,
      pageSize,
      search,
      sort,
      direction,
    },
    state.enabled,
  );
  const content = (() => {
    if (state.error)
      return (
        <p className="text-muted-foreground text-sm">
          Choose a supported time range to load agents.
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
    if (view === "table" && (query.isPending || query.data.items.length > 0))
      return (
        <AgentsTable
          scope={state.scope}
          data={
            query.isPending
              ? { status: "loading" }
              : { status: "success", data: query.data.items }
          }
          orderBy={{
            column: sort,
            order: direction === "asc" ? "ASC" : "DESC",
          }}
          setOrderBy={(next) =>
            state.update({
              sort: SORTS.some((option) => option.value === next?.column)
                ? next?.column
                : undefined,
              direction: next?.order.toLowerCase(),
              page: undefined,
            })
          }
        />
      );
    if (query.isPending)
      return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-60 rounded-lg" />
          ))}
        </div>
      );
    if (query.data.items.length > 0)
      return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {query.data.items.map((agent) => (
            <AgentGalleryCard
              key={`${agent.identity.kind}:${agent.identity.value}`}
              agent={agent}
              scope={state.scope}
            />
          ))}
        </div>
      );
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
        <Bot size="xl" color="muted" />
        <h2 className="text-base font-bold">No agents in this window</h2>
        <p className="text-muted-foreground max-w-lg text-sm">
          Try another time range or environment. To identify an agent, record an
          AGENT observation with gen_ai.agent.id and gen_ai.agent.name span
          attributes (or langfuse.agent.id and langfuse.agent.name).
        </p>
        {(search || state.scope.environment !== null) && (
          <Button
            text="Clear search and environment"
            variant="secondary"
            onClick={() =>
              state.update({
                search: undefined,
                environment: undefined,
                page: undefined,
              })
            }
          />
        )}
      </div>
    );
  })();
  return (
    <Page
      headerProps={{
        title: "Agents",
        titleBadges: <Badge text="Preview" color="orangeTint" />,
        help: {
          description:
            "Agents observed in your telemetry. Inspect their activity, conversations, model usage, and skills in one project.",
          href: "https://langfuse.com/docs/observability/features/agents",
        },
      }}
    >
      <div className="ph-no-capture flex min-h-0 flex-1 flex-col">
        <AgentScopeControls
          {...state}
          refresh={() => {
            if (!state.refreshWindow()) query.refetch();
          }}
          refreshing={query.isFetching}
        />
        <div className="flex shrink-0 flex-wrap items-center gap-3 px-4 pb-3">
          <div className="min-w-48 flex-1">
            <AgentSearchInput
              key={`${projectId}:${state.scope.from.getTime()}:${state.scope.to.getTime()}:${state.scope.environment}`}
              value={search}
              onSearch={(value) =>
                state.update({
                  search: value || undefined,
                  page: undefined,
                })
              }
            />
          </div>
          {view === "gallery" && (
            <div className="w-52">
              <SelectInput
                aria-label="Sort agents"
                value={sort}
                onValueChange={(value) =>
                  state.update({
                    sort: value,
                    direction: undefined,
                    page: undefined,
                  })
                }
                options={SORTS}
                placeholder="Sort agents"
              />
            </div>
          )}
          <div className="w-36">
            <SelectInput
              aria-label="Agent view"
              value={view}
              onValueChange={(value) => state.update({ view: value })}
              options={[
                { value: "table", label: "Table" },
                { value: "gallery", label: "Gallery" },
              ]}
              placeholder="View"
            />
          </div>
        </div>
        <div
          className={
            view === "gallery"
              ? "min-h-0 flex-1 overflow-y-auto p-4 pt-1"
              : "flex min-h-0 flex-1 flex-col"
          }
        >
          {content}
        </div>
        <AgentPagination
          totalCount={query.data?.totalCount ?? null}
          state={{ pageIndex: page, pageSize }}
          onChange={(next) => state.update({ page: next.pageIndex + 1 })}
        />
      </div>
    </Page>
  );
}
