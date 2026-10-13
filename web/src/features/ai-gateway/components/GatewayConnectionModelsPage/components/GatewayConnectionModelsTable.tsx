import { useCallback, useMemo, useState } from "react";
import type { OrderByState } from "@langfuse/shared";
import type { OnChangeFn, PaginationState } from "@tanstack/react-table";

import { DataTable } from "@/src/components/table/data-table";
import { createTableSelectionStore } from "@/src/components/table/table-selection-store";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { TableSelectionManager } from "@/src/features/table";
import { GatewayConnectionModelsToolbar } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/GatewayConnectionModelsToolbar";
import { ModelEnabledSwitch } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ModelEnabledSwitch";
import type { GatewayConnectionModelRow } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/types/gatewayConnectionModelRow";
import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";

const PAGE_SIZE = 10;

export function GatewayConnectionModelsTable({
  models,
  allowedModels,
  isSaving,
  onEnableAll,
  onDisableAll,
  onSetEnabled,
}: {
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
}) {
  const [search, setSearch] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
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
      selectActionColumn,
      {
        accessorKey: "id",
        id: "name",
        header: "Model",
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
        header: "Status",
        enableSorting: true,
        size: 160,
        cell: ({ row }) => (
          <div className="flex items-center justify-between gap-2">
            <span>{row.original.enabled ? "Enabled" : "Disabled"}</span>
            <ModelEnabledSwitch
              model={row.original.id}
              enabled={row.original.enabled}
              disabled={isSaving}
              onToggle={toggleModel}
            />
          </div>
        ),
      },
    ],
    [isSaving, selectActionColumn, toggleModel],
  );
  const normalizedSearch = search.trim().toLowerCase();
  const filteredModels = models
    .filter((model) => model.toLowerCase().includes(normalizedSearch))
    .map((id) => ({
      id,
      enabled: isGatewayModelAllowed(allowedModels, id),
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
    Math.ceil(sortedModels.length / PAGE_SIZE) - 1,
  );
  const visiblePageIndex = Math.min(pageIndex, lastPageIndex);
  const rows = sortedModels.slice(
    visiblePageIndex * PAGE_SIZE,
    (visiblePageIndex + 1) * PAGE_SIZE,
  );
  const pageModelIds = rows.map((model) => model.id);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPageIndex(0);
    selectionStore.getState().actions.clearSelection();
  };
  const handlePaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const nextState =
      typeof updater === "function"
        ? updater({ pageIndex: visiblePageIndex, pageSize: PAGE_SIZE })
        : updater;
    setPageIndex(nextState.pageIndex);
  };
  const handleOrderByChange = (nextOrderBy: OrderByState) => {
    setOrderBy(nextOrderBy);
    setPageIndex(0);
  };

  return (
    <div className="flex max-h-[60dvh] min-h-0 flex-col overflow-hidden rounded-md border">
      <GatewayConnectionModelsToolbar
        columns={columns}
        filteredModelIds={filteredModelIds}
        isSaving={isSaving}
        pageIndex={visiblePageIndex}
        pageModelIds={pageModelIds}
        pageSize={PAGE_SIZE}
        search={search}
        selectionStore={selectionStore}
        onEnableAll={onEnableAll}
        onDisableAll={onDisableAll}
        onSearchChange={handleSearchChange}
        onSetEnabled={onSetEnabled}
      />
      <DataTable
        tableName="gateway-connection-models"
        columns={columns}
        data={{ isLoading: false, isError: false, data: rows }}
        pagination={{
          totalCount: sortedModels.length,
          state: { pageIndex: visiblePageIndex, pageSize: PAGE_SIZE },
          onChange: handlePaginationChange,
          options: [PAGE_SIZE],
        }}
        selectionStore={selectionStore}
        orderBy={orderBy}
        setOrderBy={handleOrderByChange}
        noResultsMessage="No models match the current search."
      />
    </div>
  );
}
