import { memo, type ReactNode, useMemo, useState } from "react";
import { Trash2 } from "@langfuse/icons";
import type { OrderByState } from "@langfuse/shared";
import type { OnChangeFn, PaginationState } from "@tanstack/react-table";
import { useStore } from "zustand";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { DataTable } from "@/src/components/table/data-table";
import type { CustomHeights } from "@/src/components/table/data-table-row-height-switch";
import { createTableSelectionStore } from "@/src/components/table/table-selection-store";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import type { GatewayCustomModel } from "@/src/features/ai-gateway/fns/parseGatewayCustomModels";
import { createGatewayRoutesTableColumn } from "@/src/features/ai-gateway/fns/createGatewayRoutesTableColumn";
import { filterGatewayModelsByApiFormat } from "@/src/features/ai-gateway/fns/filterGatewayModelsByApiFormat";
import {
  type ApiFormat,
  getGatewayModelApiFormats,
} from "@/src/features/ai-gateway/fns/getGatewayModelApiFormats";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";
import { ApiFormatFilter } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ApiFormatFilter/ApiFormatFilter";
import { CopyModelIdButton } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/CopyModelIdButton/CopyModelIdButton";
import { isGatewayModelEnabled } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/fns/isGatewayModelEnabled";
import type { GatewayModelAccessStore } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/types/gatewayModelAccessStore";
import {
  GatewayConnectionModelsSelectionBar,
  type GatewayConnectionModelsSelectionBarProps,
} from "./components/GatewayConnectionModelsSelectionBar";
import { GatewayConnectionModelsToolbar } from "./components/GatewayConnectionModelsToolbar";
import { ModelEnabledSwitch } from "./components/ModelEnabledSwitch";
import type { GatewayConnectionModelRow } from "./types/gatewayConnectionModelRow";
import type { GatewayApiFormat } from "@/src/features/ai-gateway/server/provider/registry";
const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];
const DEFAULT_PAGE_SIZE = 50;
const ROW_HEIGHTS = {
  s: "h-12",
  m: "h-24",
  l: "h-64",
} satisfies CustomHeights;

function GatewayConnectionModelNameCell({
  connectionName,
  modelId,
  custom,
  isSaving,
  onRemove,
}: {
  connectionName: string;
  modelId: string;
  custom: boolean;
  isSaving: boolean;
  onRemove: (model: string) => void;
}) {
  function handleRemove() {
    onRemove(modelId);
  }

  return (
    <div className="ph-no-capture flex min-w-0 items-center gap-2">
      <span className="truncate" title={modelId}>
        {modelId}
      </span>
      {custom ? <Badge text="Custom" color="blue" size="sm" /> : null}
      <CopyModelIdButton connectionName={connectionName} modelId={modelId} />
      {custom ? (
        <Tooltip label="Remove custom model">
          {({ getTriggerProps }) => (
            <IconButton
              {...getTriggerProps()}
              icon={Trash2}
              label={`Remove ${modelId}`}
              size="xs"
              disabled={isSaving}
              onClick={handleRemove}
            />
          )}
        </Tooltip>
      ) : null}
    </div>
  );
}

function GatewayConnectionModelEnabledCell({
  modelId,
  modelAccessStore,
  onToggle,
}: {
  modelId: string;
  modelAccessStore: GatewayModelAccessStore;
  onToggle: (model: string, enabled: boolean) => void;
}) {
  const enabled = useStore(modelAccessStore, (state) =>
    isGatewayModelEnabled(state, modelId),
  );

  return (
    <ModelEnabledSwitch model={modelId} enabled={enabled} onToggle={onToggle} />
  );
}

