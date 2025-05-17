import { Responsive, WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { type WidgetPlacement } from "../components/DashboardWidget";
import { DashboardWidget } from "@/src/features/widgets";
import { type FilterState } from "@langfuse/shared";

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
      cols={{ lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 }}
      margin={[16, 16]}
      isDraggable={canEdit}
      isResizable={false}
      preventCollision={true} // Prevent widgets from overlapping
      onDragStop={handleLayoutChange} // Save immediately when drag stops
      onLayoutChange={handleLayoutChange}
      draggableHandle=".drag-handle"
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
