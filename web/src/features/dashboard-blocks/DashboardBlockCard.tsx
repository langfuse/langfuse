import dynamic from "next/dynamic";
import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  CopyPlusIcon,
  Grid2X2,
  Pencil,
  RotateCcw,
  Trash2,
} from "@langfuse/icons";
import { type SavedDashboardBlock } from "@langfuse/shared";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { type DataCardActions } from "@/src/components/design-system/DataCard/DataCard";
import { useSaveDashboardBlock } from "./useDashboardBlockMutations";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";
import { DashboardMarkdown } from "./DashboardMarkdown";
import { useDashboardBlocks } from "./dashboard-block-context";
const MultiQueryChart = dynamic(
  () =>
    import("./multi-query/MultiQueryChart").then(
      (module) => module.MultiQueryChart,
    ),
  { loading: () => <Skeleton className="h-80 w-full" /> },
);

export function DashboardBlockCard({
  block,
  draggable = false,
  initialTabId,
  editOnly = false,
}: {
  block: SavedDashboardBlock;
  draggable?: boolean;
  initialTabId?: string;
  editOnly?: boolean;
}) {
  const [selectedTabId, setSelectedTabId] = useState(initialTabId);
  const {
    projectId,
    dashboardId,
    canEdit,
    capabilities,
    readPath,
    dateRange,
    filterState,
    openEditor,
    openPositionEditor,
    placementOptions,
    track,
  } = useDashboardBlocks();
  const editable = canEdit && capabilities[block.kind];
  const sourcePreset =
    block.kind === "multiQuery" ? block.sourcePreset : undefined;
  const duplicate = useSaveDashboardBlock({
    projectId,
    dashboardId,
    onSaved: () => {
      track("duplicate", block.kind, true);
      showSuccessToast({
        operation: "widget.clone",
        title: "Widget duplicated",
        description: "You can edit the copy independently.",
      });
    },
  });
  const duplicateWidget = () => {
    if (!editable || duplicate.isPending) return;
    const copyTitle = (title: string, limit: number) => {
      const suffix = " (Copy)";
      return title.slice(0, limit - suffix.length) + suffix;
    };
    const content =
      block.kind === "markdown"
        ? {
            kind: block.kind,
            config: {
              ...block.config,
              title: copyTitle(block.config.title || "Markdown", 255),
            },
          }
        : {
            kind: block.kind,
            config: {
              ...block.config,
              title: copyTitle(block.config.title, 200),
            },
          };
    duplicate.mutate(
      {
        projectId,
        dashboardId,
        blockPatch: {
          op: "upsert",
          id: uuidv4(),
          expectedRevision: 0,
          beforePlacementId:
            sourcePreset?.placementId ?? block.beforePlacementId,
          ...content,
        },
      },
      {
        onError: (error) =>
          showErrorToast(
            "Could not duplicate widget",
            error.message,
            classifyTrpcToastError(error, "widget.clone"),
          ),
      },
    );
  };
  const update = useSaveDashboardBlock({ projectId, dashboardId });
  return (
    <DialogController<"remove" | "restore">
      onBeforeClose={() => !update.isPending}
      renderDialog={({ state, closeDialog }) => {
        const restoring = state === "restore";
        const removalDescription = sourcePreset
          ? "This removes the widget and its original Home card from this dashboard."
          : "The widget will be removed from this dashboard.";
        return (
          <Dialog
            title={restoring ? "Restore Home card?" : "Remove widget?"}
            requireExplicitClose={update.isPending}
            actions={[
              {
                label: restoring ? "Restore Home card" : "Remove",
                variant: "destructive",
                disabled: !editable,
                loading: update.isPending,
                onClick: () => {
                  if (!editable || update.isPending) return;
                  update.mutate(
                    {
                      projectId,
                      dashboardId,
                      blockPatch: {
                        op: restoring ? "restorePreset" : "remove",
                        id: block.id,
                        expectedRevision: block.revision,
                      },
                    },
                    {
                      onSuccess: () => {
                        track(
                          restoring ? "preset_restore" : "remove",
                          block.kind,
                          false,
                          sourcePreset?.presetId,
                        );
                        closeDialog();
                      },
                    },
                  );
                },
              },
            ]}
          >
            <Dialog.Body>
              <p className="text-muted-foreground text-sm">
                {restoring
                  ? "The original Home card will return to this position. Changes to the editable widget will be discarded."
                  : removalDescription}
              </p>
              {update.error && (
                <p role="alert" className="text-destructive mt-2 text-sm">
                  The dashboard could not be updated. Refresh and try again.
                </p>
              )}
            </Dialog.Body>
          </Dialog>
        );
      }}
    >
      {({ openDialog }) => {
        const confirm = (action: "remove" | "restore") => {
          update.reset();
          openDialog(action);
        };
        const positionActions: NonNullable<DataCardActions["menu"]> =
          !sourcePreset && placementOptions.length > 1
            ? [
                {
                  id: "position",
                  type: "item",
                  title: "Edit position",
                  icon: Grid2X2,
                  onClick: () => openPositionEditor(block),
                },
              ]
            : [];
        const removeAction = {
          id: "remove",
          type: "item",
          title: "Remove widget",
          icon: Trash2,
          variant: "destructive",
          onClick: () => confirm("remove"),
        } as const;
        const actions: DataCardActions | undefined = editable
          ? {
              draggable,
              buttons: [
                {
                  id: "edit",
                  label: "Edit widget",
                  icon: Pencil,
                  onClick: () =>
                    openEditor(
                      block.kind === "multiQuery"
                        ? {
                            kind: block.kind,
                            block,
                            initialTabId: selectedTabId,
                            onTabSaved: setSelectedTabId,
                          }
                        : { kind: block.kind, block },
                    ),
                },
                {
                  id: "duplicate",
                  label: "Duplicate widget",
                  icon: CopyPlusIcon,
                  disabled: duplicate.isPending,
                  onClick: duplicateWidget,
                },
              ],
              menu: [
                ...positionActions,
                ...(sourcePreset
                  ? [
                      {
                        id: "restore",
                        type: "item" as const,
                        title: "Restore Home card",
                        icon: RotateCcw,
                        onClick: () => confirm("restore"),
                      },
                    ]
                  : []),
                removeAction,
              ],
            }
          : canEdit && sourcePreset && !editOnly
            ? { draggable, menu: [removeAction] }
            : draggable
              ? { draggable }
              : undefined;
        const cardActions =
          editable && editOnly
            ? {
                buttons: actions?.buttons?.filter(
                  (button) => button.id === "edit",
                ),
              }
            : actions;
        return (
          <div
            className={
              sourcePreset
                ? "ph-no-capture h-full min-w-0"
                : "ph-no-capture min-w-0"
            }
            data-dashboard-block-id={block.id}
          >
            {block.kind === "markdown" ? (
              <DashboardMarkdown
                title={block.config.title}
                content={block.config.content}
                actions={cardActions}
              />
            ) : (
              <MultiQueryChart
                config={block.config}
                selectedTabId={selectedTabId}
                onSelectTab={setSelectedTabId}
                projectId={projectId}
                dateRange={dateRange}
                filterState={filterState}
                readPath={readPath}
                actions={cardActions}
              />
            )}
          </div>
        );
      }}
    </DialogController>
  );
}
