import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { useHasProjectAccess } from "@/src/features/rbac";
import { useEffect, useMemo, useRef } from "react";
import {
  CopyIcon,
  CopyPlusIcon,
  GripVerticalIcon,
  MoreVerticalIcon,
  TrashIcon,
} from "lucide-react";
import { type FilterState } from "@langfuse/shared";
import { type ViewVersion } from "@langfuse/shared/query";
import type { ResolvedReadPath } from "@/src/features/events";
import { findClosestDashboardInterval } from "@/src/utils/date-range-utils";
import {
  getHomePreset,
  type PresetWidgetContext,
} from "@/src/features/dashboard/components/home-preset-registry";
import { buildPresetExport } from "@/src/features/dashboard/utils/dashboard-import-export";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";

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
  chartSync,
  readPath,
  placement,
  dateRange,
  filterState,
  onDeleteWidget,
  dashboardOwner,
  schedulerId,
  onLockedEditAttempt,
  readOnly,
  onDuplicatePreset,
  heightBehavior,
}: {
  projectId: string;
  dashboardId: string;
  chartSync: {
    activeKey: string | undefined;
    onActiveKeyChange: (key: string | undefined) => void;
  };
  /** Resolved by the page controller — the card must not guess the version. */
  readPath: ResolvedReadPath;
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
   * Adds another placement of this preset card next to this tile (clone).
   * Passed only on editable (non-locked) dashboards.
   */
  onDuplicatePreset?: (anchor: PresetPlacement) => void;
  heightBehavior:
    | { mode: "fixed" }
    | {
        mode: "content";
        onHeightChange: (placementId: string, height: number) => void;
      };
}) {
  const metricsVersion: ViewVersion = readPath === "v4" ? "v2" : "v1";

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
  const contentRef = useRef<HTMLDivElement>(null);
  const onHeightChange =
    heightBehavior.mode === "content"
      ? heightBehavior.onHeightChange
      : undefined;

  useEffect(() => {
    if (!onHeightChange) return;

    const element = contentRef.current;
    if (!element) return;

    const reportHeight = () => {
      onHeightChange(
        placement.id,
        Math.max(element.getBoundingClientRect().height, element.scrollHeight),
      );
    };
    const resizeObserver = new ResizeObserver(reportHeight);
    const mutationObserver = new MutationObserver(reportHeight);
    resizeObserver.observe(element);
    mutationObserver.observe(element, { childList: true, subtree: true });
    reportHeight();

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [onHeightChange, placement.id]);

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
      sync: chartSync,
      // Fixed presets need a definite height so their flex children can grow.
      // Score Analytics is measured because each selected score adds a row.
      className: heightBehavior.mode === "content" ? "min-h-full" : "h-full",
    };
  }, [
    dashboardId,
    chartSync,
    dateRange,
    filterState,
    heightBehavior.mode,
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
      showSuccessToast({
        title: "Card copied",
        description: "Paste it on any dashboard with Cmd/Ctrl+V.",
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
    <div
      className={`group relative w-full ${heightBehavior.mode === "content" ? "" : "h-full"}`}
    >
      <div
        ref={contentRef}
        className={
          heightBehavior.mode === "content"
            ? "w-full"
            : "h-full w-full overflow-y-auto"
        }
      >
        {renderPreset(ctx)}
      </div>
      {/* The menu (copy) stays available on read-only surfaces like Home —
          only the edit affordances (drag, delete) are gated. */}
      <div className="bg-background/95 absolute top-2 right-2 z-10 hidden items-center gap-2 rounded-md border px-1.5 py-1 shadow-sm group-hover:flex has-aria-expanded:flex">
        {!readOnly && (hasCUDAccess || isLockedEditable) && (
          <GripVerticalIcon
            size={16}
            className="drag-handle text-muted-foreground hover:text-foreground hidden cursor-grab active:cursor-grabbing lg:block"
          />
        )}
        <DropdownMenu
          placement="bottom-end"
          items={[
            {
              type: "item",
              id: "copy",
              title: "Copy card",
              icon: CopyIcon,
              onClick: handleCopyToClipboard,
            },
            ...(onDuplicatePreset
              ? [
                  {
                    type: "item" as const,
                    id: "clone",
                    title: "Clone",
                    icon: CopyPlusIcon,
                    onClick: () => onDuplicatePreset(placement),
                  },
                ]
              : []),
            ...(!readOnly && (hasCUDAccess || isLockedEditable)
              ? [
                  { id: "delete-separator", type: "separator" as const },
                  {
                    type: "item" as const,
                    id: "delete",
                    title: "Delete",
                    icon: TrashIcon,
                    variant: "destructive" as const,
                    onClick: handleDelete,
                  },
                ]
              : []),
          ]}
        >
          {({ getTriggerProps }) => (
            <button
              className="text-muted-foreground hover:text-foreground"
              aria-label="Widget actions"
              {...getTriggerProps()}
            >
              <MoreVerticalIcon size={16} />
            </button>
          )}
        </DropdownMenu>
      </div>
    </div>
  );
}
