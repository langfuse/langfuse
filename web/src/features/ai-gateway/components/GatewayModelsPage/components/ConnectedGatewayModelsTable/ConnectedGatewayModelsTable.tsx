import { useCallback, useMemo, useState, type ComponentProps } from "react";
import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import type { PaginationBarProps } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { SearchInput } from "@/src/components/design-system/SearchInput/SearchInput";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { GatewayModelsEmptyState } from "@/src/features/ai-gateway/components/GatewayModelsPage/components/ConnectedGatewayModelsTable/components/GatewayModelsEmptyState/GatewayModelsEmptyState";
import { GATEWAY_MODELS_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  filterGatewayModels,
  type GatewayModelRow,
} from "./fns/filterGatewayModels";
import { GatewayModelsTable } from "./components/GatewayModelsTable/GatewayModelsTable";

const ALL_PROVIDERS = "all";

export function ConnectedGatewayModelsTable({
  models,
  organizationId,
  canManageGateway,
  failedProviderCount,
  providerCount,
  hasProviders,
  hasSynced,
  isLoading,
  syncError,
  onAddProvider,
}: {
  models: GatewayModelRow[];
  organizationId: string;
  canManageGateway: boolean;
  failedProviderCount: number;
  providerCount: number;
  hasProviders: boolean;
  hasSynced: boolean;
  isLoading: boolean;
  syncError: boolean;
  /** Omit for callers who cannot add provider credentials. */
  onAddProvider?: () => void;
}) {
  const capture = usePostHogClientCapture();
  const handleModelCopied = useCallback(
    (model: GatewayModelRow) =>
      capture("ai_gateway:model_name_copied", {
        orgId: organizationId,
        provider: model.provider,
      }),
    [capture, organizationId],
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [provider, setProvider] = useState<GatewayProvider | "all">(
    ALL_PROVIDERS,
  );
  const [paginationState, setPaginationState] = useState({
    pageIndex: 0,
    pageSize: 50,
  });
  const providerOptions = useMemo<
    Array<{ value: GatewayProvider | "all"; label: string }>
  >(
    () => [
      { value: ALL_PROVIDERS, label: "All providers" },
      ...uniqueSorted(models.map((model) => model.provider)).map((value) => ({
        value,
        label: providerLabels[value],
      })),
    ],
    [models],
  );
  const filteredModels = useMemo(
    () => filterGatewayModels(models, searchQuery, provider),
    [models, provider, searchQuery],
  );
  const lastAvailablePageIndex = Math.max(
    0,
    Math.ceil(filteredModels.length / paginationState.pageSize) - 1,
  );
  const currentPageIndex = Math.min(
    paginationState.pageIndex,
    lastAvailablePageIndex,
  );
  const pagination: PaginationBarProps = {
    mode: "offset",
    totalCount: filteredModels.length,
    state: { ...paginationState, pageIndex: currentPageIndex },
    onChange: setPaginationState,
  };
  const emptyMessage = getEmptyMessage({
    hasSynced,
    hasActiveFilters:
      searchQuery.trim().length > 0 || provider !== ALL_PROVIDERS,
  });
  /** When every provider failed to sync, the warning explains the empty list. */
  const allProvidersFailed =
    failedProviderCount > 0 && failedProviderCount === providerCount;
  const showEmptyState =
    !hasProviders ||
    (hasSynced &&
      !isLoading &&
      !syncError &&
      !allProvidersFailed &&
      models.length === 0);
  const tableData: ComponentProps<typeof GatewayModelsTable>["data"] = isLoading
    ? { status: "loading" }
    : {
        status: "success",
        data: filteredModels.slice(
          currentPageIndex * paginationState.pageSize,
          (currentPageIndex + 1) * paginationState.pageSize,
        ),
      };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <Header
        title="Gateway models"
        actionButtons={
          <Button
            variant="secondary"
            text="Docs"
            href={GATEWAY_MODELS_DOCS_URL}
          />
        }
      />
      <p className="text-muted-foreground text-sm">
        These models are enabled and available to use through the AI Gateway.
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
            No provider results were returned.
          </Alert.Description>
        </Alert>
      ) : null}

      {showEmptyState ? (
        <GatewayModelsEmptyState
          organizationId={organizationId}
          hasProviders={hasProviders}
          onAddProvider={onAddProvider}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="w-80 max-w-full">
              <SearchInput
                value={searchQuery}
                onChange={(value) => {
                  setSearchQuery(value);
                  setPaginationState((state) => ({ ...state, pageIndex: 0 }));
                }}
                onSubmit={(value) => {
                  setSearchQuery(value);
                  setPaginationState((state) => ({ ...state, pageIndex: 0 }));
                }}
                placeholder="Search models"
              />
            </div>
            <div className="w-44">
              <SelectInput
                aria-label="Filter by provider"
                value={provider}
                options={providerOptions}
                muted={provider === ALL_PROVIDERS}
                onValueChange={(value) => {
                  setProvider(value);
                  setPaginationState((state) => ({ ...state, pageIndex: 0 }));
                }}
                placeholder="All providers"
              />
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border-x border-b">
            <GatewayModelsTable
              organizationId={organizationId}
              canManageGateway={canManageGateway}
              onAfterModelCopy={handleModelCopied}
              data={tableData}
              noResultsMessage={emptyMessage}
              pagination={pagination}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function uniqueSorted<T extends string>(values: T[]) {
  return [...new Set(values)].toSorted((left, right) =>
    left.localeCompare(right),
  );
}

function getEmptyMessage({
  hasSynced,
  hasActiveFilters,
}: {
  hasSynced: boolean;
  hasActiveFilters: boolean;
}) {
  if (hasActiveFilters)
    return "No models match the current search and filters.";
  if (hasSynced) return "No models were returned by the configured providers.";
  return "Models will appear here after provider discovery completes.";
}
