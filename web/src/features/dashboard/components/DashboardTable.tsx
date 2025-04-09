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

type DashboardTableRow = {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
};

function DeleteDashboard({ dashboardId }: { dashboardId: string }) {
  const projectId = useProjectIdFromURL();
  const utils = api.useUtils();
  const [isOpen, setIsOpen] = useState(false);
  const hasAccess = useHasProjectAccess({ projectId, scope: "dashboards:CUD" });
  const capture = usePostHogClientCapture();

  const mutDeleteDashboard = api.dashboard.delete.useMutation({
    onSuccess: () => {
      void utils.dashboard.invalidate();
      capture("dashboard:delete_dashboard_form_open");
    },
    onError: (e) => {
      showErrorToast("Failed to delete dashboard", e.message);
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
          This action permanently deletes this dashboard and cannot be undone.
        </p>
        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="destructive"
            loading={mutDeleteDashboard.isLoading}
            onClick={() => {
              if (!projectId) {
                console.error("Project ID is missing");
                return;
              }

              void mutDeleteDashboard.mutateAsync({
                projectId,
                dashboardId,
              });
              setIsOpen(false);
            }}
          >
            Delete Dashboard
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function DashboardTable() {
  const projectId = useProjectIdFromURL();
  const { setDetailPageList } = useDetailPageLists();

  const [orderByState, setOrderByState] = useOrderByState({
    column: "updatedAt",
    order: "DESC",
  });
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const dashboards = api.dashboard.allDashboards.useQuery(
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
    if (dashboards.isSuccess) {
      setDetailPageList(
        "dashboards",
        dashboards.data?.dashboards.map((d) => ({ id: d.id })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboards.isSuccess, dashboards.data]);

  const columnHelper = createColumnHelper<DashboardTableRow>();
  const dashboardColumns = [
    columnHelper.accessor("name", {
      header: "Name",
      id: "name",
      enableSorting: true,
      size: 200,
      cell: (row) => {
        const name = row.getValue();
        return name ? (
          <TableLink
            path={`/project/${projectId}/dashboards/${encodeURIComponent(row.row.original.id)}`}
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
        return <DeleteDashboard dashboardId={id} />;
      },
    }),
  ] as LangfuseColumnDef<DashboardTableRow>[];

  return (
    <DataTable
      columns={dashboardColumns}
      data={
        dashboards.isLoading
          ? { isLoading: true, isError: false }
          : dashboards.isError
            ? {
                isLoading: false,
                isError: true,
                error: dashboards.error.message,
              }
            : {
                isLoading: false,
                isError: false,
                data: dashboards.data.dashboards,
              }
      }
      orderBy={orderByState}
      setOrderBy={setOrderByState}
      pagination={{
        totalCount: dashboards.data?.totalCount ?? null,
        onChange: setPaginationState,
        state: paginationState,
      }}
    />
  );
}
