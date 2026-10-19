import EventsTable from "@/src/features/events/components/EventsTable";
import { TableHeaderControls } from "@/src/components/table/table-header-controls";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";

export function SkillLinkedTraces({
  projectId,
  name,
  version,
}: {
  projectId: string;
  name: string;
  version?: number;
}) {
  const { timeRange, setTimeRange } = useTableDateRange(projectId);

  return (
    <div className="-mt-px flex min-h-0 flex-1 flex-col overflow-hidden">
      <TableHeaderControls timeRange={timeRange} setTimeRange={setTimeRange} />
      <EventsTable
        projectId={projectId}
        skill={{ name, version }}
        isolateTableState
        hideControls
      />
    </div>
  );
}
