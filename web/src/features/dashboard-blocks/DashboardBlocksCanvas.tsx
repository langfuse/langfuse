import { DashboardChartSyncProvider } from "@/src/features/dashboard/hooks/DashboardChartSyncProvider";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { ConnectedCloneDashboardDialogController } from "@/src/features/dashboard/components/ConnectedCloneDashboardDialogController";
import { openPresetInDashboardCopy } from "./homePresetNavigation";
import { type ComponentProps, type ReactNode, useState } from "react";
import { Grid2X2, Check, Pencil } from "@langfuse/icons";
import { HOME_DASHBOARD_PRESET_IDS } from "@langfuse/shared";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Button } from "@/src/components/design-system/Button/Button";
import { DashboardGrid } from "@/src/features/widgets/components/DashboardGrid";
import {
  useDashboardBlocks,
  type HomePresetDraft,
} from "./dashboard-block-context";
import { prepareDashboardBlockSections } from "./block-layout";
const DashboardBlockCard = dynamic(
  () =>
    import("./DashboardBlockCard").then((module) => module.DashboardBlockCard),
  { loading: () => <Skeleton className="h-40 w-full" /> },
);

type GridProps = ComponentProps<typeof DashboardGrid>;

export function DashboardBlocksCanvas({
  gridProps,
  dashboardName,
}: {
  gridProps: GridProps;
  dashboardName?: string;
}) {
  return (
    <DashboardChartSyncProvider>
      {gridProps.dashboardOwner === "LANGFUSE" && dashboardName ? (
        <ManagedDashboardCanvas
          gridProps={gridProps}
          dashboardName={dashboardName}
        />
      ) : (
        <DashboardBlocksCanvasContent gridProps={gridProps} />
      )}
    </DashboardChartSyncProvider>
  );
}

function ManagedDashboardCanvas({
  gridProps,
  dashboardName,
}: {
  gridProps: GridProps;
  dashboardName: string;
}) {
  const router = useRouter();
  const { projectId, dashboardId, track } = useDashboardBlocks();
  return (
    <ConnectedCloneDashboardDialogController>
      {({ openDialog }) => (
        <DashboardBlocksCanvasContent
          gridProps={gridProps}
          onClonePreset={(preset) => {
            track("preset_edit", "multiQuery", false, preset.source.presetId);
            openDialog({
              projectId,
              dashboardId,
              dashboardName,
              onOpenCopy: (copyId) =>
                openPresetInDashboardCopy(router, {
                  projectId,
                  dashboardId: copyId,
                  preset,
                  preview: {
                    dateRange: gridProps.dateRange,
                    filterState: gridProps.filterState,
                    readPath: gridProps.readPath,
                  },
                }),
            });
          }}
        />
      )}
    </ConnectedCloneDashboardDialogController>
  );
}

function DashboardBlocksCanvasContent({
  gridProps: baseGridProps,
  onClonePreset,
}: {
  gridProps: GridProps;
  onClonePreset?: (preset: HomePresetDraft) => void;
}) {
  const {
    blocks,
    blocksPending,
    savedPresetTabs,
    canEdit,
    capabilities,
    loadError,
    openEditor,
    openPositionEditor,
    placementOptions,
    track,
  } = useDashboardBlocks();
  const [layoutMode, setLayoutMode] = useState(false);
  const rowBlocks = blocks.filter(
    (block) => block.kind !== "multiQuery" || !block.sourcePreset,
  );
  const draggable =
    baseGridProps.canEdit &&
    !baseGridProps.readOnly &&
    (rowBlocks.length === 0 || layoutMode);
  const presetOverrides = new Map<string, ReactNode>();
  for (const block of blocks) {
    if (block.kind !== "multiQuery" || !block.sourcePreset) continue;
    const { placementId, presetId } = block.sourcePreset;
    if (
      baseGridProps.widgets.some(
        (w) =>
          w.type === "preset" &&
          w.id === placementId &&
          w.presetId === presetId,
      )
    )
      presetOverrides.set(
        placementId,
        <DashboardBlockCard
          key={block.id + (savedPresetTabs?.get(placementId) ?? "")}
          block={block}
          draggable={draggable}
          initialTabId={savedPresetTabs?.get(placementId)}
          editOnly={baseGridProps.readOnly}
        />,
      );
  }
  const beginPresetEdit: NonNullable<typeof baseGridProps.onEditPreset> = (
    placement,
    selection,
  ) => {
    const presetId = HOME_DASHBOARD_PRESET_IDS.find(
      (id) => id === placement.presetId,
    );
    if (!presetId) return;
    const preset = {
      source: { placementId: placement.id, presetId },
      selection,
    };
    if (canEdit) openEditor({ kind: "multiQuery", preset });
    else onClonePreset?.(preset);
  };
  const gridProps: ComponentProps<typeof DashboardGrid> = {
    ...baseGridProps,
    presetOverrides,
    onEditPreset:
      capabilities.multiQuery && !loadError && (canEdit || onClonePreset)
        ? beginPresetEdit
        : undefined,
    duplicateSurface:
      canEdit && capabilities.multiQuery ? "grid_toolbar" : "grid_menu",
  };
  if (blocksPending)
    return (
      <div role="status" aria-label="Loading dashboard layout" aria-busy="true">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (rowBlocks.length === 0)
    return (
      <>
        {loadError && (
          <p role="alert" className="text-destructive mb-3 text-sm">
            Some dashboard widgets could not be loaded. Refresh to try again.
          </p>
        )}
        <DashboardGrid {...gridProps} />
      </>
    );
  const canEditLayout = canEdit && !baseGridProps.readOnly;
  const editingLayout = canEditLayout && layoutMode;
  const sections = prepareDashboardBlockSections(gridProps.widgets, rowBlocks);
  return (
    <div className="flex flex-col gap-3">
      {loadError && (
        <p role="alert" className="text-destructive text-sm">
          Some dashboard widgets could not be refreshed.
        </p>
      )}
      {canEditLayout && (
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
            <p className="mb-2 text-sm font-medium">Widget positions</p>
            <p className="text-muted-foreground mb-3 text-xs">
              Choose where charts and Markdown appear. Move or resize grid
              widgets below.
            </p>
            <div className="flex flex-col gap-2">
              {rowBlocks.map((block) => (
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
                  {capabilities[block.kind] && placementOptions.length > 1 && (
                    <Button
                      text="Edit position"
                      icon={Pencil}
                      variant="ghost"
                      size="sm"
                      onClick={() => openPositionEditor(block)}
                    />
                  )}
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
              <DashboardBlockCard
                key={block.id}
                block={block}
                editOnly={baseGridProps.readOnly}
              />
            ))}
            {section.widgets.length > 0 && (
              <DashboardGrid
                {...gridProps}
                widgets={section.widgets}
                canEdit={false}
                onDuplicateWidget={
                  gridProps.onDuplicateWidget
                    ? (anchor, widget, surface) => {
                        const original = gridProps.widgets.find(
                          (item) => item.id === anchor.id,
                        );
                        if (original?.type === "widget")
                          gridProps.onDuplicateWidget?.(
                            original,
                            widget,
                            surface,
                          );
                      }
                    : undefined
                }
                onDuplicatePreset={
                  gridProps.onDuplicatePreset
                    ? (anchor, surface) => {
                        const original = gridProps.widgets.find(
                          (item) => item.id === anchor.id,
                        );
                        if (original?.type === "preset")
                          gridProps.onDuplicatePreset?.(original, surface);
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
