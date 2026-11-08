import { type ReactNode } from "react";
import { StringParam, useQueryParam } from "use-query-params";
import { type AgentDetailInput } from "@langfuse/shared/agents";
import {
  DataTableControls,
  DataTableControlsProvider,
} from "@/src/components/table/data-table-controls";
import { FilterToggleButton } from "@/src/components/table/FilterToggleButton";
import { StickySearchableTableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { useSidebarFilterState } from "@/src/features/filters/hooks/useSidebarFilterState";
import { TableSearchBar } from "@/src/features/search-bar/components/TableSearchBar";
import { toObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import {
  agentEnvironmentFilterConfig,
  AGENT_ENVIRONMENT_FIELD_REGISTRY,
} from "../config/agentFilters";
import { useAgentEnvironments } from "../hooks/useAgentQueries";

const ENVIRONMENT_OPTION_ERROR = new Set(["environment"]);

export function AgentEnvironmentLayout({
  input,
  children,
}: {
  input: AgentDetailInput;
  children: ReactNode;
}) {
  const [, setSkillPage] = useQueryParam("skillPage", StringParam);
  const environments = useAgentEnvironments(
    { projectId: input.projectId, from: input.from, to: input.to },
    true,
  );
  const options = { environment: environments.data };
  const queryFilter = useSidebarFilterState(
    agentEnvironmentFilterConfig,
    options,
    {
      stateLocation: "url",
      loading: environments.isPending,
      isV4: true,
      onExplicitFilterStateChange: () => setSkillPage(undefined),
    },
  );

  return (
    <DataTableControlsProvider
      tableName={agentEnvironmentFilterConfig.tableName}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <StickySearchableTableFilterLayout
          search={
            <TableSearchBar
              key={queryFilter.draftResetKey}
              projectId={input.projectId}
              tableName={agentEnvironmentFilterConfig.tableName}
              registry={AGENT_ENVIRONMENT_FIELD_REGISTRY}
              filterState={queryFilter.searchBarFilterState}
              setFilterState={(filters) =>
                queryFilter.setFilterState(filters, { origin: "user" })
              }
              observed={toObservedOptions(options, environments.isPending)}
              erroredColumns={
                environments.isError ? ENVIRONMENT_OPTION_ERROR : undefined
              }
              isV4
            />
          }
          toolbar={
            <div className="px-2 pb-1 md:hidden">
              <FilterToggleButton
                filterState={queryFilter.explicitFilterState}
              />
            </div>
          }
        >
          <DataTableControls queryFilter={queryFilter} />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>
        </StickySearchableTableFilterLayout>
      </div>
    </DataTableControlsProvider>
  );
}
