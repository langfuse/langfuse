import dynamic from "next/dynamic";
import { type ReactNode } from "react";
import { type FilterState } from "@langfuse/shared";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Skeleton } from "@/src/components/ui/skeleton";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { type DashboardPlacement } from "@/src/features/widgets/components/DashboardGrid";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  DashboardBlocksContext,
  type BlockEditorRequest,
  type DashboardBlocksContextValue,
} from "./dashboard-block-context";
import { useDashboardBlocksData } from "./useDashboardBlocksData";

const DashboardBlockEditor = dynamic(
  () =>
    import("./DashboardBlockEditor").then(
      (module) => module.DashboardBlockEditor,
    ),
  {
    loading: () => (
      <Dialog title="Opening editor" noCapture>
        <Dialog.Body>
          <Skeleton className="h-64 w-full" />
        </Dialog.Body>
      </Dialog>
    ),
  },
);

export function DashboardBlocksProvider({
  projectId,
  dashboardId,
  canEdit,
  readPath,
  dateRange,
  filterState,
  widgets,
  children,
}: {
  projectId: string;
  dashboardId: string;
  canEdit: boolean;
  readPath: ResolvedReadPath;
  dateRange: { from: Date; to: Date } | undefined;
  filterState: FilterState;
  widgets: DashboardPlacement[];
  children: ReactNode;
}) {
  const capture = usePostHogClientCapture();
  const {
    capabilities,
    capabilitiesPending,
    blocks,
    placementOptions,
    loadError,
  } = useDashboardBlocksData({
    projectId,
    dashboardId,
    canEdit,
    readPath,
    widgets,
  });
  const track: DashboardBlocksContextValue["track"] = (
    action,
    blockKind,
    isNew,
  ) =>
    capture("dashboard:block_interaction", {
      action,
      blockKind,
      isNew,
      isV4: readPath === "v4",
    });
  return (
    <DialogController<BlockEditorRequest>
      onDismiss={() => track("cancel")}
      renderDialog={({ state, closeDialog }) => (
        <DashboardBlockEditor
          request={state}
          projectId={projectId}
          dashboardId={dashboardId}
          canEdit={canEdit && capabilities[state.kind]}
          readPath={readPath}
          dateRange={dateRange}
          filterState={filterState}
          placementOptions={placementOptions}
          onPlacementChanged={() =>
            track("placement", state.kind, !state.block)
          }
          onPreview={() => track("preview", state.kind, !state.block)}
          onSaved={() => {
            track("save", state.kind, !state.block);
            closeDialog();
          }}
          onCancel={() => {
            track("cancel", state.kind, !state.block);
            closeDialog();
          }}
        />
      )}
    >
      {({ openDialog }) => (
        <DashboardBlocksContext.Provider
          value={{
            projectId,
            dashboardId,
            canEdit,
            readPath,
            dateRange,
            filterState,
            capabilitiesPending,
            capabilities,
            blocks,
            widgets,
            placementOptions,
            loadError,
            openEditor: (request) => {
              if (!canEdit || !capabilities[request.kind]) return;
              track(
                request.block ? "edit" : "add",
                request.kind,
                !request.block,
              );
              openDialog(request);
            },
            track,
          }}
        >
          {children}
        </DashboardBlocksContext.Provider>
      )}
    </DialogController>
  );
}
