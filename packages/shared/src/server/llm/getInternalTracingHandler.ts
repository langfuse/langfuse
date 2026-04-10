import CallbackHandler from "langfuse-langchain";
import { ProcessedTraceEvent, TraceSinkParams } from "./types";
import { buildInternalTraceEventInputs } from "./internalTraceEvents";
import { processEventBatch } from "../ingestion/processEventBatch";
import { logger } from "../logger";
import { traceException } from "../instrumentation";

export function prepareInternalTraceEvents(params: {
  events: Array<{
    type: string;
    timestamp: string;
    body: Record<string, unknown>;
  }>;
  environment: string;
  prompt?: TraceSinkParams["prompt"];
}): ProcessedTraceEvent[] {
  const { events, environment, prompt } = params;

  const blockedSpanIds = new Set();
  const blockedSpanNames = [
    "RunnableLambda",
    "StructuredOutputParser",
    "StrOutputParser",
    "JsonOutputParser",
  ];

  for (const event of events) {
    const eventName = "name" in event.body ? event.body.name : "";

    if (typeof eventName !== "string" || eventName.length === 0) {
      continue;
    }

    if (blockedSpanNames.includes(eventName as string) && "id" in event.body) {
      blockedSpanIds.add(event.body.id);
    }
  }

  return events
    .filter((event) => {
      if ("id" in event.body) {
        return !blockedSpanIds.has(event.body.id);
      }

      return true;
    })
    .map((event) => {
      // Inject environment into all events
      return {
        ...event,
        body: {
          ...event.body,
          environment,
        },
      };
    })
    .map((event) => {
      if (event.type === "generation-create" && prompt) {
        return {
          ...event,
          body: {
            ...event.body,
            promptName: prompt.name,
            promptVersion: prompt.version,
          },
        };
      }

      return event;
    });
}

export function getInternalTracingHandler(traceSinkParams: TraceSinkParams): {
  handler: CallbackHandler;
  processTracedEvents: () => Promise<void>;
} {
  const { prompt, targetProjectId, environment, userId, eventsWriter } =
    traceSinkParams;
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
      const processedEvents = prepareInternalTraceEvents({
        events,
        environment,
        prompt,
      });

      // Legacy write to traces/observations tables
      try {
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
            forwardToEventsTable: eventsWriter ? false : undefined, // Do not dual write when we already direct event write
          },
        );
      } catch (processingError) {
        traceException(processingError);
        logger.error("Failed to process traced events via legacy ingestion", {
          error: processingError,
        });
      }

      // Direct write to events table
      if (eventsWriter) {
        try {
          const { rootSpanId, eventInputs } = buildInternalTraceEventInputs({
            processedEvents,
            traceId: traceSinkParams.traceId,
            projectId: targetProjectId,
            experimentContext: eventsWriter.experimentContext,
          });

          if (eventInputs.length > 0) {
            await eventsWriter.write({ rootSpanId, eventInputs });
          }
        } catch (writeError) {
          traceException(writeError);
          logger.error("Failed to direct-write internal traced events", {
            error: writeError,
          });
        }
      }
    } catch (e) {
      logger.error("Failed to process traced events", { error: e });
    }
  };

  return { handler, processTracedEvents };
}
