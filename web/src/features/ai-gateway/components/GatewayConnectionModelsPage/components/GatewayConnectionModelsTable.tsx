import { useMemo, useState } from "react";

import { SettingsTable } from "@/src/components/SettingsTable/SettingsTable";
import type { PaginationBarProps } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { ModelEnabledSwitch } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ModelEnabledSwitch";
import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";

const PAGE_SIZE = 10;

type ModelRow = { id: string };

export function GatewayConnectionModelsTable({
  models,
  allowedModels,
  isSaving,
  onToggle,
  onEnableAll,
  onDisableAll,
}: {
  models: string[];
  allowedModels: string[] | null;
  isSaving: boolean;
  onToggle: (model: string, enabled: boolean) => void;
  onEnableAll: () => void;
  onDisableAll: () => void;
}) {
  const [search, setSearch] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const columns = useMemo<LangfuseColumnDef<ModelRow>[]>(
    () => [
      createTextTableColumn<ModelRow>({
        accessorKey: "id",
        header: "Model",
      }),
      {
        id: "enabled",
        header: "Enabled",
        size: 100,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <ModelEnabledSwitch
              model={row.original.id}
              enabled={isGatewayModelAllowed(allowedModels, row.original.id)}
              disabled={isSaving}
              onToggle={onToggle}
            />
          </div>
        ),
      },
    ],
    [allowedModels, isSaving, onToggle],
  );
  const normalizedSearch = search.trim().toLowerCase();
  const filteredModels = models.filter((model) =>
    model.toLowerCase().includes(normalizedSearch),
  );
  const lastPageIndex = Math.max(
    0,
    Math.ceil(filteredModels.length / PAGE_SIZE) - 1,
  );
  const visiblePageIndex = Math.min(pageIndex, lastPageIndex);
  const rows = filteredModels
    .slice(visiblePageIndex * PAGE_SIZE, (visiblePageIndex + 1) * PAGE_SIZE)
    .map((id) => ({ id }));

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPageIndex(0);
  };
  const handlePaginationChange: PaginationBarProps["onChange"] = (
    nextState,
  ) => {
    setPageIndex(nextState.pageIndex);
  };

  return (
    <SettingsTable
      tableName="gateway-connection-models"
      columns={columns}
      data={{ status: "success", data: rows }}
      search={{
        value: search,
        placeholder: "Filter models",
        onChange: handleSearchChange,
      }}
      toolbarActions={[
        {
          id: "enable-all",
          label: "Enable all",
          variant: "secondary",
          disabled: isSaving ? { reason: "Saving model access" } : undefined,
          onClick: onEnableAll,
        },
        {
          id: "disable-all",
          label: "Disable all",
          variant: "secondary",
          disabled: isSaving ? { reason: "Saving model access" } : undefined,
          onClick: onDisableAll,
        },
      ]}
      pagination={{
        mode: "offset",
        totalCount: filteredModels.length,
        state: { pageIndex: visiblePageIndex, pageSize: PAGE_SIZE },
        onChange: handlePaginationChange,
      }}
      noResultsMessage="No models match the current search."
    />
  );
}
