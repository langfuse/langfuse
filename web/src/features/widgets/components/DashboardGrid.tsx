import { Responsive } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { type WidgetPlacement } from "../components/DashboardWidget";
import { type WidgetExportSource } from "@/src/features/widgets/utils/import-export-utils";
import {
  PresetDashboardWidget,
  type PresetPlacement,
} from "../components/PresetDashboardWidget";
import { DashboardWidget } from "@/src/features/widgets";
import { type FilterState } from "@langfuse/shared";
import { useState, useEffect, useRef } from "react";

export type DashboardPlacement = WidgetPlacement | PresetPlacement;

/**
 * Container width, measured once immediately and then with a trailing
 * debounce. WidthProvider re-renders the whole grid (and every chart in it)
 * on each resize frame; measuring ourselves keeps continuous window resizes
 * from burning CPU — the layout snaps once, when the resize settles.
 */
function useDebouncedContainerWidth(delayMs: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    setWidth(element.getBoundingClientRect().width);

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        setWidth(element.getBoundingClientRect().width);
      }, delayMs);
    });
    observer.observe(element);

    return () => {
      clearTimeout(timeout);
      observer.disconnect();
    };
  }, [delayMs]);

  return { containerRef, width };
}

// Hook to detect screen size
function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }
    const listener = () => setMatches(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return matches;
}

export function DashboardGrid({
  widgets,
  onChange,
  canEdit,
  dashboardId,
  projectId,
  dateRange,
  filterState,
  onDeleteWidget,
  dashboardOwner,
  getWidgetSchedulerId,
  onLockedEditAttempt,
  readOnly,
  onPasteWidget,
  onDuplicateWidget,
  onDuplicatePreset,
}: {
  widgets: DashboardPlacement[];
  onChange: (widgets: DashboardPlacement[]) => void;
  canEdit: boolean;
  dashboardId: string;
  projectId: string;
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
  /** Paste the clipboard widget/card next to a tile (editable dashboards only). */
  onPasteWidget?: (anchor: DashboardPlacement) => void;
  /** Duplicate a tile's widget next to it (editable dashboards only). */
  onDuplicateWidget?: (
    anchor: WidgetPlacement,
    widget: WidgetExportSource,
  ) => void;
  /** Duplicate a preset card next to it (editable dashboards only). */
  onDuplicatePreset?: (anchor: PresetPlacement) => void;
}) {
  const { containerRef, width } = useDebouncedContainerWidth(200);
  // Rows stay 16:9-proportional to column width, with a floor so tiles keep a
  // usable height on narrow screens — below the floor, widget content (chart
  // floors, table rows) no longer fits and tiles scroll internally; the grid
  // grows vertically instead. (LFE-10813)
  const MIN_ROW_HEIGHT = 58;
  const rowHeight =
    width !== null ? Math.max(MIN_ROW_HEIGHT, ((width / 12) * 9) / 16) : 150;

  // Detect if screen is medium or smaller (below 1024px). Exact complement of
  // Tailwind's `lg:` breakpoint: widget content uses `lg:` variants for its
  // grid-mode sizing (e.g. smaller chart flex bases that rely on grow), so the
  // stacked layout must never overlap them. (LFE-10813)
  const isSmallScreen = useMediaQuery("(max-width: 1023.98px)");

  // Convert WidgetPlacement to react-grid-layout format
  const layout = widgets.map((w) => ({
    i: w.id,
    x: w.x,
    y: w.y,
    w: w.x_size,
    h: w.y_size,
    isDraggable: canEdit && !isSmallScreen, // Disable dragging on small screens
    minW: 2,
    minH: 2,
  }));

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
        projectId={projectId}
        placement={widget}
        dateRange={dateRange}
        filterState={filterState}
        onDeleteWidget={onDeleteWidget}
        dashboardOwner={dashboardOwner || "PROJECT"}
        schedulerId={getWidgetSchedulerId?.(widget.id)}
        onLockedEditAttempt={onLockedEditAttempt}
        readOnly={readOnly}
        onPasteWidget={onPasteWidget}
        onDuplicatePreset={onDuplicatePreset}
      />
    ) : (
      <DashboardWidget
        dashboardId={dashboardId}
        projectId={projectId}
        placement={widget}
        dateRange={dateRange}
        filterState={filterState}
        onDeleteWidget={onDeleteWidget}
        dashboardOwner={dashboardOwner || "PROJECT"}
        schedulerId={getWidgetSchedulerId?.(widget.id)}
        onLockedEditAttempt={onLockedEditAttempt}
        readOnly={readOnly}
        onPasteWidget={onPasteWidget}
        onDuplicateWidget={onDuplicateWidget}
      />
    );

  // Render flex layout for small screens
  if (isSmallScreen) {
    return (
      <div className="flex w-full flex-col gap-4">
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

  // Render grid layout for larger screens
  return (
    <div ref={containerRef}>
      {width !== null && (
        <Responsive
          className="layout"
          width={width}
          layouts={{ lg: layout }}
          cols={{ lg: 12, md: 12, sm: 12, xs: 12, xxs: 12 }}
          margin={[16, 16]}
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
