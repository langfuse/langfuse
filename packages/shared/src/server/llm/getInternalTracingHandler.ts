import CallbackHandler from "langfuse-langchain";
import { GenerationDetails, TraceSinkParams } from "./types";
import { processEventBatch } from "../ingestion/processEventBatch";
import { logger } from "../logger";
import { traceException } from "../instrumentation";

/**
 * Extracts and merges generation details from a list of processed events.
 * Handles multiple generation-create and generation-update events with the same id.
 *
 * Events are merged following the "last non-null value wins" pattern:
 * - generation-create events contain: id, name, input, metadata
 * - generation-update events contain: output, usage, usageDetails
 *
 * @returns GenerationDetails or null if no generation events found
 */
export function extractGenerationDetails(
  processedEvents: Array<{ type: string; body: Record<string, unknown> }>,
): GenerationDetails | null {
  // 1. Filter to only generation events
  const generationEvents = processedEvents.filter(
    (event) =>
      event.type === "generation-create" || event.type === "generation-update",
  );

  if (generationEvents.length === 0) {
    return null;
  }

  // 2. Get the generation id from first event
  const generationId = generationEvents[0].body.id as string;
  if (!generationId) {
    return null;
  }

  // 3. Filter to events for this generation id only
  const eventsForGeneration = generationEvents.filter(
    (event) => event.body.id === generationId,
  );

  // 4. Merge event bodies (last non-null/non-undefined value wins)
  // Similar to IngestionService pattern but simplified for our use case
  const mergedBody = eventsForGeneration.reduce(
    (acc: Record<string, unknown>, event) => {
      for (const [key, value] of Object.entries(event.body)) {
        if (value !== undefined && value !== null) {
          // Special handling for metadata: deep merge
          if (
            key === "metadata" &&
            typeof value === "object" &&
            !Array.isArray(value)
          ) {
            acc[key] = {
              ...((acc[key] as Record<string, unknown>) || {}),
              ...(value as Record<string, unknown>),
            };
          } else {
            acc[key] = value;
          }
        }
      }
      return acc;
    },
    { id: generationId },
  );

  return {
    observationId: generationId,
    name: (mergedBody.name as string) || "generation",
    input: mergedBody.input,
    output: mergedBody.output,
    metadata: (mergedBody.metadata as Record<string, unknown>) || {},
  };
}

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

      // Filter out unnecessary Langchain spans
      const blockedSpanIds = new Set();
      const blockedSpanNames = [
        "RunnableLambda",
        "StructuredOutputParser",
        "StrOutputParser",
        "JsonOutputParser",
      ];

      for (const event of events) {
        const eventName = "name" in event.body ? event.body.name : "";

        if (!eventName) continue;

        if (blockedSpanNames.includes(eventName) && "id" in event.body) {
          blockedSpanIds.add(event.body.id);
        }
      }

      const processedEvents = events
        .filter((event) => {
          if ("id" in event.body) {
            return !blockedSpanIds.has(event.body.id);
          }

          return true;
        })
        .map((event: any) => {
          // to add the prompt name and version to only generation-type observations
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

      // Extract generation details and invoke callback (if provided)
      if (traceSinkParams.onGenerationComplete) {
        try {
          const generationDetails = extractGenerationDetails(processedEvents);
          if (generationDetails) {
            traceSinkParams.onGenerationComplete(generationDetails);
          }
        } catch (extractionError) {
          // Don't fail the LLM call due to generation detail extraction errors
          traceException(extractionError);
          logger.error("Failed to extract generation details from events", {
            error: extractionError,
          });
        }
      }
    } catch (e) {
      logger.error("Failed to process traced events", { error: e });
    }
  };

  return { handler, processTracedEvents };
}
