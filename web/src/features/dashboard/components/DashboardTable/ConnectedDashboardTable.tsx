import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { useHasProjectAccess } from "@/src/features/rbac";
import { useEffect, useMemo, useState } from "react";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { useOrderByState } from "@/src/features/orderBy";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import { api } from "@/src/utils/api";
import { safeExtract } from "@/src/utils/map-utils";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { EditDialogDashboardContent } from "@/src/features/dashboard/components/EditDialogDashboardContent";
import { CloneFirstDialogController } from "@/src/features/dashboard/components/CloneFirstDialogController";
import { useRouter } from "next/router";
import { DialogController } from "@/src/components/ui/dialog";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { PaginationBar } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { type AsyncTableData } from "@/src/components/design-system/table/Table";
import { assertUnreachable } from "@/src/utils/types";
import { DashboardTable, type DashboardTableRow } from "./DashboardTable";

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
        title: "Dashboard cloned",
        description: "The dashboard has been cloned successfully",
      });
    },
    onError: (error) => {
      showErrorToast("Failed to clone dashboard", error.message);
    },
  });
  const deleteDashboard = api.dashboard.delete.useMutation({
    onSuccess: () => {
      capture("dashboard:delete_dashboard_button_click");
      showSuccessToast({
        title: "Dashboard deleted",
        description: "The dashboard has been deleted successfully",
      });
      utils.dashboard.invalidate();
    },
    onError: (error) => {
      showErrorToast("Failed to delete dashboard", error.message);
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
