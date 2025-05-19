import { Responsive, WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { type WidgetPlacement } from "../components/DashboardWidget";
import { DashboardWidget } from "@/src/features/widgets";
import { type FilterState } from "@langfuse/shared";
import { useState, useCallback } from "react";

const ResponsiveGridLayout = WidthProvider(Responsive);

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
}: {
  widgets: WidgetPlacement[];
  onChange: (widgets: WidgetPlacement[]) => void;
  canEdit: boolean;
  dashboardId: string;
  projectId: string;
  dateRange: { from: Date; to: Date } | undefined;
  filterState: FilterState;
  onDeleteWidget: (tileId: string) => void;
  dashboardOwner: "LANGFUSE" | "PROJECT" | undefined;
}) {
  const [rowHeight, setRowHeight] = useState(150);

  const handleWidthChange = useCallback(
    (containerWidth: number) => {
      const calculatedRowHeight = ((containerWidth / 12) * 9) / 16;
      if (calculatedRowHeight !== rowHeight) {
        setRowHeight(calculatedRowHeight);
      }
    },
    [rowHeight],
  );

  // Convert WidgetPlacement to react-grid-layout format
  const layout = widgets.map((w) => ({
    i: w.id,
    x: w.x,
    y: w.y,
    w: w.x_size,
    h: w.y_size,
    isDraggable: canEdit,
  }));

  const handleLayoutChange = (newLayout: any[]) => {
    if (!canEdit) return;

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

  return (
    <ResponsiveGridLayout
      className="layout"
      layouts={{ lg: layout }}
      cols={{ lg: 12, md: 12, sm: 12, xs: 12, xxs: 12 }}
      margin={[16, 16]}
      rowHeight={rowHeight}
      isDraggable={canEdit}
      isResizable={canEdit}
      onDragStop={handleLayoutChange} // Save immediately when drag stops
      onResizeStop={handleLayoutChange} // Save immediately when resize stops
      onWidthChange={handleWidthChange}
      draggableHandle=".drag-handle"
      useCSSTransforms
    >
      {widgets.map((widget) => (
        <div key={widget.id} className="max-h-full max-w-full">
          <DashboardWidget
            dashboardId={dashboardId}
            projectId={projectId}
            placement={widget}
            dateRange={dateRange}
            filterState={filterState}
            onDeleteWidget={onDeleteWidget}
            dashboardOwner={dashboardOwner || "PROJECT"}
          />
        </div>
      ))}
    </ResponsiveGridLayout>
  );
}