function createGatewayConnectionModelsColumns({
  connectionName,
  isSaving,
  modelAccessStore,
  selectActionColumn,
  toggleModel,
  removeCustomModel,
}: {
  connectionName: string;
  isSaving: boolean;
  modelAccessStore: GatewayModelAccessStore;
  selectActionColumn: LangfuseColumnDef<GatewayConnectionModelRow>;
  toggleModel: (model: string, enabled: boolean) => void;
  removeCustomModel: (model: string) => void;
}): LangfuseColumnDef<GatewayConnectionModelRow>[] {
  return [
    {
      ...selectActionColumn,
      size: 32,
      minSize: 32,
      maxSize: 32,
      enableResizing: false,
    },
    {
      accessorKey: "id",
      id: "name",
      header: "Model",
      size: 360,
      minSize: 180,
      enableSorting: true,
      headerClassName: "pl-2",
      cellClassName: "pl-2",
      cell: ({ row }) => (
        <GatewayConnectionModelNameCell
          connectionName={connectionName}
          modelId={row.original.id}
          custom={row.original.custom}
          isSaving={isSaving}
          onRemove={removeCustomModel}
        />
      ),
    },
    {
      ...createGatewayRoutesTableColumn<GatewayConnectionModelRow>({
        size: 200,
      }),
      isFlexWidth: true,
    },
    {
      accessorKey: "id",
      id: "status",
      header: "Enabled",
      enableSorting: true,
      size: 90,
      minSize: 90,
      maxSize: 90,
      enableResizing: false,
      cell: ({ row }) => (
        <GatewayConnectionModelEnabledCell
          modelId={row.original.id}
          modelAccessStore={modelAccessStore}
          onToggle={toggleModel}
        />
      ),
    },
  ];
}

export type GatewayConnectionModelsTableProps = {
  connectionName: string;
  provider: GatewayProvider;
  models: string[];
  /** The formats of the models the provider's catalog reports them for. */
  modelApiFormats?: Readonly<Record<string, GatewayApiFormat[]>>;
  customModels: GatewayCustomModel[];
  modelAccessStore: GatewayModelAccessStore;
  isSaving: boolean;
  /** Extra toolbar actions, e.g. the trigger for adding a custom model. */
  /** Rendered next to the search field, e.g. the provider filter. */
  filters?: ReactNode;
  toolbarActions?: ReactNode;
  onToggleModel: (model: string, enabled: boolean) => void;
  onRemoveCustomModel: (model: string) => void;
  onSetModelsEnabled: GatewayConnectionModelsSelectionBarProps["onSetEnabled"];
};

/**
 * Memoized with stable props so a model toggle re-renders only its own
 * switch; each enabled cell reads its value from `modelAccessStore`.
 */
