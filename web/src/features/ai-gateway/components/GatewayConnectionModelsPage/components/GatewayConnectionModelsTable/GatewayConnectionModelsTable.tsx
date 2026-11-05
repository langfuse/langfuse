import { type ReactNode, useCallback, useMemo, useState } from "react";
import { Trash2 } from "@langfuse/icons";
import type { OrderByState } from "@langfuse/shared";
import type { OnChangeFn, PaginationState } from "@tanstack/react-table";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { DataTable } from "@/src/components/table/data-table";
import type { CustomHeights } from "@/src/components/table/data-table-row-height-switch";
import { createTableSelectionStore } from "@/src/components/table/table-selection-store";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
import { toGatewayAllowedModelsSet } from "@/src/features/ai-gateway/fns/toGatewayAllowedModelsSet";
import {
  GatewayConnectionModelsSelectionBar,
  type GatewayConnectionModelsSelectionBarProps,
} from "./components/GatewayConnectionModelsSelectionBar";
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

function GatewayConnectionModelNameCell({
  modelId,
  custom,
  isSaving,
  onRemove,
}: {
  modelId: string;
  custom: boolean;
  isSaving: boolean;
  onRemove: (model: string) => void;
}) {
  function handleRemove() {
    onRemove(modelId);
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate" title={modelId}>
        {modelId}
      </span>
      {custom ? (
        <>
          <Badge text="Custom" color="blue" size="sm" />
          <IconButton
            icon={Trash2}
            label={`Remove ${modelId}`}
            size="xs"
            disabled={isSaving}
            onClick={handleRemove}
          />
        </>
      ) : null}
    </div>
  );
}

function GatewayConnectionModelEnabledCell({
  modelId,
  enabled,
  isSaving,
  onToggle,
}: {
  modelId: string;
  enabled: boolean;
  isSaving: boolean;
  onToggle: (model: string, enabled: boolean) => void;
}) {
  return (
    <ModelEnabledSwitch
      model={modelId}
      enabled={enabled}
      disabled={isSaving}
      onToggle={onToggle}
    />
  );
}

function createGatewayConnectionModelsColumns({
  isSaving,
  selectActionColumn,
  toggleModel,
  removeCustomModel,
}: {
  isSaving: boolean;
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
      size: 240,
      minSize: 180,
      isFlexWidth: true,
      enableSorting: true,
      headerClassName: "pl-2",
      cellClassName: "pl-2",
      cell: ({ row }) => (
        <GatewayConnectionModelNameCell
          modelId={row.original.id}
          custom={row.original.custom}
          isSaving={isSaving}
          onRemove={removeCustomModel}
        />
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
        <GatewayConnectionModelEnabledCell
          modelId={row.original.id}
          enabled={row.original.enabled}
          isSaving={isSaving}
          onToggle={toggleModel}
        />
      ),
    },
  ];
}

export type GatewayConnectionModelsTableProps = {
  models: string[];
  allowedModels: string[] | null;
  customModels: string[];
  isSaving: boolean;
  /** Extra toolbar actions, e.g. the trigger for adding a custom model. */
  toolbarActions?: ReactNode;
  onRemoveCustomModel: (model: string) => void;
  onEnableAll: () => void;
  onDisableAll: () => void;
  onSetEnabled: GatewayConnectionModelsSelectionBarProps["onSetEnabled"];
};

export function GatewayConnectionModelsTable({
  models,
  allowedModels,
  customModels,
  isSaving,
  toolbarActions,
  onRemoveCustomModel,
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
    (model: string, enabled: boolean) =>
      onSetEnabled({ models: [model], enabled, scope: "single" }),
    [onSetEnabled],
  );
  const columns = useMemo(
    () =>
      createGatewayConnectionModelsColumns({
        isSaving,
        selectActionColumn,
        toggleModel,
        removeCustomModel: onRemoveCustomModel,
      }),
    [isSaving, selectActionColumn, toggleModel, onRemoveCustomModel],
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
      custom: customModels.includes(id),
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
          toolbarActions={toolbarActions}
          onEnableAll={onEnableAll}
          onDisableAll={onDisableAll}
          onSearchChange={handleSearchChange}
        />
        <div className="flex min-h-0 flex-col overflow-hidden rounded-md border">
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
