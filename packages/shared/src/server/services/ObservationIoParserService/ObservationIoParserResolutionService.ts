import { performance } from "perf_hooks";
import {
  type ObservationIoParserConfigDomain,
  ParsedObservationIoResponseSchema,
  type ParsedObservationIoResponse,
} from "../../../domain/observation-io-parser-configs";
import {
  executeObservationIoParserInstructions,
  OBSERVATION_IO_PARSER_MAX_SERIALIZED_RESULT_SIZE,
  type ObservationIoParserSourceData as JsonPathObservationIoParserSourceData,
} from "../../../features/observation-io-parsers/jsonPath";
import { LangfuseNotFoundError } from "../../../errors";
import { logger } from "../../logger";
import {
  getObservationByIdFromEventsTable,
  getObservationsBatchIOFromEventsTable,
} from "../../repositories/events";
import { InMemoryFilterService } from "../InMemoryFilterService";
import { ObservationIoParserConfigService } from "./ObservationIoParserConfigService";
import type { ParsedObservationIoInput } from "./types";

const OBSERVATION_IO_PARSER_EVENT_BYTES_LIMIT = 1_000_000;

type ObservationIoParserMatchData = Record<string, unknown> & {
  eventBytes: number;
};

type ObservationForParser = NonNullable<
  Awaited<ReturnType<typeof getObservationByIdFromEventsTable>>
>;

const getTokensPerSecond = (observation: ObservationForParser) =>
  observation.latency && observation.outputUsage
    ? observation.outputUsage / observation.latency
    : null;

const getObservationIoParserMatchData = (
  observation: ObservationForParser,
): ObservationIoParserMatchData => {
  const traceTags = observation.traceTags ?? [];
  const toolDefinitions = observation.toolDefinitions ?? {};
  const toolCalls = observation.toolCalls ?? [];

  return {
    id: observation.id,
    traceId: observation.traceId,
    type: observation.type,
    name: observation.name,
    startTime: observation.startTime,
    endTime: observation.endTime,
    timeToFirstToken: observation.timeToFirstToken,
    latency: observation.latency,
    tokensPerSecond: getTokensPerSecond(observation),
    inputCost: observation.inputCost,
    outputCost: observation.outputCost,
    totalCost: observation.totalCost,
    inputTokens: observation.inputUsage,
    outputTokens: observation.outputUsage,
    totalTokens: observation.totalUsage,
    level: observation.level,
    statusMessage: observation.statusMessage,
    model: observation.model,
    providedModelName: observation.model,
    modelId: observation.internalModelId,
    version: observation.version,
    promptName: observation.promptName,
    promptVersion: observation.promptVersion,
    sessionId: observation.sessionId,
    traceName: observation.traceName,
    userId: observation.userId,
    traceTags,
    tags: traceTags,
    environment: observation.environment,
    parentObservationId: observation.parentObservationId,
    hasParentObservation: Boolean(observation.parentObservationId),
    isRootObservation: !observation.parentObservationId,
    toolDefinitions: Object.keys(toolDefinitions).length,
    toolCalls: toolCalls.length,
    toolNames: Object.keys(toolDefinitions),
    calledToolNames: observation.toolCallNames ?? [],
    eventBytes: observation.eventBytes ?? 0,
  };
};

const getObservationIoParserMatchFieldValue = (
  data: ObservationIoParserMatchData,
  column: string,
): unknown => data[column];

const getFirstMatchingConfig = (
  configs: ObservationIoParserConfigDomain[],
  matchData: ObservationIoParserMatchData,
) => {
  let firstMatchingConfig: ObservationIoParserConfigDomain | null = null;

  for (const config of configs) {
    const matches = InMemoryFilterService.evaluateFilter(
      matchData,
      config.filters,
      getObservationIoParserMatchFieldValue,
    );

    if (matches && firstMatchingConfig === null) {
      firstMatchingConfig = config;
    }
  }

  return firstMatchingConfig;
};