export const GatewayConnectionModelsTable = memo(
  function GatewayConnectionModelsTable({
    connectionName,
    provider,
    models,
    modelApiFormats,
    customModels,
    modelAccessStore,
    isSaving,
    filters,
    toolbarActions,
    onToggleModel,
    onRemoveCustomModel,
    onSetModelsEnabled,
  }: GatewayConnectionModelsTableProps) {
    const [search, setSearch] = useState("");
    const [selectedApiFormats, setSelectedApiFormats] = useState<ApiFormat[]>(
      [],
    );
    const [pagination, setPagination] = useState<PaginationState>({
      pageIndex: 0,
      pageSize: DEFAULT_PAGE_SIZE,
    });
    const [orderBy, setOrderBy] = useState<OrderByState>({
      column: "name",
      order: "ASC",
    });
    const [selectionStore] = useState(() => createTableSelectionStore());
    const { selectActionColumn } =
      TableSelectionManager<GatewayConnectionModelRow>({
        projectId: "",
        tableName: "gateway-connection-models",
        setSelectedRows: selectionStore.getState().actions.setRowSelection,
        setSelectAll: selectionStore.getState().actions.setSelectAll,
        selectionStore,
      });
    const columns = useMemo(
      () =>
        createGatewayConnectionModelsColumns({
          connectionName,
          isSaving,
          modelAccessStore,
          selectActionColumn,
          toggleModel: onToggleModel,
          removeCustomModel: onRemoveCustomModel,
        }),
      [
        connectionName,
        isSaving,
        modelAccessStore,
        selectActionColumn,
        onToggleModel,
        onRemoveCustomModel,
      ],
    );
    // Only subscribe to toggles while sorting by status, where they move rows.
    const statusSortState = useStore(modelAccessStore, (state) =>
      orderBy?.column === "status" ? state : null,
    );
    const normalizedSearch = search.trim().toLowerCase();
    const customModelIds = new Set(customModels.map(({ id }) => id));
    const apiFormatFilter = filterGatewayModelsByApiFormat(
      models.map((id) => ({
        id,
        custom: customModelIds.has(id),
        apiFormats: getGatewayModelApiFormats(
          provider,
          id,
          modelApiFormats?.[id],
        ),
      })),
      selectedApiFormats,
    );
    const filteredModels = apiFormatFilter.models.filter((model) =>
      model.id.toLowerCase().includes(normalizedSearch),
    );
    const sortedModels = filteredModels.toSorted((left, right) => {
      const comparison = statusSortState
        ? Number(isGatewayModelEnabled(statusSortState, left.id)) -
          Number(isGatewayModelEnabled(statusSortState, right.id))
        : left.id.localeCompare(right.id);
      return orderBy?.order === "DESC" ? -comparison : comparison;
    });
    const filteredModelIds = filteredModels.map((model) => model.id);
    const lastPageIndex = Math.max(
      0,
      Math.ceil(sortedModels.length / pagination.pageSize) - 1,
    );
    const visiblePageIndex = Math.min(pagination.pageIndex, lastPageIndex);
    const rows = sortedModels.slice(
      visiblePageIndex * pagination.pageSize,
      (visiblePageIndex + 1) * pagination.pageSize,
    );
    const pageModelIds = rows.map((model) => model.id);

    const handleSearchChange = (value: string) => {
      setSearch(value);
      setPagination((current) => ({ ...current, pageIndex: 0 }));
      selectionStore.getState().actions.clearSelection();
    };
    const handleApiFormatsChange = (value: ApiFormat[]) => {
      setSelectedApiFormats(value);
      setPagination((current) => ({ ...current, pageIndex: 0 }));
      selectionStore.getState().actions.clearSelection();
    };
    const handlePaginationChange: OnChangeFn<PaginationState> = (updater) => {
      const currentState = {
        ...pagination,
        pageIndex: visiblePageIndex,
      };
      const nextState =
        typeof updater === "function" ? updater(currentState) : updater;
      setPagination(nextState);
    };
    const handleOrderByChange = (nextOrderBy: OrderByState) => {
      setOrderBy(nextOrderBy);
      setPagination((current) => ({ ...current, pageIndex: 0 }));
    };
    return (
      <>
        <div className="flex min-h-0 flex-1 flex-col">
          <GatewayConnectionModelsToolbar
            columns={columns}
            filteredModelIds={filteredModelIds}
            pageIndex={visiblePageIndex}
            pageModelIds={pageModelIds}
            pageSize={pagination.pageSize}
            search={search}
            selectionStore={selectionStore}
            filters={
              <>
                {filters}
                {apiFormatFilter.available.length > 1 ? (
                  <ApiFormatFilter
                    formats={apiFormatFilter.available}
                    value={apiFormatFilter.active}
                    onChange={handleApiFormatsChange}
                  />
                ) : null}
              </>
            }
            toolbarActions={toolbarActions}
            onSearchChange={handleSearchChange}
          />
          {/* `DataTable` draws its own top border. */}
          <div className="flex min-h-0 flex-col overflow-hidden rounded-b-md border-x border-b">
            <DataTable
              tableName="gateway-connection-models"
              columns={columns}
              data={{ isLoading: false, isError: false, data: rows }}
              pagination={{
                totalCount: sortedModels.length,
                state: {
                  pageIndex: visiblePageIndex,
                  pageSize: pagination.pageSize,
                },
                onChange: handlePaginationChange,
                options: PAGE_SIZE_OPTIONS,
              }}
              selectionStore={selectionStore}
              rowHeight="s"
              customRowHeights={ROW_HEIGHTS}
              orderBy={orderBy}
              setOrderBy={handleOrderByChange}
              noResultsMessage="No models match the current filters."
            />
          </div>
        </div>
        <GatewayConnectionModelsSelectionBar
          filteredModelIds={filteredModelIds}
          isSaving={isSaving}
          selectionStore={selectionStore}
          onSetEnabled={onSetModelsEnabled}
        />
      </>
    );
  },
);
