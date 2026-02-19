import { parseClickhouseUTCDateTimeFormat } from "./clickhouse";
import { TraceRecordExtraFieldsType, TraceRecordReadType } from "./definitions";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { TraceDomain } from "../../domain";
import { parseMetadataCHRecordToDomain } from "../utils/metadata_conversion";
import {
  RenderingProps,
  DEFAULT_RENDERING_PROPS,
  applyInputOutputRendering,
  applyInputOutputRenderingAsync,
} from "../utils/rendering";

export const convertTraceDomainToClickhouse = (
  trace: TraceDomain,
): TraceRecordReadType => {
  return {
    id: trace.id,
    timestamp: convertDateToClickhouseDateTime(trace.timestamp),
    name: trace.name,
    user_id: trace.userId,
    metadata: trace.metadata as Record<string, string>,
    environment: trace.environment,
    release: trace.release,
    version: trace.version,
    project_id: trace.projectId,
    public: trace.public,
    bookmarked: trace.bookmarked,
    tags: trace.tags,
    input: trace.input as string,
    output: trace.output as string,
    session_id: trace.sessionId,
    created_at: convertDateToClickhouseDateTime(trace.createdAt),
    updated_at: convertDateToClickhouseDateTime(trace.updatedAt),
    event_ts: convertDateToClickhouseDateTime(new Date()),
    is_deleted: 0,
  };
};

export const convertClickhouseToDomain = (
  record: TraceRecordReadType,
  renderingProps: RenderingProps = DEFAULT_RENDERING_PROPS,
): TraceDomain => {
  return {
    id: record.id,
    projectId: record.project_id,
    name: record.name ?? null,
    timestamp: parseClickhouseUTCDateTimeFormat(record.timestamp),
    environment: record.environment,
    tags: record.tags,
    bookmarked: record.bookmarked,
    release: record.release ?? null,
    version: record.version ?? null,
    userId: record.user_id ?? null,
    sessionId: record.session_id ?? null,
    public: record.public,
    input: applyInputOutputRendering(record.input, renderingProps),
    output: applyInputOutputRendering(record.output, renderingProps),
    metadata: parseMetadataCHRecordToDomain(record.metadata),
    createdAt: parseClickhouseUTCDateTimeFormat(record.created_at),
    updatedAt: parseClickhouseUTCDateTimeFormat(record.updated_at),
  };
};

/**
 * Async version of convertClickhouseToDomain using non-blocking JSON parsing.
 */
export const convertClickhouseToDomainAsync = async (
  record: TraceRecordReadType,
  renderingProps: RenderingProps = DEFAULT_RENDERING_PROPS,
): Promise<TraceDomain> => {
  const [input, output] = await Promise.all([
    applyInputOutputRenderingAsync(record.input, renderingProps),
    applyInputOutputRenderingAsync(record.output, renderingProps),
  ]);

  return {
    id: record.id,
    projectId: record.project_id,
    name: record.name ?? null,
    timestamp: parseClickhouseUTCDateTimeFormat(record.timestamp),
    environment: record.environment,
    tags: record.tags,
    bookmarked: record.bookmarked,
    release: record.release ?? null,
    version: record.version ?? null,
    userId: record.user_id ?? null,
    sessionId: record.session_id ?? null,
    public: record.public,
    input,
    output,
    metadata: parseMetadataCHRecordToDomain(record.metadata),
    createdAt: parseClickhouseUTCDateTimeFormat(record.created_at),
    updatedAt: parseClickhouseUTCDateTimeFormat(record.updated_at),
  };
};

export const convertClickhouseTracesListToDomain = (
  result: Array<TraceRecordReadType & TraceRecordExtraFieldsType>,
  include: { observations: boolean; scores: boolean; metrics: boolean },
): Array<TraceDomain & TraceRecordExtraFieldsType> => {
  return result.map((trace) => {
    return {
      ...convertClickhouseToDomain(trace, DEFAULT_RENDERING_PROPS),
      // Conditionally include additional fields based on request
      // We need to return empty list on excluded scores / observations
      // and -1 on excluded metrics to not break the SDK API clients
      // that expect those fields if they have not been excluded via 'fields' property
      // See LFE-6361
      observations: include.observations ? trace.observations : [],
      scores: include.scores ? trace.scores : [],
      totalCost: include.metrics ? trace.totalCost : -1,
      latency: include.metrics ? trace.latency : -1,
      htmlPath: trace.htmlPath,
    };
  });
};

export const convertClickhouseTracesListToDomainAsync = async (
  result: Array<TraceRecordReadType & TraceRecordExtraFieldsType>,
  include: { observations: boolean; scores: boolean; metrics: boolean },
): Promise<Array<TraceDomain & TraceRecordExtraFieldsType>> => {
  return Promise.all(
    result.map(async (trace) => {
      return {
        ...(await convertClickhouseToDomainAsync(
          trace,
          DEFAULT_RENDERING_PROPS,
        )),
        observations: include.observations ? trace.observations : [],
        scores: include.scores ? trace.scores : [],
        totalCost: include.metrics ? trace.totalCost : -1,
        latency: include.metrics ? trace.latency : -1,
        htmlPath: trace.htmlPath,
      };
    }),
  );
};
