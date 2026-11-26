import { Responsive } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import {
  DashboardWidget,
  type WidgetPlacement,
} from "@/src/features/widgets/components/DashboardWidget";
import { type WidgetExportSource } from "@/src/features/widgets/utils/import-export-utils";
import {
  PresetDashboardWidget,
  type PresetPlacement,
} from "../components/PresetDashboardWidget";
import type { ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import { type FilterState } from "@langfuse/shared";
import { useState, useEffect, useLayoutEffect, useCallback } from "react";
import { flushSync } from "react-dom";
import { reduceWidthSample } from "@/src/features/widgets/dashboardGridWidth";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";

export type DashboardPlacement = WidgetPlacement | PresetPlacement;

function useDebouncedContainerWidth(delayMs: number) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!element) return;

    let phase: "quiet" | "pending" = "quiet";
    let committed: number | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const publish = (next: number, sync: boolean) => {
      if (next <= 0 || next === committed) return;
      committed = next;
      const apply = () => setWidth(next);
      if (sync) flushSync(apply);
      else apply();
    };

    const onSample = (sync: boolean) => {
      const next = Math.round(element.clientWidth);
      const decision = reduceWidthSample(phase, next, committed);
      phase = decision.phase;
      if (decision.publish !== null) publish(decision.publish, sync);
      if (!decision.armTimer) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        phase = "quiet";
        publish(Math.round(element.clientWidth), false);
      }, delayMs);
    };

    onSample(false);
    const observer = new ResizeObserver(() => onSample(true));
    observer.observe(element);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [element, delayMs]);

  return { ref: setElement, width };
}

// Hook to detect screen size
function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const syncMatches = () => setMatches(media.matches);
    syncMatches();
    media.addEventListener("change", syncMatches);
    return () => media.removeEventListener("change", syncMatches);
  }, [query]);

  return matches;
}

