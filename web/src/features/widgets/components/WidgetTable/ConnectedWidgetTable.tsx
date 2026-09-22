import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { useCallback, useEffect, useMemo, useState } from "react";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { useOrderByState } from "@/src/features/orderBy";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import { api } from "@/src/utils/api";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages";
import { useHasProjectAccess } from "@/src/features/rbac";
import {
  buildWidgetExport,
  downloadWidgetJson,
  toWidgetCreateFields,
  type WidgetExportSource,
} from "@/src/features/widgets/utils/import-export-utils";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useRouter } from "next/router";
import { type metricAggregations } from "@langfuse/shared/query";
import { type z } from "zod";
import { PaginationBar } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { type AsyncTableData } from "@/src/components/design-system/table/Table";
import { assertUnreachable } from "@/src/utils/types";
import { DashboardWidgetTable, type WidgetTableRow } from "./WidgetTable";

export function ConnectedDashboardWidgetTable() {
  const projectId = useProjectIdFromURL();
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const [selectedWidget, setSelectedWidget] = useState<WidgetTableRow | null>(
    null,
  );
  const deleteWidget = api.dashboardWidgets.delete.useMutation({
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
        return;
      }

      showErrorToast("Failed to delete widget", error.message);
    },
  });

  return (
    <ConfirmationDialogController
      title="Delete widget"
      text="This action permanently deletes this widget. If the widget is currently used in any dashboard, you will need to remove it from those dashboards first."
      confirmLabel="Delete Widget"
      variant="destructive"
      loading={deleteWidget.isPending}
      onConfirm={async () => {
        if (!projectId || !selectedWidget) return;
        await deleteWidget.mutateAsync({
          projectId,
          widgetId: selectedWidget.id,
        });
      }}
    >
      {({ openDialog }) => (
        <ConnectedDashboardWidgetTableContent
          openDeleteDialog={(widget) => {
            setSelectedWidget(widget);
            openDialog();
          }}
        />
      )}
    </ConfirmationDialogController>
  );
}

function ConnectedDashboardWidgetTableContent({
  openDeleteDialog,
}: {
  openDeleteDialog: (widget: WidgetTableRow) => void;
}) {
  const projectId = useProjectIdFromURL();
  const { setDetailPageList } = useDetailPageLists();
  const router = useRouter();
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const hasCUDAccess = useHasProjectAccess({
    projectId,
    scope: "dashboards:CUD",
  });
  const { mutateAsync: createWidgetAsync } =
    api.dashboardWidgets.create.useMutation();

  const fetchExportSource = useCallback(
    async (widgetId: string): Promise<WidgetExportSource> => {
      if (!projectId) throw new Error("Project ID is missing");

      const widget = await utils.dashboardWidgets.get.fetch(
        { projectId, widgetId },
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
    },
    [projectId, utils.dashboardWidgets.get],
  );

  const handleDownloadJson = useCallback(
    async (widgetId: string) => {
      try {
        downloadWidgetJson(await fetchExportSource(widgetId));
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
    },
    [capture, fetchExportSource],
  );

  const handleCopyToClipboard = useCallback(
    async (widgetId: string) => {
      try {
        const exportSource = await fetchExportSource(widgetId);
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
    },
    [capture, fetchExportSource],
  );

  const handleDuplicate = useCallback(
    async (widgetId: string) => {
      try {
        if (!projectId) throw new Error("Project ID is missing");

        const exportSource = await fetchExportSource(widgetId);
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
    },
    [capture, createWidgetAsync, fetchExportSource, projectId, utils],
  );

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
    if (!widgets.data) return;

    const pageCount = Math.max(
      1,
      Math.ceil(widgets.data.totalCount / paginationState.pageSize),
    );
    if (paginationState.pageIndex < pageCount) return;

    setPaginationState({ ...paginationState, pageIndex: 0 });
  }, [paginationState, setPaginationState, widgets.data]);

  useEffect(() => {
    if (widgets.isSuccess) {
      setDetailPageList(
        "widgets",
        widgets.data?.widgets.map((w) => ({ id: w.id })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgets.isSuccess, widgets.data]);

  const {
    status: widgetStatus,
    data: widgetData,
    error: widgetError,
  } = widgets;
  const tableData = useMemo<AsyncTableData<WidgetTableRow[]>>(() => {
    if (widgetStatus === "pending") return { status: "loading" };
    if (widgetStatus === "error") {
      return { status: "error", error: widgetError.message };
    }
    if (widgetStatus === "success") {
      return { status: "success", data: widgetData.widgets };
    }

    return assertUnreachable(widgetStatus);
  }, [widgetData, widgetError, widgetStatus]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardWidgetTable
        projectId={projectId}
        hasCUDAccess={hasCUDAccess}
        loadingRowCount={Math.min(paginationState.pageSize, 8)}
        onCopy={(widget) => handleCopyToClipboard(widget.id)}
        onDelete={openDeleteDialog}
        onDownload={(widget) => handleDownloadJson(widget.id)}
        onDuplicate={(widget) => handleDuplicate(widget.id)}
        data={tableData}
        orderBy={orderByState}
        setOrderBy={setOrderByState}
        onRowClick={(row) => {
          router.push(
            `/project/${projectId}/widgets/${encodeURIComponent(row.id)}`,
          );
        }}
      />
      <PaginationBar
        totalCount={widgets.data?.totalCount ?? null}
        onChange={setPaginationState}
        state={paginationState}
      />
    </div>
  );
}
