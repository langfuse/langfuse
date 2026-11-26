import { DashboardChartSyncProvider } from "@/src/features/dashboard/hooks/DashboardChartSyncProvider";
import { useRouter } from "next/router";
import { ConnectedCloneDashboardDialogController } from "@/src/features/dashboard/components/ConnectedCloneDashboardDialogController";
import { openPresetInDashboardCopy } from "./homePresetNavigation";
import { type ComponentProps } from "react";
import { HOME_DASHBOARD_PRESET_IDS } from "@langfuse/shared";
import { DashboardGrid } from "@/src/features/widgets/components/DashboardGrid";
import {
  useDashboardBlocks,
  type HomePresetDraft,
} from "./dashboard-block-context";
type GridProps = ComponentProps<typeof DashboardGrid>;

export function DashboardWidgetsGrid({
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
        <DashboardWidgetsGridContent gridProps={gridProps} />
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
        <DashboardWidgetsGridContent
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

function DashboardWidgetsGridContent({
  gridProps,
  onClonePreset,
}: {
  gridProps: GridProps;
  onClonePreset?: (preset: HomePresetDraft) => void;
}) {
  const { canEdit, capabilities, openEditor } = useDashboardBlocks();
  const beginPresetEdit: NonNullable<GridProps["onEditPreset"]> = (
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
  return (
    <DashboardGrid
      {...gridProps}
      onEditPreset={
        capabilities.multiQuery && (canEdit || onClonePreset)
          ? beginPresetEdit
          : undefined
      }
      duplicateSurface={
        canEdit && capabilities.multiQuery ? "grid_toolbar" : "grid_menu"
      }
    />
  );
}
