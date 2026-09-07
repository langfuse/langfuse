import { type FilterState, type ColumnDefinition } from "@langfuse/shared";
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
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";
import { providerLabels } from "@/src/features/llm-gateway/constants/providerLabels";
import type { GatewayProvider } from "@/src/features/llm-gateway/types/gatewayProvider";

const TABLE_NAME = "gateway-models";

export type GatewayModelRow = {
  id: string;
  availableVia: Array<{
    connectionName: string;
    provider: GatewayProvider;
  }>;
  apiFormats: string[];
};

const filterColumns: ColumnDefinition[] = [
  {
    name: "Provider",
    id: "provider",
    type: "arrayOptions",
    internal: "provider",
    options: Object.entries(providerLabels).map(([value, displayValue]) => ({
      value,
      displayValue,
    })),
  },
  {
    name: "API format",
    id: "apiFormat",
    type: "arrayOptions",
    internal: "apiFormat",
    options: [],
  },
];

const filterConfig: FilterConfig = {
  tableName: TABLE_NAME,
  columnDefinitions: filterColumns,
  defaultExpanded: ["provider", "apiFormat"],
  facets: [
    { type: "categorical", column: "provider", label: "Provider" },
    { type: "categorical", column: "apiFormat", label: "API format" },
  ],
};

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
      provider: uniqueSorted(
        models.flatMap((model) =>
          model.availableVia.map((connection) => connection.provider),
        ),
      ),
      apiFormat: uniqueSorted(models.flatMap((model) => model.apiFormats)),
    }),
    [models],
  );
  const queryFilter = useSidebarFilterState(filterConfig, filterOptions, {
    stateLocation: "memory",
  });
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
          <DataTableToolbar
            tableName={TABLE_NAME}
            columns={columns}
            filterState={queryFilter.filterState}
            searchConfig={{
              metadataSearchFields: ["Model"],
              currentQuery: searchQuery,
              tableAllowsFullTextSearch: false,
              updateQuery: setSearchQuery,
            }}
          />
          <ResizableFilterLayout>
            <DataTableControls queryFilter={queryFilter} />
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <DataTable
                tableName={TABLE_NAME}
                columns={columns}
                data={
                  isLoading
                    ? { isLoading: true, isError: false }
                    : { isLoading: false, isError: false, data: filteredModels }
                }
                hidePagination
                className="min-h-0"
                noResultsMessage={emptyMessage}
                cellPadding="comfortable"
              />
            </div>
          </ResizableFilterLayout>
        </div>
      </DataTableControlsProvider>

      {hasMoreProviders ? (
        <Button
          className="self-center"
          variant="secondary"
          loading={isLoadingMoreProviders}
          disabled={isLoadingMoreProviders}
          aria-label="Load more providers"
          onClick={() => {
            onLoadMoreProviders();
          }}
        >
          Load more providers
        </Button>
      ) : null}
    </div>
  );
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].toSorted((left, right) =>
    left.localeCompare(right),
  );
}

function getModelFilterValues(model: GatewayModelRow, column: string) {
  switch (column) {
    case "provider":
      return model.availableVia.map((connection) => connection.provider);
    case "apiFormat":
      return model.apiFormats;
    default:
      return [];
  }
}

function filterGatewayModels(
  models: GatewayModelRow[],
  searchQuery: string,
  filters: FilterState,
) {
  const normalizedSearch = searchQuery.trim().toLowerCase();

  return models.filter((model) => {
    if (
      normalizedSearch.length > 0 &&
      !model.id.toLowerCase().includes(normalizedSearch)
    ) {
      return false;
    }

    return filters.every((filter) => {
      const values = getModelFilterValues(model, filter.column);

      if (filter.type === "string") {
        const needle = filter.value.toLowerCase();
        const contains = values.some((value) =>
          value.toLowerCase().includes(needle),
        );
        return filter.operator === "does not contain" ? !contains : contains;
      }

      if (filter.type !== "arrayOptions" && filter.type !== "stringOptions") {
        return true;
      }

      const selected = filter.value;
      if (filter.operator === "none of") {
        return selected.every((value) => !values.includes(value));
      }
      if (filter.operator === "all of") {
        return selected.every((value) => values.includes(value));
      }
      return selected.some((value) => values.includes(value));
    });
  });
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