export function DashboardGrid({
  widgets,
  onChange,
  canEdit,
  dashboardId,
  projectId,
  readPath,
  dateRange,
  filterState,
  onDeleteWidget,
  dashboardOwner,
  getWidgetSchedulerId,
  onLockedEditAttempt,
  readOnly,
  onDuplicateWidget,
  onDuplicatePreset,
}: {
  widgets: DashboardPlacement[];
  onChange: (widgets: DashboardPlacement[]) => void;
  canEdit: boolean;
  dashboardId: string;
  projectId: string;
  /** Resolved by the page controller — widgets must not guess the version. */
  readPath: ResolvedReadPath;
  dateRange: { from: Date; to: Date } | undefined;
  filterState: FilterState;
  onDeleteWidget: (tileId: string) => void;
  dashboardOwner: "LANGFUSE" | "PROJECT" | undefined;
  getWidgetSchedulerId?: (widgetPlacementId: string) => string;
  /**
   * Present on Langfuse-managed (read-only) dashboards: tiles keep their edit
   * affordances and route edit attempts here (clone-first flow). Layout
   * changes still arrive via onChange — the caller decides whether to persist
   * or route them through the same flow.
   */
  onLockedEditAttempt?: () => void;
  /** Pure viewing surface (e.g. Home): tiles render no edit affordances. */
  readOnly?: boolean;
  /** Clone a tile's widget next to it (editable dashboards only). */
  onDuplicateWidget?: (
    anchor: WidgetPlacement,
    widget: WidgetExportSource,
  ) => void;
  /** Duplicate a preset card next to it (editable dashboards only). */
  onDuplicatePreset?: (anchor: PresetPlacement) => void;
}) {
  const [activeChartKey, setActiveChartKey] = useState<string>();
  const chartSync: ChartProps["sync"] = {
    activeKey: activeChartKey,
    onActiveKeyChange: setActiveChartKey,
  };
  const [contentHeights, setContentHeights] = useState<Record<string, number>>(
    {},
  );
  const handleContentHeightChange = useCallback(
    (placementId: string, height: number) => {
      setContentHeights((current) => {
        if (current[placementId] === height) return current;
        return { ...current, [placementId]: height };
      });
    },
    [],
  );
  // Rows stay 16:9-proportional to column width, with a floor so tiles keep a
  // usable height on narrow screens — below the floor, widget content (chart
  // floors, table rows) no longer fits and tiles scroll internally; the grid
  // grows vertically instead. (LFE-10813)
  const MIN_ROW_HEIGHT = 58;
  // Matches the page padding (p-3) around the grid.
  const GRID_GAP = 12;
  const { ref: containerRef, width } = useDebouncedContainerWidth(200);
  const rowHeight =
    width !== null ? Math.max(MIN_ROW_HEIGHT, ((width / 12) * 9) / 16) : 150;

  // Detect if screen is medium or smaller (below 1024px). Exact complement of
  // Tailwind's `lg:` breakpoint: widget content uses `lg:` variants for its
  // grid-mode sizing (e.g. smaller chart flex bases that rely on grow), so the
  // stacked layout must never overlap them. (LFE-10813)
  const isSmallScreen = useMediaQuery("(max-width: 1023.98px)");

  const layout = widgets.map((w) => {
    const contentHeight = contentHeights[w.id];
    const contentRows = contentHeight
      ? Math.ceil((contentHeight + GRID_GAP) / (rowHeight + GRID_GAP))
      : 0;

    return {
      i: w.id,
      x: w.x,
      y: w.y,
      w: w.x_size,
      h:
        w.type === "preset" && w.presetId === "home-score-analytics"
          ? Math.max(w.y_size, contentRows)
          : w.y_size,
      isDraggable: canEdit && !isSmallScreen,
      minW: 2,
      minH: 2,
    };
  });

  const handleLayoutChange = (newLayout: any[]) => {
    // Safety checks: prevent layout changes on small screens and when editing is disabled
    // This prevents unintended saves during responsive transitions or on mobile devices
    if (!canEdit || isSmallScreen) return;

    // Additional safety: ensure the layout change is meaningful
    if (!newLayout || newLayout.length === 0) return;

    // Update widget positions based on the new layout
    const updatedWidgets = widgets.map((w) => {
      const layoutItem = newLayout.find((item) => item.i === w.id);
      if (!layoutItem) return w;

      return {
        ...w,
        x: layoutItem.x,
        y: layoutItem.y,
        x_size: layoutItem.w,
        y_size: layoutItem.h,
      };
    });

    onChange(updatedWidgets);
  };

  // Dispatch a placement to its renderer: "preset" placements render a
  // registered curated component; "widget" placements render the generic
  // query-backed widget.
  const renderPlacement = (widget: DashboardPlacement) =>
    widget.type === "preset" ? (
      <PresetDashboardWidget
        dashboardId={dashboardId}
        chartSync={chartSync}
        projectId={projectId}
        readPath={readPath}
        placement={widget}
        dateRange={dateRange}
        filterState={filterState}
        onDeleteWidget={onDeleteWidget}
        dashboardOwner={dashboardOwner || "PROJECT"}
        schedulerId={getWidgetSchedulerId?.(widget.id)}
        onLockedEditAttempt={onLockedEditAttempt}
        readOnly={readOnly}
        onDuplicatePreset={onDuplicatePreset}
        heightBehavior={
          widget.presetId === "home-score-analytics"
            ? {
                mode: "content",
                onHeightChange: handleContentHeightChange,
              }
            : { mode: "fixed" }
        }
      />
    ) : (
      <DashboardWidget
        dashboardId={dashboardId}
        chartSync={chartSync}
        projectId={projectId}
        readPath={readPath}
        placement={widget}
        dateRange={dateRange}
        filterState={filterState}
        onDeleteWidget={onDeleteWidget}
        dashboardOwner={dashboardOwner || "PROJECT"}
        schedulerId={getWidgetSchedulerId?.(widget.id)}
        onLockedEditAttempt={onLockedEditAttempt}
        readOnly={readOnly}
        onDuplicateWidget={onDuplicateWidget}
      />
    );

  // Render flex layout for small screens
  if (isSmallScreen) {
    return (
      <div className="flex w-full flex-col gap-3">
        {widgets
          .slice()
          .sort((a, b) => a.y - b.y || a.x - b.x) // Sort by position for consistent order
          .map((widget) => (
            <div
              key={widget.id}
              data-placement-id={widget.id}
              className="w-full"
              // Fixed height for query widgets (their charts fill whatever
              // space they get); presets size to their content like the
              // stacked bespoke Home did.
              style={{
                height: widget.type === "preset" ? "auto" : "300px",
              }}
            >
              {renderPlacement(widget)}
            </div>
          ))}
      </div>
    );
  }

  // Desktop grid. Small screens render the stacked layout above.
  return (
    <div ref={containerRef} className="w-full min-w-0">
      {width !== null && (
        <Responsive
          className="layout"
          width={width}
          layouts={{ lg: layout }}
          cols={{ lg: 12, md: 12, sm: 12, xs: 12, xxs: 12 }}
          margin={[GRID_GAP, GRID_GAP]}
          containerPadding={[0, 0]}
          rowHeight={rowHeight}
          isDraggable={canEdit}
          isResizable={canEdit}
          onDragStop={handleLayoutChange} // Save immediately when drag stops
          onResizeStop={handleLayoutChange} // Save immediately when resize stops
          draggableHandle=".drag-handle"
          useCSSTransforms
        >
          {widgets.map((widget) => (
            <div
              key={widget.id}
              data-placement-id={widget.id}
              className="max-h-full max-w-full"
            >
              {renderPlacement(widget)}
            </div>
          ))}
        </Responsive>
      )}
    </div>
  );
}
