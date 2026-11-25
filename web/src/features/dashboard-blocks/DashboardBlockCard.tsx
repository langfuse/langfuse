import dynamic from "next/dynamic";
import { useState } from "react";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Grid2X2, Pencil, Trash2 } from "@langfuse/icons";
import { type SavedDashboardBlock } from "@langfuse/shared";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { type DataCardActions } from "@/src/components/design-system/DataCard/DataCard";
import { useRemoveDashboardBlock } from "./useDashboardBlockMutations";
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
  const remove = useRemoveDashboardBlock({
    projectId,
    dashboardId,
    onRemoved: () => track("remove", block.kind),
  });
  return (
    <ConfirmationDialogController
      title="Remove block?"
      text="This removes the block from this dashboard. Existing charts and their data are unchanged."
      confirmLabel="Remove"
      variant="destructive"
      disabled={!editable}
      loading={remove.isPending}
      error={
        remove.error
          ? "The block could not be removed. It may have changed elsewhere; refresh and try again."
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
              menu: [
                {
                  id: "edit",
                  type: "item",
                  title: "Edit block",
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
                ...positionActions,
                {
                  id: "remove",
                  type: "item",
                  title: "Remove block",
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
