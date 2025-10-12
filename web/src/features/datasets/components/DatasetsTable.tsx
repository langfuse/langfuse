import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { DatasetActionButton } from "@/src/features/datasets/components/DatasetActionButton";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { api } from "@/src/utils/api";
import {
  useQueryParams,
  withDefault,
  NumberParam,
  useQueryParam,
  StringParam,
} from "use-query-params";
import { type RouterOutput } from "@/src/utils/types";
import { MoreVertical } from "lucide-react";
import { useEffect } from "react";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { TableViewPresetTableName, type Prisma } from "@langfuse/shared";
import { IOTableCell } from "@/src/components/ui/IOTableCell";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import { useTranslation } from "react-i18next";

type RowData = {
  key: {
    id: string;
    name: string;
  };
  description?: string;
  createdAt: Date;
  lastRunAt?: Date;
  countItems: number;
  countRuns: number;
  metadata: Prisma.JsonValue;
};

export function DatasetsTable(props: { projectId: string }) {
  const { t } = useTranslation();
  const { setDetailPageList } = useDetailPageLists();
  const [rowHeight, setRowHeight] = useRowHeightLocalStorage("datasets", "s");
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );

  const datasets = api.datasets.allDatasets.useQuery({
    projectId: props.projectId,
    searchQuery,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
  });

  const metrics = api.datasets.allDatasetsMetrics.useQuery(
    {
      projectId: props.projectId,
      datasetIds: datasets.data?.datasets.map((t) => t.id) ?? [],
    },
    {
      enabled: datasets.isSuccess,
    },
  );

  useEffect(() => {
    if (datasets.isSuccess) {
      setDetailPageList(
        "datasets",
        datasets.data.datasets.map((t) => ({ id: t.id })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasets.isSuccess, datasets.data]);

  const columns: LangfuseColumnDef<RowData>[] = [
    {
      accessorKey: "key",
      header: t("dataset.table.name"),
      id: "key",
      size: 150,
      isPinned: true,
      cell: ({ row }) => {
        const key: RowData["key"] = row.getValue("key");
        return (
          <TableLink
            path={`/project/${props.projectId}/datasets/${key.id}`}
            value={key.name}
          />
        );
      },
    },
    {
      accessorKey: "description",
      header: t("dataset.table.description"),
      id: "description",
      enableHiding: true,
      size: 200,
      cell: ({ row }) => {
        const description: RowData["description"] = row.getValue("description");
        return (
          <div className="flex h-full items-center overflow-y-auto">
            {description}
          </div>
        );
      },
    },
    {
      accessorKey: "countItems",
      header: t("dataset.table.items"),
      id: "countItems",
      enableHiding: true,
      size: 60,
    },
    {
      accessorKey: "countRuns",
      header: t("common.table.runs"),
      id: "countRuns",
      enableHiding: true,
      size: 60,
    },
    {
      accessorKey: "createdAt",
      header: t("common.batchExports.created"),
      id: "createdAt",
      enableHiding: true,
      size: 150,
      cell: ({ row }) => {
        const value: RowData["createdAt"] = row.getValue("createdAt");
        return <LocalIsoDate date={value} />;
      },
    },
    {
      accessorKey: "lastRunAt",
      header: t("dataset.table.lastRun"),
      id: "lastRunAt",
      enableHiding: true,
      size: 150,
      cell: ({ row }) => {
        const value: RowData["lastRunAt"] = row.getValue("lastRunAt");
        return value ? <LocalIsoDate date={value} /> : undefined;
      },
    },
    {
      accessorKey: "metadata",
      header: t("dataset.table.metadata"),
      id: "metadata",
      enableHiding: true,
      size: 300,
      cell: ({ row }) => {
        const metadata: RowData["metadata"] = row.getValue("metadata");
        return !!metadata ? (
          <IOTableCell data={metadata} singleLine={rowHeight === "s"} />
        ) : null;
      },
    },
    {
      id: "actions",
      accessorKey: "actions",
      header: t("dataset.table.actions"),
      size: 70,
      cell: ({ row }) => {
        const key: RowData["key"] = row.getValue("key");
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">{t("dataset.table.openMenu")}</span>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="flex flex-col [&>*]:w-full [&>*]:justify-start"
            >
              <DropdownMenuLabel>
                {t("dataset.table.actions")}
              </DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <DatasetActionButton
                  mode="update"
                  projectId={props.projectId}
                  datasetId={key.id}
                  datasetName={key.name}
                  datasetDescription={row.getValue("description") ?? undefined}
                  datasetMetadata={row.getValue("metadata") ?? undefined}
                />
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <DatasetActionButton
                  mode="delete"
                  projectId={props.projectId}
                  datasetId={key.id}
                  datasetName={key.name}
                />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  type CoreOutput = RouterOutput["datasets"]["allDatasets"]["datasets"][number];
  type MetricsOutput =
    RouterOutput["datasets"]["allDatasetsMetrics"]["metrics"][number];

  const datasetsRowData = joinTableCoreAndMetrics<CoreOutput, MetricsOutput>(
    datasets.data?.datasets,
    metrics.data?.metrics,
  );

  const convertToTableRow = (
    row: CoreOutput & Partial<MetricsOutput>,
  ): RowData => {
    return {
      key: { id: row.id, name: row.name },
      description: row.description ?? "",
      createdAt: row.createdAt,
      lastRunAt: row.lastRunAt ?? undefined,
      countItems: row.countDatasetItems ?? 0,
      countRuns: row.countDatasetRuns ?? 0,
      metadata: row.metadata,
    };
  };

  const [columnVisibility, setColumnVisibility] = useColumnVisibility<RowData>(
    "datasetsColumnVisibility",
    columns,
  );

  const [columnOrder, setColumnOrder] = useColumnOrder<RowData>(
    "datasetsColumnOrder",
    columns,
  );

  const { isLoading: isViewLoading, ...viewControllers } = useTableViewManager({
    tableName: TableViewPresetTableName.Datasets,
    projectId: props.projectId,
    stateUpdaters: {
      setColumnOrder: setColumnOrder,
      setColumnVisibility: setColumnVisibility,
      setSearchQuery: setSearchQuery,
    },
    validationContext: {
      columns,
    },
  });

  return (
    <>
      <DataTableToolbar
        columns={columns}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        columnOrder={columnOrder}
        setColumnOrder={setColumnOrder}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
        searchConfig={{
          metadataSearchFields: ["Name"],
          updateQuery: setSearchQuery,
          currentQuery: searchQuery ?? undefined,
          tableAllowsFullTextSearch: false,
          setSearchType: undefined,
          searchType: undefined,
        }}
        viewConfig={{
          tableName: TableViewPresetTableName.Datasets,
          projectId: props.projectId,
          controllers: viewControllers,
        }}
      />
      <DataTable
        tableName={"datasets"}
        columns={columns}
        data={
          datasets.isLoading || isViewLoading
            ? { isLoading: true, isError: false }
            : datasets.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: datasets.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: (datasetsRowData.rows ?? []).map((t) =>
                    convertToTableRow(t),
                  ),
                }
        }
        pagination={{
          totalCount: datasets.data?.totalDatasets ?? null,
          onChange: setPaginationState,
          state: paginationState,
        }}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        columnOrder={columnOrder}
        onColumnOrderChange={setColumnOrder}
        rowHeight={rowHeight}
      />
    </>
  );
}
