import { useEffect } from "react";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import { api } from "@/src/utils/api";
import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { createColumnHelper } from "@tanstack/react-table";
import TableLink from "@/src/components/table/table-link";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { startCase } from "lodash";
import { Button } from "@/src/components/ui/button";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Trash } from "lucide-react";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { useRouter } from "next/router";
import { getChartTypeDisplayName } from "@/src/features/widgets/chart-library/utils";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";

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

export function DeleteWidget({
  widgetId,
  owner,
}: {
  widgetId: string;
  owner: "PROJECT" | "LANGFUSE";
}) {
  const projectId = useProjectIdFromURL();
  const utils = api.useUtils();
  const [isOpen, setIsOpen] = useState(false);
  const hasAccess =
    useHasProjectAccess({ projectId, scope: "dashboards:CUD" }) &&
    owner !== "LANGFUSE";
  const capture = usePostHogClientCapture();

  const mutDeleteWidget = api.dashboardWidgets.delete.useMutation({
    onSuccess: () => {
      void utils.dashboardWidgets.invalidate();
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

  return (
    <Popover open={isOpen} onOpenChange={() => setIsOpen(!isOpen)}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" disabled={!hasAccess}>
          <Trash className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <h2 className="text-md mb-3 font-semibold">Please confirm</h2>
        <p className="mb-3 text-sm">
          This action permanently deletes this widget. If the widget is
          currently used in any dashboard, you will need to remove it from those
          dashboards first.
        </p>
        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="destructive"
            loading={mutDeleteWidget.isLoading}
            onClick={() => {
              if (!projectId) {
                console.error("Project ID is missing");
                return;
              }

              void mutDeleteWidget.mutateAsync({
                projectId,
                widgetId,
              });
              setIsOpen(false);
            }}
          >
            Delete Widget
          </Button>
        </div>
      </PopoverContent>
    </Popover>
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
    columnHelper.accessor("name", {
      header: "Name",
      id: "name",
      enableSorting: true,
      size: 200,
      cell: (row) => {
        const name = row.getValue();
        return name ? (
          <TableLink
            path={`/project/${projectId}/widgets/${encodeURIComponent(row.row.original.id)}`}
            value={name}
          />
        ) : undefined;
      },
    }),
    columnHelper.accessor("description", {
      header: "Description",
      id: "description",
      size: 300,
      cell: (row) => {
        return row.getValue();
      },
    }),
    columnHelper.accessor("view", {
      header: "View Type",
      id: "view",
      enableSorting: true,
      size: 100,
      cell: (row) => {
        return startCase(row.getValue().toLowerCase());
      },
    }),
    columnHelper.accessor("chartType", {
      header: "Chart Type",
      id: "chartType",
      enableSorting: true,
      size: 100,
      cell: (row) =>
        getChartTypeDisplayName(row.getValue() as DashboardWidgetChartType),
    }),
    columnHelper.accessor("createdAt", {
      header: "Created At",
      id: "createdAt",
      enableSorting: true,
      size: 150,
      cell: (row) => {
        const createdAt = row.getValue();
        return <LocalIsoDate date={createdAt} />;
      },
    }),
    columnHelper.accessor("updatedAt", {
      header: "Updated At",
      id: "updatedAt",
      enableSorting: true,
      size: 150,
      cell: (row) => {
        const updatedAt = row.getValue();
        return <LocalIsoDate date={updatedAt} />;
      },
    }),
    columnHelper.display({
      id: "actions",
      header: "Actions",
      size: 70,
      cell: (row) => {
        const id = row.row.original.id;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <DeleteWidget widgetId={id} owner={row.row.original.owner} />
          </div>
        );
      },
    }),
  ] as LangfuseColumnDef<WidgetTableRow>[];

  return (
    <DataTable
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
                data: widgets.data.widgets,
              }
      }
      orderBy={orderByState}
      setOrderBy={setOrderByState}
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
