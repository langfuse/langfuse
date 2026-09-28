import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import type { PaginationBarProps } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { Button } from "@/src/components/ui/button";
import {
  DataTableControls,
  DataTableControlsProvider,
} from "@/src/components/table/data-table-controls";
import { SearchableTableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { useSidebarFilterState } from "@/src/features/filters";
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
} from "./fns/filterGatewayModels";
import { getGatewayModelConnectionSearchOptions } from "./fns/getGatewayModelConnectionSearchOptions";
import { GatewayModelsTable } from "./GatewayModelsTable";

const TABLE_NAME = gatewayModelsFilterConfig.tableName;

export function ConnectedGatewayModelsTable({
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
  const [pageIndex, setPageIndex] = useState(0);
  const [pendingPage, setPendingPage] = useState<{
    index: number;
    filterKey: string;
  } | null>(null);
  const pageSize = 10;
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
  const filterKey = JSON.stringify([searchQuery, queryFilter.filterState]);
  useEffect(() => {
    if (pendingPage && pendingPage.filterKey !== filterKey) {
      setPendingPage(null);
    }
  }, [filterKey, pendingPage]);
  const lastAvailablePageIndex = Math.max(
    0,
    Math.ceil(filteredModels.length / pageSize) - 1,
  );
  const currentPageIndex =
    pendingPage?.filterKey === filterKey &&
    pendingPage.index * pageSize < filteredModels.length
      ? pendingPage.index
      : Math.min(pageIndex, lastAvailablePageIndex);
  const pagination: PaginationBarProps = {
    mode: "cursor",
    state: { pageIndex: currentPageIndex, pageSize },
    hasNextPage:
      (currentPageIndex + 1) * pageSize < filteredModels.length ||
      hasMoreProviders,
    isLoadingNextPage: isLoadingMoreProviders,
    onChange: ({ pageIndex: nextPageIndex }) => {
      if (nextPageIndex * pageSize < filteredModels.length) {
        setPendingPage(null);
        setPageIndex(nextPageIndex);
        return;
      }
      if (!hasMoreProviders || isLoadingMoreProviders) return;
      setPendingPage({ index: nextPageIndex, filterKey });
      onLoadMoreProviders();
    },
  };
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
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <SearchableTableFilterLayout
              search={
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
              }
              toolbar={null}
            >
              <DataTableControls queryFilter={queryFilter} />
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <GatewayModelsTable
                  data={
                    isLoading
                      ? { status: "loading" }
                      : {
                          status: "success",
                          data: filteredModels.slice(
                            currentPageIndex * pageSize,
                            (currentPageIndex + 1) * pageSize,
                          ),
                        }
                  }
                  noResultsMessage={emptyMessage}
                  pagination={pagination}
                />
              </div>
            </SearchableTableFilterLayout>
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
