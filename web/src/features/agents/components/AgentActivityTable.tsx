import {
  type AgentDetailInput,
  type AgentTraceScope,
} from "@langfuse/shared/agents";
import ObservationsEventsTable from "@/src/features/events/components/EventsTable";
import { type ObservationEventsOmittableFilterColumn } from "@/src/features/events/config/filter-config";

export function AgentActivityTable({
  input,
  mode,
}: {
  input: AgentDetailInput;
  mode: NonNullable<AgentTraceScope["mode"]>;
}) {
  const { projectId, ...scope } = input;
  const omittedFilter: ObservationEventsOmittableFilterColumn[] = [
    ...(mode === "traces" ? [] : ["type" as const]),
  ];
  return (
    <div className="flex min-h-96 flex-1 flex-col">
      <ObservationsEventsTable
        projectId={projectId}
        agentScope={{ ...scope, mode }}
        externalDateRange={{ from: input.from, to: input.to }}
        omittedFilter={omittedFilter}
        enableAppRootDefault={mode === "traces"}
        showControlsInPageHeader
      />
    </div>
  );
}
