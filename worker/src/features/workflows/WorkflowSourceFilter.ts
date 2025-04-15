import { checkTraceExists } from "../../../../packages/shared/src/server/repositories";
import { SourceEvent, Filters } from "./types";

interface WorkflowSourceFilter {
  filter(event: SourceEvent, filter: Filters): Promise<boolean>;
}

export class TracesWorkflowSourceFilter implements WorkflowSourceFilter {
  async filter(event: SourceEvent, filter: Filters): Promise<boolean> {
    // Check whether the trace already exists in the database.
    const traceExists = await checkTraceExists(
      event.projectId,
      event.traceId,
      new Date(),
      filter,
    );

    return traceExists;
  }
}
