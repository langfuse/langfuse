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
  // Each grid unit should correspond to 100px.
  // We keep the row height fixed at 100px and dynamically compute the number
  // of columns based on the container width so that each column is ~100px.
  const [cols, setCols] = useState(12);

  // callback from react-grid-layout that gives us the current container width
  const handleWidthChange = useCallback(
    (containerWidth: number) => {
      const calculatedCols = Math.max(1, Math.floor(containerWidth / 100));
      if (calculatedCols !== cols) {
        setCols(calculatedCols);
      }
    },
    [cols],
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
      cols={{ lg: cols, md: cols, sm: cols, xs: cols, xxs: cols }}
      margin={[16, 16]}
      rowHeight={200}
      isDraggable={canEdit}
      isResizable={false}
      onDragStop={handleLayoutChange} // Save immediately when drag stops
      onWidthChange={handleWidthChange}
      draggableHandle=".drag-handle"
      useCSSTransforms
    >
      {widgets.map((widget) => (
        <div key={widget.id}>
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
