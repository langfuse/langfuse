import {
  showErrorToast,
  showSuccessToast,
} from "@/src/app/shell/notifications";
import { useHasProjectAccess } from "@/src/identity/access-control";
import { useEffect, useMemo, useState } from "react";
import useProjectIdFromURL from "@/src/app/hooks/useProjectIdFromURL";
import { useOrderByState } from "@/src/app/tables/sorting";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import { api } from "@/src/app/utils/api";
import { safeExtract } from "@/src/app/utils/map-utils";
import { useDetailPageLists } from "@/src/app/shell/navigate-detail-pages";
import { usePostHogClientCapture } from "@/src/analytics/internal/posthog";
import { EditDialogDashboardContent } from "@/src/analytics/dashboards/components/EditDialogDashboardContent";
import { CloneFirstDialogController } from "@/src/analytics/dashboards/components/CloneFirstDialogController";
import { useRouter } from "next/router";
import { DialogController } from "@/src/app/design-system/legacy-primitives/dialog";
import { ConfirmationDialogController } from "@/src/app/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { PaginationBar } from "@/src/app/design-system/PaginationBar/PaginationBar";
import { type AsyncTableData } from "@/src/app/design-system/table/Table";
import { assertUnreachable } from "@/src/app/utils/types";
import { DashboardTable, type DashboardTableRow } from "./DashboardTable";
import { classifyTrpcToastError } from "@/src/app/utils/trpcErrorClassification";

export function ConnectedDashboardTable() {
  const projectId = useProjectIdFromURL() as string;
  const { setDetailPageList } = useDetailPageLists();
  const router = useRouter();
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({ projectId, scope: "dashboards:CUD" });
  const [selectedDashboard, setSelectedDashboard] =
    useState<DashboardTableRow | null>(null);
  const cloneDashboard = api.dashboard.cloneDashboard.useMutation({
    onSuccess: () => {
      utils.dashboard.invalidate();
      showSuccessToast({
        operation: "dashboard.clone",
        title: "Dashboard cloned",
        description: "The dashboard has been cloned successfully",
      });
    },
    onError: (error) => {
      showErrorToast(
        "Failed to clone dashboard",
        error.message,
        classifyTrpcToastError(error, "dashboard.clone"),
      );
    },
  });
  const deleteDashboard = api.dashboard.delete.useMutation({
    onSuccess: () => {
      capture("dashboard:delete_dashboard_button_click");
      showSuccessToast({
        operation: "dashboard.delete",
        title: "Dashboard deleted",
        description: "The dashboard has been deleted successfully",
      });
      utils.dashboard.invalidate();
    },
    onError: (error) => {
      showErrorToast(
        "Failed to delete dashboard",
        error.message,
        classifyTrpcToastError(error, "dashboard.delete"),
      );
    },
  });

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
    if (!dashboards.data) return;

    const pageCount = Math.max(
      1,
      Math.ceil(dashboards.data.totalCount / paginationState.pageSize),
    );
    if (paginationState.pageIndex < pageCount) return;

    setPaginationState({ ...paginationState, pageIndex: 0 });
  }, [dashboards.data, paginationState, setPaginationState]);

  useEffect(() => {
    if (dashboards.isSuccess) {
      setDetailPageList(
        "dashboards",
        dashboards.data?.dashboards.map((d) => ({ id: d.id })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboards.isSuccess, dashboards.data]);

  const {
    status: dashboardStatus,
    data: dashboardData,
    error: dashboardError,
  } = dashboards;
  const tableData = useMemo<AsyncTableData<DashboardTableRow[]>>(() => {
    if (dashboardStatus === "pending") return { status: "loading" };
    if (dashboardStatus === "error") {
      return { status: "error", error: dashboardError.message };
    }
    if (dashboardStatus === "success") {
      return {
        status: "success",
        data: safeExtract(dashboardData, "dashboards", []),
      };
    }

    return assertUnreachable(dashboardStatus);
  }, [dashboardData, dashboardError, dashboardStatus]);

  return (
    <CloneFirstDialogController
      projectId={projectId}
      dashboardId={selectedDashboard?.id ?? ""}
      dashboardName={selectedDashboard?.name ?? "Dashboard"}
    >
      {({ openDialog: openCloneFirstDialog }) => (
        <DialogController
          closeOnInteractionOutside={false}
          size="default"
          renderContent={({ closeDialog }) =>
            selectedDashboard ? (
              <EditDialogDashboardContent
                closeDialog={closeDialog}
                projectId={projectId}
                dashboardId={selectedDashboard.id}
                initialName={selectedDashboard.name}
                initialDescription={selectedDashboard.description}
              />
            ) : null
          }
        >
          {({ openDialog: openEditDialog }) => (
            <ConfirmationDialogController
              title="Delete dashboard"
              text="This action cannot be undone. It permanently deletes this dashboard."
              confirmLabel="Delete dashboard"
              variant="destructive"
              loading={deleteDashboard.isPending}
              onConfirm={async () => {
                if (!selectedDashboard) return;

                await deleteDashboard.mutateAsync({
                  projectId,
                  dashboardId: selectedDashboard.id,
                });
              }}
            >
              {({ openDialog: openDeleteDialog }) => (
                <div className="flex min-h-0 flex-1 flex-col">
                  <DashboardTable
                    projectId={projectId}
                    topBorder={false}
                    hasAccess={hasAccess}
                    loadingRowCount={Math.min(paginationState.pageSize, 8)}
                    onEdit={(dashboard) => {
                      setSelectedDashboard(dashboard);
                      if (dashboard.owner === "PROJECT") {
                        openEditDialog();
                        return;
                      }

                      capture("dashboard:locked_edit_attempt", {
                        dashboard_id: dashboard.id,
                        attempt: "list_edit",
                        surface: "list",
                      });
                      openCloneFirstDialog();
                    }}
                    onClone={(dashboard) => {
                      cloneDashboard.mutate(
                        {
                          projectId,
                          dashboardId: dashboard.id,
                        },
                        {
                          onSuccess: () => {
                            capture("dashboard:clone_dashboard", {
                              source: "list_clone_button",
                              dashboardId: dashboard.id,
                              owner: dashboard.owner,
                            });
                          },
                        },
                      );
                    }}
                    onDelete={(dashboard) => {
                      setSelectedDashboard(dashboard);
                      capture("dashboard:delete_dashboard_form_open");
                      openDeleteDialog();
                    }}
                    data={tableData}
                    orderBy={orderByState}
                    setOrderBy={setOrderByState}
                    onRowClick={(row) => {
                      router.push(
                        `/project/${projectId}/dashboards/${encodeURIComponent(row.id)}`,
                      );
                    }}
                  />
                  <PaginationBar
                    mode="offset"
                    totalCount={dashboards.data?.totalCount ?? null}
                    onChange={setPaginationState}
                    state={paginationState}
                  />
                </div>
              )}
            </ConfirmationDialogController>
          )}
        </DialogController>
      )}
    </CloneFirstDialogController>
  );
}
