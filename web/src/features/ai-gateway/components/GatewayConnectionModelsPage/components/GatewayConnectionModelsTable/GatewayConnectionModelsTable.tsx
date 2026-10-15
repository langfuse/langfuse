import { useCallback, useMemo, useState } from "react";
import type { OrderByState } from "@langfuse/shared";
import type { OnChangeFn, PaginationState } from "@tanstack/react-table";

import { DataTable } from "@/src/components/table/data-table";
import type { CustomHeights } from "@/src/components/table/data-table-row-height-switch";
import { createTableSelectionStore } from "@/src/components/table/table-selection-store";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { TableSelectionManager } from "@/src/features/table";
import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
import { toGatewayAllowedModelsSet } from "@/src/features/ai-gateway/fns/toGatewayAllowedModelsSet";
import { GatewayConnectionModelsSelectionBar } from "./components/GatewayConnectionModelsSelectionBar";
import { GatewayConnectionModelsToolbar } from "./components/GatewayConnectionModelsToolbar";
import { ModelEnabledSwitch } from "./components/ModelEnabledSwitch";
import type { GatewayConnectionModelRow } from "./types/gatewayConnectionModelRow";

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];
const DEFAULT_PAGE_SIZE = 50;
const ROW_HEIGHTS = {
  s: "h-12",
  m: "h-24",
  l: "h-64",
} satisfies CustomHeights;

export type GatewayConnectionModelsTableProps = {
  models: string[];
  allowedModels: string[] | null;
  isSaving: boolean;
  onEnableAll: () => void;
  onDisableAll: () => void;
  onSetEnabled: (
    models: string[],
    enabled: boolean,
    onSuccess?: () => void,
  ) => void;
};

export function GatewayConnectionModelsTable({
  models,
  allowedModels,
  isSaving,
  onEnableAll,
  onDisableAll,
  onSetEnabled,
}: GatewayConnectionModelsTableProps) {
  const [search, setSearch] = useState("");
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
  const toggleModel = useCallback(
    (model: string, enabled: boolean) => onSetEnabled([model], enabled),
    [onSetEnabled],
  );
  const columns = useMemo<LangfuseColumnDef<GatewayConnectionModelRow>[]>(
    () => [
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
        size: 240,
        minSize: 180,
        isFlexWidth: true,
        enableSorting: true,
        cell: ({ row }) => (
          <span className="block truncate" title={row.original.id}>
            {row.original.id}
          </span>
        ),
      },
      {
        accessorKey: "enabled",
        id: "status",
        header: "Enabled",
        enableSorting: true,
        size: 90,
        minSize: 90,
        maxSize: 90,
        enableResizing: false,
        cell: ({ row }) => (
          <ModelEnabledSwitch
            model={row.original.id}
            enabled={row.original.enabled}
            disabled={isSaving}
            onToggle={toggleModel}
          />
        ),
      },
    ],
    [isSaving, selectActionColumn, toggleModel],
  );
  const normalizedSearch = search.trim().toLowerCase();
  const allowedModelsSet = useMemo(
    () => toGatewayAllowedModelsSet(allowedModels),
    [allowedModels],
  );
  const filteredModels = models
    .filter((model) => model.toLowerCase().includes(normalizedSearch))
    .map((id) => ({
      id,
      enabled: isGatewayModelAllowed(allowedModelsSet, id),
    }));
  const sortedModels = filteredModels.toSorted((left, right) => {
    const comparison =
      orderBy?.column === "status"
        ? Number(left.enabled) - Number(right.enabled)
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
          isSaving={isSaving}
          pageIndex={visiblePageIndex}
          pageModelIds={pageModelIds}
          pageSize={pagination.pageSize}
          search={search}
          selectionStore={selectionStore}
          onEnableAll={onEnableAll}
          onDisableAll={onDisableAll}
          onSearchChange={handleSearchChange}
        />
        <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
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
            noResultsMessage="No models match the current search."
          />
        </div>
      </div>
      <GatewayConnectionModelsSelectionBar
        filteredModelIds={filteredModelIds}
        isSaving={isSaving}
        selectionStore={selectionStore}
        onSetEnabled={onSetEnabled}
      />
    </>
  );
}
