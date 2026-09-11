import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { SingleLineOverflowList } from "@/src/components/SingleLineOverflowList";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { DataTable } from "@/src/components/table/data-table";
import {
  DataTableControls,
  DataTableControlsProvider,
} from "@/src/components/table/data-table-controls";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { useSidebarFilterState } from "@/src/features/filters";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import { gatewayModelsFilterConfig } from "@/src/features/ai-gateway/constants/modelsFilterConfig";
import { GATEWAY_MODELS_FIELD_REGISTRY } from "@/src/features/ai-gateway/constants/modelsSearchRegistry";
import {
  TableSearchBar,
  toObservedOptions,
  withFieldOptions,
} from "@/src/features/search-bar";
import {
  filterGatewayModels,
  type GatewayModelRow,
} from "./filterGatewayModels";
import { getGatewayModelConnectionSearchOptions } from "./fns/getGatewayModelConnectionSearchOptions";

const TABLE_NAME = gatewayModelsFilterConfig.tableName;

const columns: LangfuseColumnDef<GatewayModelRow, unknown>[] = [
  {
    accessorKey: "id",
    id: "id",
    header: "Model",
    size: 200,
    cell: ({ row }) => (
      <span className="block truncate font-mono" title={row.original.id}>
        {row.original.id}
      </span>
    ),
  },
  {
    accessorKey: "availableVia",
    id: "availableVia",
    header: "Available via",
    size: 360,
    cell: ({ row }) => (
      <SingleLineOverflowList
        items={row.original.availableVia}
        additionalOverflowCount={0}
        getKey={(connection) => connection.connectionId}
        renderItem={(connection) => (
          <Badge variant="secondary">
            {connection.connectionName} · {providerLabels[connection.provider]}
          </Badge>
        )}
        renderOverflow={({ hiddenItems, overflowItemCount }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex" tabIndex={0}>
                <Badge variant="secondary">+{overflowItemCount}</Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              {hiddenItems
                .map(
                  (connection) =>
                    `${connection.connectionName} · ${providerLabels[connection.provider]}`,
                )
                .join(", ")}
            </TooltipContent>
          </Tooltip>
        )}
      />
    ),
  },
  {
    accessorKey: "apiFormats",
    id: "apiFormats",
    header: "API formats",
    size: 280,
    cell: ({ row }) => (
      <SingleLineOverflowList
        items={row.original.apiFormats}
        additionalOverflowCount={0}
        getKey={(format) => format}
        renderItem={(format) => <Badge variant="secondary">{format}</Badge>}
        renderOverflow={({ hiddenItems, overflowItemCount }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex" tabIndex={0}>
                <Badge variant="secondary">+{overflowItemCount}</Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              {hiddenItems.join(", ")}
            </TooltipContent>
          </Tooltip>
        )}
      />
    ),
  },
];

