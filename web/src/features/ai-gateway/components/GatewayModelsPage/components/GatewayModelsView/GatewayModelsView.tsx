import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { DataTable } from "@/src/components/table/data-table";
import {
  DataTableControls,
  DataTableControlsProvider,
} from "@/src/components/table/data-table-controls";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { useSidebarFilterState } from "@/src/features/filters/hooks/useSidebarFilterState";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import { gatewayModelsFilterConfig } from "@/src/features/ai-gateway/constants/modelsFilterConfig";
import { GATEWAY_MODELS_FIELD_REGISTRY } from "@/src/features/ai-gateway/constants/modelsSearchRegistry";
import { TableSearchBar, toObservedOptions } from "@/src/features/search-bar";
import {
  filterGatewayModels,
  type GatewayModelRow,
} from "./filterGatewayModels";

const TABLE_NAME = gatewayModelsFilterConfig.tableName;

const columns: LangfuseColumnDef<GatewayModelRow, unknown>[] = [
  {
    accessorKey: "id",
    id: "id",
    header: "Model",
    size: 300,
    isFlexWidth: true,
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
      <div className="flex flex-wrap gap-1">
        {row.original.availableVia.map((connection) => (
          <Badge
            key={`${connection.provider}:${connection.connectionName}`}
            variant="outline-solid"
          >
            {connection.connectionName} · {providerLabels[connection.provider]}
          </Badge>
        ))}
      </div>
    ),
  },
  {
    accessorKey: "apiFormats",
    id: "apiFormats",
    header: "API formats",
    size: 280,
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.apiFormats.map((format) => (
          <Badge key={format} variant="secondary">
            {format}
          </Badge>
        ))}
      </div>
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
            registry={GATEWAY_MODELS_FIELD_REGISTRY}
            filterState={queryFilter.searchBarFilterState}
            setFilterState={queryFilter.setFilterState}
            observed={toObservedOptions(filterOptions, isLoading)}
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
