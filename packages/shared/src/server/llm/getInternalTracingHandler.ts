import CallbackHandler from "langfuse-langchain";
import { TraceSinkParams } from "./types";
import { processEventBatch } from "../ingestion/processEventBatch";
import { logger } from "../logger";

export function getInternalTracingHandler(traceSinkParams: TraceSinkParams): {
  handler: CallbackHandler;
  processTracedEvents: () => Promise<void>;
} {
  const { prompt, targetProjectId, environment, userId } = traceSinkParams;
  const handler = new CallbackHandler({
    _projectId: targetProjectId,
    _isLocalEventExportEnabled: true,
    environment: environment,
    userId: userId,
  });

  const processTracedEvents = async () => {
    try {
      const events = await handler.langfuse._exportLocalEvents(
        traceSinkParams.targetProjectId,
      );
      // to add the prompt name and version to only generation-type observations
      const processedEvents = events.map((event: any) => {
        if (event.type === "generation-create" && prompt) {
          return {
            ...event,
            body: {
              ...event.body,
              ...{ promptName: prompt.name, promptVersion: prompt.version },
            },
          };
        }
        return event;
      });

      await processEventBatch(
        JSON.parse(JSON.stringify(processedEvents)), // stringify to emulate network event batch from network call
        {
          validKey: true as const,
          scope: {
            projectId: traceSinkParams.targetProjectId, // Important: this controls into what project traces are ingested.
            accessLevel: "project",
          } as any,
        },
        {
          isLangfuseInternal: true,
        },
      );
    } catch (e) {
      logger.error("Failed to process traced events", { error: e });
    }
  };

  return { handler, processTracedEvents };
}
