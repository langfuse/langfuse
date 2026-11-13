import { type ReactNode, useState } from "react";
import type { OrderByState } from "@langfuse/shared";
import type { OnChangeFn, PaginationState } from "@tanstack/react-table";

import { Switch } from "@/src/components/design-system/Switch/Switch";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { CopyModelIdButton } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/CopyModelIdButton/CopyModelIdButton";
import { ApiFormatFilter } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/components/ApiFormatFilter/ApiFormatFilter";
import { filterGatewayModelsByApiFormat } from "@/src/features/ai-gateway/fns/filterGatewayModelsByApiFormat";
import { createGatewayRoutesTableColumn } from "@/src/features/ai-gateway/fns/createGatewayRoutesTableColumn";
import {
  type ApiFormat,
  getGatewayModelApiFormats,
} from "@/src/features/ai-gateway/fns/getGatewayModelApiFormats";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";
import type { GatewayApiFormat } from "@/src/features/ai-gateway/server/provider/registry";

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];
const DEFAULT_PAGE_SIZE = 50;

type ReadOnlyModelRow = {
  id: string;
  connectionName: string;
  enabled: boolean;
  apiFormats: ApiFormat[];
};

const columns: LangfuseColumnDef<ReadOnlyModelRow>[] = [
  {
    accessorKey: "id",
    id: "name",
    header: "Model",
    size: 360,
    minSize: 180,
    enableSorting: true,
    cell: ({ row }) => (
      <div className="ph-no-capture flex min-w-0 items-center gap-2">
        <span className="truncate" title={row.original.id}>
          {row.original.id}
        </span>
        <CopyModelIdButton
          connectionName={row.original.connectionName}
          modelId={row.original.id}
        />
      </div>
    ),
  },
  {
    ...createGatewayRoutesTableColumn<ReadOnlyModelRow>({ size: 200 }),
    isFlexWidth: true,
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
      <Switch
        color="green"
        checked={row.original.enabled}
        disabled
        aria-label={`${row.original.id} is ${row.original.enabled ? "enabled" : "disabled"}`}
      />
    ),
  },
];

export type GatewayConnectionModelsReadOnlyTableProps = {
  connectionName: string;
  provider: GatewayProvider;
  models: string[];
  /** The formats of the models the provider's catalog reports them for. */
  modelApiFormats?: Readonly<Record<string, GatewayApiFormat[]>>;
  enabledModels: ReadonlySet<string>;
  /** Rendered next to the search field, e.g. the provider filter. */
  filters?: ReactNode;
};

/** A provider's models with their enabled state, for members who cannot change model access. */
export function GatewayConnectionModelsReadOnlyTable({
  connectionName,
  provider,
  models,
  modelApiFormats,
  enabledModels,
  filters,
}: GatewayConnectionModelsReadOnlyTableProps) {
  const [search, setSearch] = useState("");
  const [selectedApiFormats, setSelectedApiFormats] = useState<ApiFormat[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const [orderBy, setOrderBy] = useState<OrderByState>({
    column: "name",
    order: "ASC",
  });

  const normalizedSearch = search.trim().toLowerCase();
  const apiFormatFilter = filterGatewayModelsByApiFormat(
    models.map((id) => ({
      id,
      connectionName,
      enabled: enabledModels.has(id),
      apiFormats: getGatewayModelApiFormats(
        provider,
        id,
        modelApiFormats?.[id],
      ),
    })),
    selectedApiFormats,
  );
  const sortedModels = apiFormatFilter.models
    .filter((model) => model.id.toLowerCase().includes(normalizedSearch))
    .toSorted((left, right) => {
      const comparison =
        orderBy?.column === "status"
          ? Number(left.enabled) - Number(right.enabled)
          : left.id.localeCompare(right.id);
      return orderBy?.order === "DESC" ? -comparison : comparison;
    });
  const lastPageIndex = Math.max(
    0,
    Math.ceil(sortedModels.length / pagination.pageSize) - 1,
  );
  const visiblePageIndex = Math.min(pagination.pageIndex, lastPageIndex);
  const rows = sortedModels.slice(
    visiblePageIndex * pagination.pageSize,
    (visiblePageIndex + 1) * pagination.pageSize,
  );

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  };
  const handleApiFormatsChange = (value: ApiFormat[]) => {
    setSelectedApiFormats(value);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  };
  const handlePaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const currentState = { ...pagination, pageIndex: visiblePageIndex };
    setPagination(
      typeof updater === "function" ? updater(currentState) : updater,
    );
  };
  const handleOrderByChange = (nextOrderBy: OrderByState) => {
    setOrderBy(nextOrderBy);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DataTableToolbar
        tableName="gateway-connection-models-read-only"
        columns={columns}
        className="px-0"
        rowClassName="mt-0 mb-3"
        searchConfig={{
          metadataSearchFields: ["Model"],
          updateQuery: handleSearchChange,
          currentQuery: search,
          tableAllowsFullTextSearch: false,
        }}
        viewModeToggle={
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
      />
      {/* `DataTable` draws its own top border. */}
      <div className="flex min-h-0 flex-col overflow-hidden rounded-b-md border-x border-b">
        <DataTable
          tableName="gateway-connection-models-read-only"
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
          rowHeight="s"
          orderBy={orderBy}
          setOrderBy={handleOrderByChange}
          noResultsMessage="No models match the current filters."
        />
      </div>
    </div>
  );
}
