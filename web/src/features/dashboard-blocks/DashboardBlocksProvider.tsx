import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import dynamic from "next/dynamic";
import { type ReactNode } from "react";
import { type FilterState, type SavedDashboardBlock } from "@langfuse/shared";
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

const DashboardBlockPositionEditor = dynamic(
  () =>
    import("./DashboardBlockPositionEditor").then(
      (module) => module.DashboardBlockPositionEditor,
    ),
  {
    loading: () => (
      <Dialog title="Edit position" noCapture>
        <Dialog.Body>
          <Skeleton className="h-24 w-full" />
        </Dialog.Body>
      </Dialog>
    ),
  },
);

type DashboardBlockDialogRequest =
  | { intent: "content"; request: BlockEditorRequest }
  | { intent: "position"; block: SavedDashboardBlock };

export function DashboardBlocksProvider({
  projectId,
  dashboardId,
  canEdit,
  readPath,
  dateRange,
  filterState,
  widgets,
  hasDashboardBlocks,
  dashboardReady = true,
  children,
}: {
  projectId: string;
  dashboardId: string;
  canEdit: boolean;
  readPath: ResolvedReadPath;
  dateRange: { from: Date; to: Date } | undefined;
  filterState: FilterState;
  widgets: DashboardPlacement[];
  hasDashboardBlocks?: boolean;
  dashboardReady?: boolean;
  children: ReactNode;
}) {
  const capture = usePostHogClientCapture();
  const authoringEnabled = useIsFeatureEnabled("dashboardBlockAuthoring");
  const {
    capabilities,
    capabilitiesPending,
    blocksPending,
    blocks,
    placementOptions,
    loadError,
  } = useDashboardBlocksData({
    projectId,
    dashboardId,
    canEdit,
    readPath,
    widgets,
    hasDashboardBlocks,
    dashboardReady,
    authoringEnabled,
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
    <DialogController<DashboardBlockDialogRequest>
      onDismiss={() => track("cancel")}
      renderDialog={({ state, closeDialog }) => {
        const kind =
          state.intent === "position" ? state.block.kind : state.request.kind;
        const isNew = state.intent === "content" && !state.request.block;
        const allowed = canEdit && capabilities[kind];
        const onSaved = () => {
          track("save", kind, isNew);
          closeDialog();
        };
        const onCancel = () => {
          track("cancel", kind, isNew);
          closeDialog();
        };
        const onPlacementChanged = () => track("placement", kind, isNew);
        if (state.intent === "position")
          return (
            <DashboardBlockPositionEditor
              block={state.block}
              projectId={projectId}
              dashboardId={dashboardId}
              canEdit={allowed}
              options={placementOptions}
              onSaved={onSaved}
              onCancel={onCancel}
              onPositionChanged={onPlacementChanged}
            />
          );
        return (
          <DashboardBlockEditor
            request={state.request}
            projectId={projectId}
            dashboardId={dashboardId}
            canEdit={allowed}
            readPath={readPath}
            dateRange={dateRange}
            filterState={filterState}
            placementOptions={placementOptions}
            onPlacementChanged={onPlacementChanged}
            onPreview={() => track("preview", kind, isNew)}
            onSaved={onSaved}
            onCancel={onCancel}
          />
        );
      }}
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
            blocksPending,
            capabilities,
            blocks,
            widgets,
            placementOptions,
            loadError,
            openPositionEditor: (block) => {
              if (!canEdit || !capabilities[block.kind]) return;
              track("placement", block.kind, false);
              openDialog({ intent: "position", block });
            },
            openEditor: (request) => {
              if (!canEdit || !capabilities[request.kind]) return;
              track(
                request.block ? "edit" : "add",
                request.kind,
                !request.block,
              );
              openDialog({ intent: "content", request });
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
