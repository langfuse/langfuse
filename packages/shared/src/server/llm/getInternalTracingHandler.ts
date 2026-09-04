import { Langfuse } from "langfuse";
import { env } from "../../env";
import { ProcessedTraceEvent, TraceSinkParams } from "./types";
import { buildInternalTraceEventInputs } from "./internalTraceEvents";
import { processEventBatch } from "../ingestion/processEventBatch";
import { createUnknownSdkIngestionAttribution } from "../ingestion/ingestionAttribution";
import { logger } from "../logger";
import { traceException } from "../instrumentation";
import { publishAiFeatureTraceViaOtelIngestion } from "../otel/internalAiFeatureOtelWriter";

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
  const blockedSpanNameSubstrings = ["RunnableLambda", "OutputParser"];

  for (const event of events) {
    const eventName = "name" in event.body ? event.body.name : "";

    if (typeof eventName !== "string" || eventName.length === 0) {
      continue;
    }

    if (
      blockedSpanNameSubstrings.some((blockedSubstring) =>
        eventName.includes(blockedSubstring),
      ) &&
      "id" in event.body &&
      event.type !== "trace-create"
    ) {
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
  handler: { langfuse: Langfuse };
  processTracedEvents: () => Promise<void>;
} {
  const { prompt, targetProjectId, environment, eventsWriter } =
    traceSinkParams;
  const handler = {
    langfuse: new Langfuse({
      _projectId: targetProjectId,
      _isLocalEventExportEnabled: true,
      environment,
      persistence: "memory",
      sdkIntegration: "LANGCHAIN",
    }),
  };

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

      const useAiFeatureOtel =
        Boolean(traceSinkParams.aiFeatureOtelIngestion) &&
        env.LANGFUSE_MIGRATION_V4_WRITE_MODE !== "legacy";

      if (useAiFeatureOtel) {
        try {
          const { eventInputs } = buildInternalTraceEventInputs({
            processedEvents,
            traceId: traceSinkParams.traceId,
            projectId: targetProjectId,
            userId: traceSinkParams.userId,
            sessionId: traceSinkParams.sessionId,
          });

          if (eventInputs.length > 0) {
            await publishAiFeatureTraceViaOtelIngestion({
              eventInputs,
              projectId: targetProjectId,
            });
          }
        } catch (otelError) {
          traceException(otelError);
          logger.error(
            "Failed to process AI-feature traces via OTel ingestion",
            {
              error: otelError,
            },
          );
        }

        return;
      }

      // Legacy write to traces/observations tables
      try {
        const auth = {
          validKey: true as const,
          scope: {
            projectId: traceSinkParams.targetProjectId, // Important: this controls into what project traces are ingested.
            accessLevel: "project",
          } as any,
        };

        await processEventBatch(
          JSON.parse(JSON.stringify(processedEvents)), // stringify to emulate network event batch from network call
          auth,
          {
            isLangfuseInternal: true,
            forwardToEventsTable: eventsWriter ? false : undefined, // Do not dual write when we already direct event write
            attribution: createUnknownSdkIngestionAttribution({
              authCheck: auth,
            }),
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
            userId: traceSinkParams.userId,
            sessionId: traceSinkParams.sessionId,
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
