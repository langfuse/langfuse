import { type ComponentProps } from "react";
import { type DashboardGrid } from "@/src/features/widgets/components/DashboardGrid";
import { DashboardBlocksProvider } from "./DashboardBlocksProvider";
import { DashboardBlocksCanvas } from "./DashboardBlocksCanvas";

export function DashboardBlocksHomeCanvas({
  gridProps,
}: {
  gridProps: ComponentProps<typeof DashboardGrid>;
}) {
  return (
    <DashboardBlocksProvider
      key={`${gridProps.projectId}:${gridProps.dashboardId}`}
      projectId={gridProps.projectId}
      dashboardId={gridProps.dashboardId}
      canEdit={false}
      readPath={gridProps.readPath}
      dateRange={gridProps.dateRange}
      filterState={gridProps.filterState}
      widgets={gridProps.widgets}
    >
      <DashboardBlocksCanvas gridProps={gridProps} />
    </DashboardBlocksProvider>
  );
}
