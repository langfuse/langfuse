import dynamic from "next/dynamic";
import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Skeleton } from "@/src/components/ui/skeleton";
import { CopyPlusIcon, Grid2X2, Pencil, Trash2 } from "@langfuse/icons";
import { type SavedDashboardBlock } from "@langfuse/shared";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { type DataCardActions } from "@/src/components/design-system/DataCard/DataCard";
import {
  useRemoveDashboardBlock,
  useSaveDashboardBlock,
} from "./useDashboardBlockMutations";
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

export function DashboardBlockCard({ block }: { block: SavedDashboardBlock }) {
  const [selectedTabId, setSelectedTabId] = useState<string>();
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
          beforePlacementId: block.beforePlacementId,
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
  const remove = useRemoveDashboardBlock({
    projectId,
    dashboardId,
    onRemoved: () => track("remove", block.kind),
  });
  return (
    <ConfirmationDialogController
      title="Remove widget?"
      text="The widget will be removed from this dashboard."
      confirmLabel="Remove"
      variant="destructive"
      disabled={!editable}
      loading={remove.isPending}
      error={
        remove.error
          ? "Could not remove the widget. Refresh and try again."
          : undefined
      }
      onConfirm={() => {
        if (!editable) return;
        return remove
          .mutateAsync({
            projectId,
            dashboardId,
            blockPatch: {
              op: "remove",
              id: block.id,
              expectedRevision: block.revision,
            },
          })
          .then(() => undefined);
      }}
    >
      {({ openDialog }) => {
        const positionActions: NonNullable<DataCardActions["menu"]> =
          placementOptions.length > 1
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
        const actions: DataCardActions | undefined = editable
          ? {
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
                {
                  id: "remove",
                  type: "item",
                  title: "Remove widget",
                  icon: Trash2,
                  variant: "destructive",
                  onClick: openDialog,
                },
              ],
            }
          : undefined;
        return (
          <div
            className="ph-no-capture min-w-0"
            data-dashboard-block-id={block.id}
          >
            {block.kind === "markdown" ? (
              <DashboardMarkdown
                title={block.config.title}
                content={block.config.content}
                actions={actions}
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
                actions={actions}
              />
            )}
          </div>
        );
      }}
    </ConfirmationDialogController>
  );
}
