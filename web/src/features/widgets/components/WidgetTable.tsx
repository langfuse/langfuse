import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { useEffect, useState } from "react";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import { api } from "@/src/utils/api";
import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { createColumnHelper } from "@tanstack/react-table";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createLinkTableColumn } from "@/src/components/design-system/table/columns/createLinkTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import startCase from "lodash/startCase";
import { Button } from "@/src/components/ui/button";
import { useHasProjectAccess } from "@/src/features/rbac";
import { Copy, CopyPlus, FileJson, MoreVertical, Trash } from "lucide-react";
import {
  buildWidgetExport,
  downloadWidgetJson,
  toWidgetCreateFields,
  type WidgetExportSource,
} from "@/src/features/widgets/utils/import-export-utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useRouter } from "next/router";
import { getChartTypeDisplayName } from "@/src/features/widgets/chart-library/utils";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import { type metricAggregations } from "@langfuse/shared/query";
import { type z } from "zod";

type WidgetTableRow = {
  id: string;
  name: string;
  description: string;
  view: string;
  chartType: string;
  createdAt: Date;
  updatedAt: Date;
  owner: "PROJECT" | "LANGFUSE";
};

function WidgetActionsCell({
  widgetId,
  owner,
}: {
  widgetId: string;
  owner: "PROJECT" | "LANGFUSE";
}) {
  const projectId = useProjectIdFromURL();
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const hasCUDAccess = useHasProjectAccess({
    projectId,
    scope: "dashboards:CUD",
  });
  const hasDeleteAccess = hasCUDAccess && owner !== "LANGFUSE";

  const mutDeleteWidget = api.dashboardWidgets.delete.useMutation({
    onSuccess: () => {
      utils.dashboardWidgets.invalidate();
      capture("dashboard:delete_widget_form_open");
    },
    onError: (error) => {
      if (error.data?.code === "CONFLICT") {
        showErrorToast(
          "Widget in use",
          "Widget is still in use. Please remove it from all dashboards before deleting it.",
        );
      } else {
        showErrorToast("Failed to delete widget", error.message);
      }
    },
  });
  const { mutateAsync: createWidgetAsync } =
    api.dashboardWidgets.create.useMutation();

  const fetchExportSource = async (): Promise<WidgetExportSource> => {
    if (!projectId) {
      throw new Error("Project ID is missing");
    }
    const widget = await utils.dashboardWidgets.get.fetch(
      {
        projectId,
        widgetId,
      },
      // Serve rapid repeat actions (double-click, copy-then-download) from
      // the cache instead of firing a request per menu click.
      { staleTime: 30_000 },
    );

    return {
      name: widget.name,
      description: widget.description,
      view: widget.view,
      dimensions: widget.dimensions,
      metrics: widget.metrics.map((metric) => ({
        measure: metric.measure,
        agg: metric.agg as z.infer<typeof metricAggregations>,
      })),
      filters: widget.filters,
      chartType: widget.chartType,
      chartConfig: widget.chartConfig,
      minVersion: widget.minVersion,
    };
  };

  const handleDownloadJson = async () => {
    try {
      downloadWidgetJson(await fetchExportSource());
      capture("dashboard:widget_json_downloaded", {
        surface: "widget_table",
        widget_id: widgetId,
      });
    } catch (error) {
      showErrorToast(
        "Failed to download widget",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  };

  const handleCopyToClipboard = async () => {
    try {
      const exportSource = await fetchExportSource();
      await copyTextToClipboard(
        JSON.stringify(buildWidgetExport(exportSource), null, 2),
      );
      capture("dashboard:widget_copied_to_clipboard", {
        surface: "widget_table",
        kind: "widget",
        widget_id: widgetId,
      });
      showSuccessToast({
        title: "Widget copied",
        description: "Paste it on any dashboard with Cmd/Ctrl+V.",
      });
    } catch (error) {
      showErrorToast(
        "Failed to copy widget",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  };

  const handleDuplicate = async () => {
    try {
      if (!projectId) {
        throw new Error("Project ID is missing");
      }
      const exportSource = await fetchExportSource();
      await createWidgetAsync({
        projectId,
        ...toWidgetCreateFields(exportSource),
        name: `${exportSource.name} (Copy)`,
      });
      capture("dashboard:widget_duplicated", {
        surface: "widget_table",
        kind: "widget",
        chart_type: exportSource.chartType,
        view: exportSource.view,
      });
      utils.dashboardWidgets.invalidate();
      showSuccessToast({
        title: "Widget cloned",
        description: `Created "${exportSource.name} (Copy)".`,
      });
    } catch (error) {
      showErrorToast(
        "Failed to duplicate widget",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="xs" aria-label="Widget actions">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleCopyToClipboard}>
            <Copy className="mr-2 h-4 w-4" />
            Copy widget
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!hasCUDAccess} onClick={handleDuplicate}>
            <CopyPlus className="mr-2 h-4 w-4" />
            Clone
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDownloadJson}>
            <FileJson className="mr-2 h-4 w-4" />
            Download as JSON
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!hasDeleteAccess}
            onClick={() => setIsDeleteDialogOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Delete widget"
        description="This action permanently deletes this widget. If the widget is currently used in any dashboard, you will need to remove it from those dashboards first."
        confirmLabel="Delete Widget"
        loading={mutDeleteWidget.isPending}
        onConfirm={() => {
          if (!projectId) {
            console.error("Project ID is missing");
            return;
          }
          mutDeleteWidget.mutate({ projectId, widgetId });
          setIsDeleteDialogOpen(false);
        }}
      />
    </>
  );
}

export function DashboardWidgetTable() {
  const projectId = useProjectIdFromURL();
  const { setDetailPageList } = useDetailPageLists();
  const router = useRouter();

  const [orderByState, setOrderByState] = useOrderByState({
    column: "updatedAt",
    order: "DESC",
  });
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const widgets = api.dashboardWidgets.all.useQuery(
    {
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
      projectId: projectId as string, // Typecast as query is enabled only when projectId is present
      orderBy: orderByState,
    },
    {
      enabled: Boolean(projectId),
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  useEffect(() => {
    if (widgets.isSuccess) {
      setDetailPageList(
        "widgets",
        widgets.data?.widgets.map((w) => ({ id: w.id })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgets.isSuccess, widgets.data]);

  const columnHelper = createColumnHelper<WidgetTableRow>();
  const widgetColumns = [
    createLinkTableColumn<WidgetTableRow>({
      accessorKey: "name",
      header: "Name",
      enableSorting: true,
      size: 200,
      getCell: (name, { row }) => {
        if (name) {
          return {
            type: "link",
            props: {
              path: `/project/${projectId}/widgets/${encodeURIComponent(row.original.id)}`,
              value: name,
            },
          };
        }

        return undefined;
      },
    }),
    createTextTableColumn<WidgetTableRow>({
      accessorKey: "description",
      header: "Description",
      size: 300,
    }),
    createTextTableColumn<WidgetTableRow>({
      accessorKey: "view",
      header: "View Type",
      enableSorting: true,
      size: 100,
      mapValue: (value) => startCase(value?.toLowerCase()),
    }),
    createTextTableColumn<WidgetTableRow>({
      accessorKey: "chartType",
      header: "Chart Type",
      enableSorting: true,
      size: 100,
      mapValue: (value) =>
        value
          ? getChartTypeDisplayName(value as DashboardWidgetChartType)
          : undefined,
    }),
    createDateTableColumn<WidgetTableRow>({
      accessorKey: "createdAt",
      header: "Created At",
      enableSorting: true,
      size: 150,
    }),
    createDateTableColumn<WidgetTableRow>({
      accessorKey: "updatedAt",
      header: "Updated At",
      enableSorting: true,
      size: 150,
    }),
    columnHelper.display({
      id: "actions",
      header: "Actions",
      size: 70,
      cell: (row) => {
        const id = row.row.original.id;
        return (
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <WidgetActionsCell widgetId={id} owner={row.row.original.owner} />
          </div>
        );
      },
    }),
  ] as LangfuseColumnDef<WidgetTableRow>[];

  return (
    <DataTable
      tableName="widgets"
      columns={widgetColumns}
      data={
        widgets.isLoading
          ? { isLoading: true, isError: false }
          : widgets.isError
            ? {
                isLoading: false,
                isError: true,
                error: widgets.error.message,
              }
            : {
                isLoading: false,
                isError: false,
                data: widgets.data?.widgets ?? [],
              }
      }
      orderBy={orderByState}
      setOrderBy={setOrderByState}
      cellPadding="comfortable"
      pagination={{
        totalCount: widgets.data?.totalCount ?? null,
        onChange: setPaginationState,
        state: paginationState,
      }}
      onRowClick={(row) => {
        router.push(
          `/project/${projectId}/widgets/${encodeURIComponent(row.id)}`,
        );
      }}
    />
  );
}
