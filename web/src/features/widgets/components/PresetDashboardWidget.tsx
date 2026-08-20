import { useCallback, useMemo, useState } from "react";
import {
  ClipboardPasteIcon,
  CopyIcon,
  CopyPlusIcon,
  GripVerticalIcon,
  MoreVerticalIcon,
  TrashIcon,
} from "lucide-react";
import { type FilterState } from "@langfuse/shared";
import { type ViewVersion } from "@langfuse/shared/query";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { findClosestDashboardInterval } from "@/src/utils/date-range-utils";
import {
  getHomePreset,
  type PresetWidgetContext,
} from "@/src/features/dashboard/components/home-preset-registry";
import {
  buildPresetExport,
  isPasteablePlacementPayload,
} from "@/src/features/dashboard/utils/dashboard-import-export";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useClipboardWidgetProbe } from "@/src/features/widgets/hooks/useClipboardWidgetProbe";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";

/**
 * A "preset" dashboard placement: renders a registered curated component by
 * presetId (with its own chrome and data fetches) instead of a
 * DashboardWidget row + executeQuery. See the preset registry.
 */
export interface PresetPlacement {
  id: string;
  presetId: string;
  x: number;
  y: number;
  x_size: number;
  y_size: number;
  type: "preset";
}

export function PresetDashboardWidget({
  projectId,
  dashboardId,
  placement,
  dateRange,
  filterState,
  onDeleteWidget,
  dashboardOwner,
  schedulerId,
  onLockedEditAttempt,
  readOnly,
  onPasteWidget,
  onDuplicatePreset,
}: {
  projectId: string;
  dashboardId: string;
  placement: PresetPlacement;
  dateRange: { from: Date; to: Date } | undefined;
  filterState: FilterState;
  onDeleteWidget: (tileId: string) => void;
  dashboardOwner: "LANGFUSE" | "PROJECT";
  schedulerId?: string;
  /**
   * Present on Langfuse-managed (read-only) dashboards: edit affordances stay
   * visible and any edit attempt routes here (clone-first flow) instead of
   * mutating.
   */
  onLockedEditAttempt?: () => void;
  /** Pure viewing surface (e.g. Home): render no edit affordances. */
  readOnly?: boolean;
  /**
   * Pastes the clipboard widget/card next to this tile. Passed only on
   * editable (non-locked) dashboards.
   */
  onPasteWidget?: (anchor: PresetPlacement) => void;
  /**
   * Adds another placement of this preset card next to this tile. Passed
   * only on editable (non-locked) dashboards.
   */
  onDuplicatePreset?: (anchor: PresetPlacement) => void;
}) {
  const { isBetaEnabled } = useV4Beta();
  const metricsVersion: ViewVersion = isBetaEnabled ? "v2" : "v1";

  // Presets on project-owned dashboards (e.g. a clone of the curated Home)
  // can be moved/removed, but their content stays fixed until extended into a
  // configurable widget. On Langfuse-owned dashboards the same affordances
  // show, routing through the clone-first flow.
  const hasRbacCUDAccess = useHasProjectAccess({
    projectId,
    scope: "dashboards:CUD",
  });
  const hasCUDAccess = hasRbacCUDAccess && dashboardOwner !== "LANGFUSE";
  const isLockedEditable =
    hasRbacCUDAccess &&
    dashboardOwner === "LANGFUSE" &&
    Boolean(onLockedEditAttempt);

  const renderPreset = getHomePreset(placement.presetId);

  const ctx: PresetWidgetContext = useMemo(() => {
    const fromTimestamp = dateRange
      ? dateRange.from
      : new Date(new Date().getTime() - 1000);
    const toTimestamp = dateRange ? dateRange.to : new Date();
    const timeFilter: FilterState = [
      {
        type: "datetime",
        column: "startTime",
        operator: ">",
        value: fromTimestamp,
      },
      {
        type: "datetime",
        column: "startTime",
        operator: "<",
        value: toTimestamp,
      },
    ];

    return {
      projectId,
      globalFilterState: filterState,
      mergedFilterState: [...filterState, ...timeFilter],
      fromTimestamp,
      toTimestamp,
      agg:
        findClosestDashboardInterval({
          from: fromTimestamp,
          to: toTimestamp,
        }) ?? "last7Days",
      isLoading: false,
      metricsVersion,
      schedulerId,
      syncId: dashboardId,
      // Stretch to the tile; when the card's intrinsic content is taller
      // (fixed chart min-heights, expanded tables) the wrapper scrolls
      // instead of clipping.
      className: "min-h-full",
    };
  }, [
    dashboardId,
    dateRange,
    filterState,
    metricsVersion,
    projectId,
    schedulerId,
  ]);

  const handleDelete = () => {
    if (isLockedEditable) {
      // The clone-first dialog is the confirmation on locked dashboards.
      onDeleteWidget(placement.id);
      return;
    }
    if (confirm("Please confirm deletion")) {
      onDeleteWidget(placement.id);
    }
  };

  const capture = usePostHogClientCapture();
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  // Gate "Paste to the right" on the clipboard actually holding a pasteable
  // payload, where the browser lets us check silently.
  const isPasteablePayload = useCallback(
    (text: string) => isPasteablePlacementPayload(text, { isBetaEnabled }),
    [isBetaEnabled],
  );
  const clipboardProbe = useClipboardWidgetProbe(
    isActionsMenuOpen && Boolean(onPasteWidget),
    isPasteablePayload,
  );

  const handleCopyToClipboard = async () => {
    try {
      await copyTextToClipboard(
        JSON.stringify(buildPresetExport(placement.presetId), null, 2),
      );
      capture("dashboard:widget_copied_to_clipboard", {
        surface: "grid_menu",
        kind: "preset",
        preset_id: placement.presetId,
        dashboard_id: dashboardId,
      });
    } catch {
      showErrorToast("Copy failed", "Could not write to the clipboard.");
    }
  };

  if (!renderPreset) {
    return (
      <div className="bg-background flex h-full items-center justify-center rounded-lg border p-4">
        <div className="text-muted-foreground">
          Unknown preset: {placement.presetId}
        </div>
      </div>
    );
  }

  return (
    <div className="group relative h-full w-full">
      <div className="h-full w-full overflow-y-auto">{renderPreset(ctx)}</div>
      {/* The menu (copy) stays available on read-only surfaces like Home —
          only the edit affordances (drag, delete) are gated. */}
      <div className="bg-background/95 absolute top-2 right-2 z-10 hidden items-center gap-2 rounded-md border px-1.5 py-1 shadow-sm group-hover:flex has-data-[state=open]:flex">
        {!readOnly && (hasCUDAccess || isLockedEditable) && (
          <>
            <GripVerticalIcon
              size={16}
              className="drag-handle text-muted-foreground hover:text-foreground hidden cursor-grab active:cursor-grabbing lg:block"
            />
            <button
              onClick={handleDelete}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Delete widget"
            >
              <TrashIcon size={16} />
            </button>
          </>
        )}
        <DropdownMenu onOpenChange={setIsActionsMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className="text-muted-foreground hover:text-foreground"
              aria-label="Widget actions"
            >
              <MoreVerticalIcon size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleCopyToClipboard}>
              <CopyIcon className="mr-2 h-4 w-4" />
              Copy to clipboard
            </DropdownMenuItem>
            {onPasteWidget && (
              <DropdownMenuItem
                disabled={clipboardProbe === "no-widget"}
                onClick={() => onPasteWidget(placement)}
              >
                <ClipboardPasteIcon className="mr-2 h-4 w-4" />
                Paste to the right
              </DropdownMenuItem>
            )}
            {onDuplicatePreset && (
              <DropdownMenuItem onClick={() => onDuplicatePreset(placement)}>
                <CopyPlusIcon className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
