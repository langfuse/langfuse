import dynamic from "next/dynamic";
import { type ComponentProps, useState } from "react";
import { Grid2X2, Check, Pencil } from "@langfuse/icons";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Button } from "@/src/components/design-system/Button/Button";
import { DashboardGrid } from "@/src/features/widgets/components/DashboardGrid";
import { useDashboardBlocks } from "./dashboard-block-context";
import { prepareDashboardBlockSections } from "./block-layout";
const DashboardBlockCard = dynamic(
  () =>
    import("./DashboardBlockCard").then((module) => module.DashboardBlockCard),
  { loading: () => <Skeleton className="h-40 w-full" /> },
);

export function DashboardBlocksCanvas({
  gridProps,
}: {
  gridProps: ComponentProps<typeof DashboardGrid>;
}) {
  const {
    blocks,
    blocksPending,
    canEdit,
    loadError,
    openEditor,
    placementOptions,
    track,
  } = useDashboardBlocks();
  const [layoutMode, setLayoutMode] = useState(false);
  if (blocksPending)
    return (
      <div role="status" aria-label="Loading dashboard layout" aria-busy="true">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (blocks.length === 0)
    return (
      <>
        {loadError && (
          <p role="alert" className="text-destructive mb-3 text-sm">
            Additional dashboard blocks could not be loaded. Refresh to try
            again.
          </p>
        )}
        <DashboardGrid {...gridProps} />
      </>
    );
  const editingLayout = canEdit && layoutMode;
  const sections = prepareDashboardBlockSections(gridProps.widgets, blocks);
  return (
    <div className="flex flex-col gap-3">
      {loadError && (
        <p role="alert" className="text-destructive text-sm">
          Additional dashboard blocks could not be refreshed.
        </p>
      )}
      {canEdit && (
        <div className="flex justify-end">
          <Button
            text={editingLayout ? "Done editing layout" : "Edit layout"}
            icon={editingLayout ? Check : Grid2X2}
            variant="outline"
            onClick={() => {
              track(editingLayout ? "layout_close" : "layout_open");
              setLayoutMode(!editingLayout);
            }}
          />
        </div>
      )}
      {editingLayout ? (
        <>
          <div className="bg-muted/20 rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium">Block positions</p>
            <p className="text-muted-foreground mb-3 text-xs">
              Move and resize existing widgets below. Each saved block stays
              before its selected chart row.
            </p>
            <div className="flex flex-col gap-2">
              {blocks.map((block) => (
                <div
                  key={block.id}
                  className="ph-no-capture bg-background flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {block.config.title || "Markdown"}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {placementOptions.find(
                        (option) => option.value === block.beforePlacementId,
                      )?.label ?? "After all chart rows"}
                    </p>
                  </div>
                  <Button
                    text="Edit position"
                    icon={Pencil}
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      track("placement", block.kind);
                      openEditor({ kind: block.kind, block });
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
          <DashboardGrid {...gridProps} />
        </>
      ) : (
        sections.map((section) => (
          <div key={section.key} className="flex min-w-0 flex-col gap-3">
            {section.blocks.map((block) => (
              <DashboardBlockCard key={block.id} block={block} />
            ))}
            {section.widgets.length > 0 && (
              <DashboardGrid
                {...gridProps}
                widgets={section.widgets}
                canEdit={false}
                onDuplicateWidget={
                  gridProps.onDuplicateWidget
                    ? (anchor, widget) => {
                        const original = gridProps.widgets.find(
                          (item) => item.id === anchor.id,
                        );
                        if (original?.type === "widget")
                          gridProps.onDuplicateWidget?.(original, widget);
                      }
                    : undefined
                }
                onDuplicatePreset={
                  gridProps.onDuplicatePreset
                    ? (anchor) => {
                        const original = gridProps.widgets.find(
                          (item) => item.id === anchor.id,
                        );
                        if (original?.type === "preset")
                          gridProps.onDuplicatePreset?.(original);
                      }
                    : undefined
                }
              />
            )}
          </div>
        ))
      )}
    </div>
  );
}