export class ObservationIoParserResolutionService {
  public static async resolveParsedObservationIo(
    input: ParsedObservationIoInput & {
      userId?: string;
      v4BetaEnabled: boolean;
    },
  ): Promise<ParsedObservationIoResponse> {
    if (!input.v4BetaEnabled) {
      return ParsedObservationIoResponseSchema.parse({
        mode: "raw_fallback",
        observationId: input.observation.id,
        reason: "v4_beta_disabled",
      });
    }

    const preference =
      await ObservationIoParserConfigService.getResolvedPreference(
        input.projectId,
        input.userId,
      );

    if (preference.disabledScope === "project") {
      return ParsedObservationIoResponseSchema.parse({
        mode: "raw_fallback",
        observationId: input.observation.id,
        reason: "project_disabled",
      });
    }

    if (preference.disabledScope === "user") {
      return ParsedObservationIoResponseSchema.parse({
        mode: "raw_fallback",
        observationId: input.observation.id,
        reason: "user_disabled",
      });
    }

    const activeConfigs =
      await ObservationIoParserConfigService.listActiveConfigs(input.projectId);

    if (activeConfigs.length === 0) {
      return ParsedObservationIoResponseSchema.parse({
        mode: "raw_fallback",
        observationId: input.observation.id,
        reason: "no_active_configs",
      });
    }

    const candidateConfigs = preference.selectedConfigId
      ? activeConfigs.filter(
          (config) => config.id === preference.selectedConfigId,
        )
      : activeConfigs;

    if (candidateConfigs.length === 0) {
      return ParsedObservationIoResponseSchema.parse({
        mode: "raw_fallback",
        observationId: input.observation.id,
        reason: "no_matching_config",
      });
    }

    let observation: ObservationForParser;
    try {
      observation = await getObservationByIdFromEventsTable({
        projectId: input.projectId,
        id: input.observation.id,
        traceId: input.observation.traceId,
        startTime:
          input.minStartTime.getTime() === input.maxStartTime.getTime()
            ? input.minStartTime
            : undefined,
      });
    } catch (error) {
      if (error instanceof LangfuseNotFoundError) {
        return ParsedObservationIoResponseSchema.parse({
          mode: "raw_fallback",
          observationId: input.observation.id,
          reason: "event_not_found",
        });
      }

      throw error;
    }

    const matchData = getObservationIoParserMatchData(observation);

    if (matchData.eventBytes > OBSERVATION_IO_PARSER_EVENT_BYTES_LIMIT) {
      return ParsedObservationIoResponseSchema.parse({
        mode: "raw_fallback",
        observationId: input.observation.id,
        reason: "event_too_large",
        eventBytes: matchData.eventBytes,
      });
    }

    const matchingConfig = getFirstMatchingConfig(candidateConfigs, matchData);

    if (!matchingConfig) {
      return ParsedObservationIoResponseSchema.parse({
        mode: "raw_fallback",
        observationId: input.observation.id,
        reason: "no_matching_config",
        eventBytes: matchData.eventBytes,
      });
    }

    const [sourceData] = await getObservationsBatchIOFromEventsTable({
      projectId: input.projectId,
      observations: [input.observation],
      minStartTime: input.minStartTime,
      maxStartTime: input.maxStartTime,
      truncated: false,
    });

    if (!sourceData) {
      return ParsedObservationIoResponseSchema.parse({
        mode: "raw_fallback",
        observationId: input.observation.id,
        reason: "event_not_found",
        eventBytes: matchData.eventBytes,
      });
    }

    const parseStart = performance.now();

    try {
      const parsed = executeObservationIoParserInstructions({
        instructions: matchingConfig.instructions,
        sourceData: sourceData as JsonPathObservationIoParserSourceData,
      });

      if (
        parsed.serializedSize > OBSERVATION_IO_PARSER_MAX_SERIALIZED_RESULT_SIZE
      ) {
        return ParsedObservationIoResponseSchema.parse({
          mode: "raw_fallback",
          observationId: input.observation.id,
          reason: "parsed_output_too_large",
          eventBytes: matchData.eventBytes,
        });
      }

      return ParsedObservationIoResponseSchema.parse({
        mode: "parsed",
        observationId: input.observation.id,
        matchedConfig: {
          id: matchingConfig.id,
          name: matchingConfig.name,
          priority: matchingConfig.priority,
        },
        fields: parsed.fields,
        diagnostics: {
          eventBytes: matchData.eventBytes,
          parseDurationMs: performance.now() - parseStart,
        },
      });
    } catch (error) {
      logger.warn("Observation IO parser failed", {
        projectId: input.projectId,
        observationId: input.observation.id,
        parserConfigId: matchingConfig.id,
        error,
      });

      return ParsedObservationIoResponseSchema.parse({
        mode: "raw_fallback",
        observationId: input.observation.id,
        reason: "parser_error",
        eventBytes: matchData.eventBytes,
      });
    }
  }
}
