import { useMemo } from "react";
import { GripVerticalIcon, TrashIcon } from "lucide-react";
import { type FilterState } from "@langfuse/shared";
import { type ViewVersion } from "@langfuse/shared/query";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { findClosestDashboardInterval } from "@/src/utils/date-range-utils";
import {
  getHomePreset,
  type PresetWidgetContext,
} from "@/src/features/dashboard/components/home-preset-registry";

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
      {!readOnly && (hasCUDAccess || isLockedEditable) && (
        <div className="bg-background/95 absolute top-2 right-2 z-10 hidden items-center gap-2 rounded-md border px-1.5 py-1 shadow-sm group-hover:flex">
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
        </div>
      )}
    </div>
  );
}
