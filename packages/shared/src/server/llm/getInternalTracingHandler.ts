import { TraceSinkParams } from "./types";
import {
  INTERNAL_TRACE_EVENT_SOURCE,
  type InternalTraceEventInput,
} from "./internalTraceEvents";
import type { ObservationType } from "../../domain/observations";
import type { SkillsAvailableInput } from "../../features/skills/trace";
import { stringifyValue } from "../../utils/stringChecks";
import {
  convertCallsToArrays,
  convertDefinitionsToMap,
  extractToolsFromObservation,
} from "../ingestion/extractToolsBackend";
import { logger } from "../logger";
import { traceException } from "../instrumentation";
import { publishAiFeatureTraceViaOtelIngestion } from "../otel/internalAiFeatureOtelWriter";

export type InternalObservation = {
  id: string;
  traceId: string;
  parentObservationId?: string | null;
  name: string;
  startTime: Date;
  endTime: Date;
  completionStartTime?: Date;
  input?: unknown;
  output?: unknown;
  model?: string;
  usageDetails?: Record<string, number>;
  level?: "DEFAULT" | "ERROR";
  statusMessage?: string | null;
  metadata?: Record<string, unknown>;
  promptName?: string;
  promptVersion?: number;
  userId?: string;
  sessionId?: string;
  tags?: string[];
  skillsAvailable?: SkillsAvailableInput;
};

export function getInternalTracingHandler(
  params: Pick<
    TraceSinkParams,
    | "targetProjectId"
    | "traceId"
    | "traceName"
    | "environment"
    | "userId"
    | "sessionId"
    | "metadata"
    | "prompt"
  >,
) {
  const observations = new Map<string, InternalTraceEventInput>();

  const recordObservation = (
    type: ObservationType,
    observation: InternalObservation,
  ) => {
    const { toolDefinitions, toolArguments } = extractToolsFromObservation(
      observation.input,
      observation.output,
    );
    const toolCalls = convertCallsToArrays(toolArguments);
    observations.set(observation.id, {
      projectId: params.targetProjectId,
      traceId: params.traceId,
      spanId: observation.id,
      parentSpanId: observation.parentObservationId ?? undefined,
      name: observation.name,
      type,
      environment: params.environment,
      traceName: params.traceName,
      startTimeISO: observation.startTime.toISOString(),
      endTimeISO: observation.endTime.toISOString(),
      completionStartTime: observation.completionStartTime?.toISOString(),
      input:
        observation.input === undefined
          ? undefined
          : stringifyValue(observation.input),
      output:
        observation.output === undefined
          ? undefined
          : stringifyValue(observation.output),
      modelName: observation.model,
      providedUsageDetails: observation.usageDetails,
      level: observation.level ?? "DEFAULT",
      statusMessage: observation.statusMessage ?? undefined,
      promptName:
        observation.promptName ??
        (type === "GENERATION" ? params.prompt?.name : undefined),
      promptVersion: (
        observation.promptVersion ??
        (type === "GENERATION" ? params.prompt?.version : undefined)
      )?.toString(),
      userId: observation.userId ?? params.userId,
      sessionId: observation.sessionId ?? params.sessionId,
      tags: observation.tags,
      metadata: { ...params.metadata, ...observation.metadata },
      toolDefinitions: convertDefinitionsToMap(toolDefinitions),
      toolCalls: toolCalls.tool_calls,
      toolCallNames: toolCalls.tool_call_names,
      skillsAvailable: observation.skillsAvailable,
      source: INTERNAL_TRACE_EVENT_SOURCE,
    });
  };

  const processTracedEvents = async () => {
    if (observations.size === 0) return;
    const eventInputs = [...observations.values()];
    observations.clear();
    try {
      await publishAiFeatureTraceViaOtelIngestion({
        eventInputs,
        projectId: params.targetProjectId,
      });
    } catch (error) {
      traceException(error);
      logger.error(
        "Failed to process AI-feature observations via OTel ingestion",
        { error },
      );
    }
  };

  return { recordObservation, processTracedEvents };
}