export function GatewayModelsView({
  models,
  failedProviderCount,
  providerCount,
  hasProviders,
  hasSynced,
  isLoading,
  syncError,
  onSync,
  hasMoreProviders,
  isLoadingMoreProviders,
  onLoadMoreProviders,
}: {
  models: GatewayModelRow[];
  failedProviderCount: number;
  providerCount: number;
  hasProviders: boolean;
  hasSynced: boolean;
  isLoading: boolean;
  syncError: boolean;
  onSync: () => void | Promise<void>;
  hasMoreProviders: boolean;
  isLoadingMoreProviders: boolean;
  onLoadMoreProviders: () => unknown;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const filterOptions = useMemo(
    () => ({
      connection: [
        ...new Map(
          models
            .flatMap((model) => model.availableVia)
            .map((connection) => [connection.connectionId, connection]),
        ).values(),
      ]
        .toSorted((left, right) =>
          left.connectionName.localeCompare(right.connectionName),
        )
        .map((connection) => ({
          value: connection.connectionId,
          displayValue: connection.connectionName,
        })),
      provider: uniqueSorted(
        models.flatMap((model) =>
          model.availableVia.map((connection) => connection.provider),
        ),
      ),
      apiFormat: uniqueSorted(models.flatMap((model) => model.apiFormats)),
    }),
    [models],
  );
  const queryFilter = useSidebarFilterState(
    gatewayModelsFilterConfig,
    filterOptions,
    {
      stateLocation: "url",
    },
  );
  const retainedConnectionIds = useMemo(
    () =>
      queryFilter.filterState.flatMap((filter) =>
        filter.column === "connection" && filter.type === "arrayOptions"
          ? filter.value
          : [],
      ),
    [queryFilter.filterState],
  );
  const connectionSearchOptions = useMemo(
    () =>
      getGatewayModelConnectionSearchOptions(
        filterOptions.connection,
        retainedConnectionIds,
      ),
    [filterOptions.connection, retainedConnectionIds],
  );
  const searchRegistry = useMemo(
    () =>
      withFieldOptions(
        GATEWAY_MODELS_FIELD_REGISTRY,
        "connection",
        connectionSearchOptions.registryOptions,
      ),
    [connectionSearchOptions.registryOptions],
  );
  const observedOptions = useMemo(
    () =>
      toObservedOptions(
        {
          ...filterOptions,
          connection: connectionSearchOptions.observedValues,
        },
        isLoading,
      ),
    [connectionSearchOptions.observedValues, filterOptions, isLoading],
  );
  const filteredModels = useMemo(
    () => filterGatewayModels(models, searchQuery, queryFilter.filterState),
    [models, queryFilter.filterState, searchQuery],
  );
  const emptyMessage = getEmptyMessage({
    hasProviders,
    hasSynced,
    hasActiveFilters:
      searchQuery.trim().length > 0 || queryFilter.filterState.length > 0,
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <Header
        title="Gateway models"
        actionButtons={
          <Button variant="secondary" loading={isLoading} onClick={onSync}>
            <RefreshCw className="mr-1.5 size-4" />
            {hasSynced ? "Retry sync" : "Sync models"}
          </Button>
        }
      />
      <p className="text-muted-foreground text-sm">
        Models are discovered from enabled provider credentials and cached for
        up to five minutes.
      </p>

      {failedProviderCount > 0 ? (
        <Alert variant="warning">
          <Alert.Title>Some providers could not be reached</Alert.Title>
          <Alert.Description>
            Showing models from successful providers. {failedProviderCount} of{" "}
            {providerCount} credentials failed to sync.
          </Alert.Description>
        </Alert>
      ) : null}

      {syncError ? (
        <Alert variant="destructive">
          <Alert.Title>Model sync failed</Alert.Title>
          <Alert.Description>
            No provider results were returned. Retry the sync.
          </Alert.Description>
        </Alert>
      ) : null}

      <DataTableControlsProvider tableName={TABLE_NAME}>
        <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-md border">
          <TableSearchBar
            key={queryFilter.draftResetKey}
            tableName={TABLE_NAME}
            registry={searchRegistry}
            filterState={queryFilter.searchBarFilterState}
            setFilterState={(filters) =>
              queryFilter.setFilterState(
                filters.map((filter) =>
                  filter.column === "connection" &&
                  filter.type === "arrayOptions"
                    ? {
                        ...filter,
                        value: filter.value.map(
                          (value) =>
                            connectionSearchOptions.connectionIdByDisplayValue.get(
                              value,
                            ) ?? value,
                        ),
                      }
                    : filter,
                ),
              )
            }
            observed={observedOptions}
            isV4={false}
            search={{
              query: searchQuery,
              setQuery: (query) => setSearchQuery(query ?? ""),
            }}
          />
          <DataTableToolbar
            tableName={TABLE_NAME}
            columns={columns}
            filterState={queryFilter.filterState}
          />
          <div className="min-h-0 flex-1 overflow-hidden">
            <ResizableFilterLayout>
              <DataTableControls queryFilter={queryFilter} />
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <DataTable
                  tableName={TABLE_NAME}
                  columns={columns}
                  data={
                    isLoading
                      ? { isLoading: true, isError: false }
                      : {
                          isLoading: false,
                          isError: false,
                          data: filteredModels,
                        }
                  }
                  hidePagination
                  footer={
                    hasMoreProviders ? (
                      <Button
                        variant="secondary"
                        loading={isLoadingMoreProviders}
                        disabled={isLoadingMoreProviders}
                        aria-label="Load more"
                        onClick={() => {
                          onLoadMoreProviders();
                        }}
                      >
                        Load more
                      </Button>
                    ) : undefined
                  }
                  className="min-h-0"
                  noResultsMessage={emptyMessage}
                  cellPadding="comfortable"
                />
              </div>
            </ResizableFilterLayout>
          </div>
        </div>
      </DataTableControlsProvider>
    </div>
  );
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].toSorted((left, right) =>
    left.localeCompare(right),
  );
}

function getEmptyMessage({
  hasProviders,
  hasSynced,
  hasActiveFilters,
}: {
  hasProviders: boolean;
  hasSynced: boolean;
  hasActiveFilters: boolean;
}) {
  if (hasActiveFilters)
    return "No models match the current search and filters.";
  if (!hasProviders)
    return "Add a provider credential before discovering models.";
  if (hasSynced) return "No models were returned by the configured providers.";
  return "Sync models to discover what is currently available.";
}
