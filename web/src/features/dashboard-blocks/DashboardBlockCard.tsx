import dynamic from "next/dynamic";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Pencil, Trash2 } from "@langfuse/icons";
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
  const {
    projectId,
    dashboardId,
    canEdit,
    readPath,
    dateRange,
    filterState,
    openEditor,
    track,
  } = useDashboardBlocks();
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
      disabled={!canEdit}
      loading={remove.isPending}
      error={
        remove.error
          ? "The block could not be removed. It may have changed elsewhere; refresh and try again."
          : undefined
      }
      onConfirm={() =>
        remove
          .mutateAsync({
            projectId,
            dashboardId,
            id: block.id,
            expectedRevision: block.revision,
          })
          .then(() => undefined)
      }
    >
      {({ openDialog }) => {
        const actions: DataCardActions | undefined = canEdit
          ? {
              menu: [
                {
                  id: "edit",
                  type: "item",
                  title: "Edit block",
                  icon: Pencil,
                  onClick: () => openEditor({ kind: block.kind, block }),
                },
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
