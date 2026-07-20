import { performance } from "perf_hooks";
import {
  type ObservationIoParserConfigDomain,
  ParsedObservationIoResponseSchema,
  type ParsedObservationIoResponse,
} from "../../../domain/observation-io-parser-configs";
import {
  executeObservationIoParserInstructions,
  OBSERVATION_IO_PARSER_MAX_SERIALIZED_RESULT_SIZE,
} from "../../../features/observation-io-parsers/jsonPath";
import { buildObservationIoParserSourceData } from "../../../features/observation-io-parsers/sourceData";
import { LangfuseNotFoundError } from "../../../errors";
import { logger } from "../../logger";
import {
  getObservationByIdFromEventsTable,
  getObservationsBatchIOFromEventsTable,
} from "../../repositories/events";
import { InMemoryFilterService } from "../InMemoryFilterService";
import { ObservationIoParserConfigService } from "./ObservationIoParserConfigService";
import type {
  ParsedObservationIoInput,
  PreviewObservationIoParserDraftInput,
} from "./types";

const OBSERVATION_IO_PARSER_EVENT_BYTES_LIMIT = 1_000_000;

type ObservationIoParserMatchData = Record<string, unknown> & {
  eventBytes: number;
};

type ObservationForParser = NonNullable<
  Awaited<ReturnType<typeof getObservationByIdFromEventsTable>>
>;

type ObservationIoParserCandidateConfig = Pick<
  ObservationIoParserConfigDomain,
  "id" | "name" | "priority" | "filters" | "instructions"
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
  configs: ObservationIoParserCandidateConfig[],
  matchData: ObservationIoParserMatchData,
) => {
  return (
    configs.find((config) =>
      InMemoryFilterService.evaluateFilter(
        matchData,
        config.filters,
        getObservationIoParserMatchFieldValue,
      ),
    ) ?? null
  );
};

const rawFallback = (
  input: ParsedObservationIoInput,
  reason: Extract<
    ParsedObservationIoResponse,
    { mode: "raw_fallback" }
  >["reason"],
  eventBytes?: number,
): ParsedObservationIoResponse =>
  ParsedObservationIoResponseSchema.parse({
    mode: "raw_fallback",
    observationId: input.observation.id,
    reason,
    ...(eventBytes !== undefined ? { eventBytes } : {}),
  });

const getObservationForParser = async (
  input: ParsedObservationIoInput,
): Promise<ObservationForParser | null> => {
  try {
    return await getObservationByIdFromEventsTable({
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
      return null;
    }

    throw error;
  }
};

const executeMatchedParserConfig = async ({
  input,
  observation,
  matchData,
  matchingConfig,
}: {
  input: ParsedObservationIoInput;
  observation: ObservationForParser;
  matchData: ObservationIoParserMatchData;
  matchingConfig: ObservationIoParserCandidateConfig;
}): Promise<ParsedObservationIoResponse> => {
  const [sourceData] = await getObservationsBatchIOFromEventsTable({
    projectId: input.projectId,
    observations: [input.observation],
    minStartTime: input.minStartTime,
    maxStartTime: input.maxStartTime,
    truncated: false,
  });

  if (!sourceData) {
    return rawFallback(input, "event_not_found", matchData.eventBytes);
  }

  const parseStart = performance.now();

  try {
    const parserSourceData = buildObservationIoParserSourceData({
      instructions: matchingConfig.instructions,
      sourceData,
      observationName: observation.name,
    });

    const parsed = executeObservationIoParserInstructions({
      instructions: matchingConfig.instructions,
      sourceData: parserSourceData,
    });

    if (
      parsed.serializedSize > OBSERVATION_IO_PARSER_MAX_SERIALIZED_RESULT_SIZE
    ) {
      return rawFallback(
        input,
        "parsed_output_too_large",
        matchData.eventBytes,
      );
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

    return rawFallback(input, "parser_error", matchData.eventBytes);
  }
};

export class ObservationIoParserResolutionService {
  public static async resolveParsedObservationIo(
    input: ParsedObservationIoInput & {
      userId?: string;
      v4BetaEnabled: boolean;
    },
  ): Promise<ParsedObservationIoResponse> {
    if (!input.v4BetaEnabled) {
      return rawFallback(input, "v4_beta_disabled");
    }

    const preference =
      await ObservationIoParserConfigService.getResolvedPreference(
        input.projectId,
        input.userId,
      );

    if (preference.disabledScope === "project") {
      return rawFallback(input, "project_disabled");
    }

    if (preference.disabledScope === "user") {
      return rawFallback(input, "user_disabled");
    }

    const activeConfigs =
      await ObservationIoParserConfigService.listActiveConfigs(input.projectId);

    if (activeConfigs.length === 0) {
      return rawFallback(input, "no_active_configs");
    }

    const candidateConfigs = preference.selectedConfigId
      ? activeConfigs.filter(
          (config) => config.id === preference.selectedConfigId,
        )
      : activeConfigs;

    if (candidateConfigs.length === 0) {
      return rawFallback(input, "no_matching_config");
    }

    const observation = await getObservationForParser(input);
    if (!observation) {
      return rawFallback(input, "event_not_found");
    }

    const matchData = getObservationIoParserMatchData(observation);

    if (matchData.eventBytes > OBSERVATION_IO_PARSER_EVENT_BYTES_LIMIT) {
      return rawFallback(input, "event_too_large", matchData.eventBytes);
    }

    const matchingConfig = getFirstMatchingConfig(candidateConfigs, matchData);

    if (!matchingConfig) {
      return rawFallback(input, "no_matching_config", matchData.eventBytes);
    }

    return executeMatchedParserConfig({
      input,
      observation,
      matchData,
      matchingConfig,
    });
  }

  public static async previewDraft(
    input: PreviewObservationIoParserDraftInput,
  ): Promise<ParsedObservationIoResponse> {
    if (!input.draft.enabled) {
      return rawFallback(input, "no_active_configs");
    }

    const observation = await getObservationForParser(input);
    if (!observation) {
      return rawFallback(input, "event_not_found");
    }

    const matchData = getObservationIoParserMatchData(observation);

    if (matchData.eventBytes > OBSERVATION_IO_PARSER_EVENT_BYTES_LIMIT) {
      return rawFallback(input, "event_too_large", matchData.eventBytes);
    }

    const matchingConfig = getFirstMatchingConfig(
      [
        {
          id: "draft",
          name: "Draft preview",
          priority: 0,
          filters: input.draft.filters,
          instructions: input.draft.instructions,
        },
      ],
      matchData,
    );

    if (!matchingConfig) {
      return rawFallback(input, "no_matching_config", matchData.eventBytes);
    }

    return executeMatchedParserConfig({
      input,
      observation,
      matchData,
      matchingConfig,
    });
  }
}
