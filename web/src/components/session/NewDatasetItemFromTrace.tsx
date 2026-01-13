import { NewDatasetItemFromExistingObject } from "@/src/features/datasets/components/NewDatasetItemFromExistingObject";
import { api } from "@/src/utils/api";

export const NewDatasetItemFromTraceId = (props: {
  projectId: string;
  traceId: string;
  timestamp: Date;
  buttonVariant?: "outline" | "secondary";
}) => {
  // SessionIO already fetches the trace, so this doesn't add an extra request
  const trace = api.traces.byId.useQuery(
    {
      traceId: props.traceId,
      projectId: props.projectId,
      timestamp: props.timestamp,
    },
    {
      enabled: typeof props.traceId === "string",
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
    },
  );

  if (!trace.data) return null;

  return (
    <NewDatasetItemFromExistingObject
      projectId={props.projectId}
      traceId={props.traceId}
      input={trace.data.input ?? null}
      output={trace.data.output ?? null}
      metadata={trace.data.metadata ?? null}
      buttonVariant={props.buttonVariant}
    />
  );
};
