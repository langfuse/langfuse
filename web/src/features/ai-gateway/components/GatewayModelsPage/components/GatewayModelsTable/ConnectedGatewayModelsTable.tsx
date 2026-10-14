import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import type { PaginationBarProps } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { SearchInput } from "@/src/components/design-system/SearchInput/SearchInput";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Button } from "@/src/components/ui/button";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";
import {
  filterGatewayModels,
  type GatewayModelRow,
} from "./fns/filterGatewayModels";
import { GatewayModelsTable } from "./GatewayModelsTable";

const ALL_PROVIDERS = "all";

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
  const [provider, setProvider] = useState<GatewayProvider | "all">(
    ALL_PROVIDERS,
  );
  const [pageIndex, setPageIndex] = useState(0);
  const [pendingPage, setPendingPage] = useState<{
    index: number;
    filterKey: string;
  } | null>(null);
  const pageSize = 10;
  const providerOptions = useMemo<
    Array<{ value: GatewayProvider | "all"; label: string }>
  >(
    () => [
      { value: ALL_PROVIDERS, label: "All providers" },
      ...uniqueSorted(
        models.flatMap((model) =>
          model.availableVia.map((connection) => connection.provider),
        ),
      ).map((value) => ({ value, label: providerLabels[value] })),
    ],
    [models],
  );
  const filteredModels = useMemo(
    () => filterGatewayModels(models, searchQuery, provider),
    [models, provider, searchQuery],
  );
  const filterKey = JSON.stringify([searchQuery, provider]);
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
      setPageIndex(currentPageIndex);
      setPendingPage({ index: nextPageIndex, filterKey });
      onLoadMoreProviders();
    },
  };
  const emptyMessage = getEmptyMessage({
    hasProviders,
    hasSynced,
    hasActiveFilters:
      searchQuery.trim().length > 0 || provider !== ALL_PROVIDERS,
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <Header
        title="Gateway models"
        actionButtons={
          <Button variant="secondary" loading={isLoading} onClick={onSync}>
            <RefreshCw className="icon-base mr-1.5" />
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

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="w-80 max-w-full">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              onSubmit={setSearchQuery}
              placeholder="Search models"
            />
          </div>
          <div className="w-44">
            <SelectInput
              aria-label="Filter by provider"
              value={provider}
              options={providerOptions}
              onValueChange={setProvider}
              placeholder="All providers"
            />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
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
      </div>
    </div>
  );
}

function uniqueSorted<T extends string>(values: T[]) {
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
