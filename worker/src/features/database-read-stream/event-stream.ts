/**
 * Event stream for batch exports, collapsed to the GreptimeDB observation projection.
 *
 * In the ClickHouse build the events table was a denormalised observation-grain table; GreptimeDB has
 * no events table, so the export reads the merged `observations` projection (joined to `traces` for
 * the denormalised trace fields) — events are observation-grain (span_id -> observation id).
 */

import {
  FilterCondition,
  TimeFilter,
  TracingSearchType,
} from "@langfuse/shared";
import {
  getDistinctScoreNames,
  getScoresForObservations,
  streamObservationsForExport,
  logger,
  observationsTableUiColumnDefinitions,
} from "@langfuse/shared/src/server";
import { Readable } from "stream";
import { env } from "../../env";
import {
  getChunkWithFlattenedScores,
  prepareScoresForOutput,
} from "./getDatabaseReadStream";
import { fetchCommentsForExport } from "./fetchCommentsForExport";
import { BatchExportEventsRow } from "./types";

const PAGE_SIZE = 1000;

const isStartTimeFilter = (f: FilterCondition): f is TimeFilter =>
  f.column === "Start Time" && f.type === "datetime";

// Events filters exclude score/comment columns; the observation projection has no such columns.
const eventOnly = (filter: FilterCondition[] | null): FilterCondition[] =>
  (filter ?? []).filter((f) => {
    const columnDef = observationsTableUiColumnDefinitions.find(
      (col) => col.uiTableName === f.column || col.uiTableId === f.column,
    );
    return (
      columnDef?.clickhouseTableName !== "scores" &&
      columnDef?.clickhouseTableName !== "comments"
    );
  });

const latencyMs = (start: Date, end: Date | null | undefined): number | null =>
  end ? end.getTime() - start.getTime() : null;

export const getEventsStream = async (props: {
  projectId: string;
  cutoffCreatedAt: Date;
  filter: FilterCondition[] | null;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  rowLimit?: number;
}): Promise<Readable> => {
  const {
    projectId,
    cutoffCreatedAt,
    filter = [],
    searchQuery,
    searchType,
    rowLimit = env.BATCH_EXPORT_ROW_LIMIT,
  } = props;

  const filters = eventOnly(filter);
  const distinctScoreNames = await getDistinctScoreNames({
    projectId,
    cutoffCreatedAt,
    filter: filters,
    isTimestampFilter: isStartTimeFilter,
  });
  const emptyScoreColumns = distinctScoreNames.reduce(
    (acc, name) => ({ ...acc, [name]: null }),
    {} as Record<string, null>,
  );

  let recordsProcessed = 0;

  return Readable.from(
    (async function* () {
      for await (const page of streamObservationsForExport({
        projectId,
        filter: filters,
        cutoffCreatedAt,
        searchQuery,
        searchType,
        rowLimit,
        pageSize: PAGE_SIZE,
      })) {
        const observationIds = page.map((o) => o.id);
        const [scores, commentsByEvent] = await Promise.all([
          getScoresForObservations({
            projectId,
            observationIds,
            excludeMetadata: true,
          }),
          fetchCommentsForExport(projectId, "OBSERVATION", observationIds),
        ]);
        const scoresByObs = new Map<string, typeof scores>();
        for (const s of scores) {
          if (!s.observationId) continue;
          const list = scoresByObs.get(s.observationId) ?? [];
          list.push(s);
          scoresByObs.set(s.observationId, list);
        }

        for (const obs of page) {
          recordsProcessed++;
          if (recordsProcessed % 10000 === 0)
            logger.info(
              `Streaming events for project ${projectId}: processed ${recordsProcessed} rows`,
            );

          const outputScores = prepareScoresForOutput(
            (scoresByObs.get(obs.id) ?? []).map((s) => ({
              name: s.name,
              value: s.value,
              dataType: s.dataType,
              stringValue: s.stringValue,
            })),
          );

          const eventRow: BatchExportEventsRow = {
            id: obs.id,
            traceId: obs.traceId ?? "",
            traceName: obs.traceName,
            type: obs.type,
            name: obs.name ?? "",
            startTime: obs.startTime,
            endTime: obs.endTime,
            completionStartTime: obs.completionStartTime,
            environment: obs.environment,
            version: obs.version,
            userId: obs.userId,
            sessionId: obs.traceSessionId,
            level: obs.level,
            statusMessage: obs.statusMessage,
            promptName: obs.promptName,
            promptId: obs.promptId,
            promptVersion: obs.promptVersion,
            modelId: obs.internalModelId,
            providedModelName: obs.model,
            modelParameters: obs.modelParameters,
            usageDetails: obs.usageDetails,
            costDetails: obs.costDetails,
            totalCost: obs.totalCost,
            input: obs.input,
            output: obs.output,
            metadata: obs.metadata,
            latencyMs: latencyMs(obs.startTime, obs.endTime),
            timeToFirstTokenMs: latencyMs(
              obs.startTime,
              obs.completionStartTime,
            ),
            tags: obs.traceTags,
            release: obs.traceRelease,
            parentObservationId: obs.parentObservationId,
            scores: outputScores,
            comments: commentsByEvent.get(obs.id) ?? [],
          };

          yield getChunkWithFlattenedScores([eventRow], emptyScoreColumns)[0];
        }
      }
    })(),
  );
};

/**
 * Lightweight event stream for batch add-to-dataset: id, traceId, input, output, metadata.
 */
export const getEventsStreamForDataset = async (props: {
  projectId: string;
  cutoffCreatedAt: Date;
  filter: FilterCondition[] | null;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  rowLimit?: number;
}): Promise<Readable> => {
  const {
    projectId,
    cutoffCreatedAt,
    filter = [],
    searchQuery,
    searchType,
    rowLimit = env.BATCH_EXPORT_ROW_LIMIT,
  } = props;

  return Readable.from(
    (async function* () {
      for await (const page of streamObservationsForExport({
        projectId,
        filter: eventOnly(filter),
        cutoffCreatedAt,
        searchQuery,
        searchType,
        rowLimit,
        pageSize: PAGE_SIZE,
      })) {
        for (const obs of page) {
          yield {
            id: obs.id,
            traceId: obs.traceId,
            input: obs.input,
            output: obs.output,
            metadata: obs.metadata,
          };
        }
      }
    })(),
  );
};

/**
 * Lightweight event stream for batch add-to-annotation-queue: id, traceId.
 */
export const getEventsStreamForAnnotationQueue = async (props: {
  projectId: string;
  cutoffCreatedAt: Date;
  filter: FilterCondition[] | null;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  rowLimit?: number;
}): Promise<Readable> => {
  const {
    projectId,
    cutoffCreatedAt,
    filter = [],
    searchQuery,
    searchType,
    rowLimit = env.BATCH_EXPORT_ROW_LIMIT,
  } = props;

  return Readable.from(
    (async function* () {
      for await (const page of streamObservationsForExport({
        projectId,
        filter: eventOnly(filter),
        cutoffCreatedAt,
        searchQuery,
        searchType,
        rowLimit,
        pageSize: PAGE_SIZE,
      })) {
        for (const obs of page) {
          yield { id: obs.id, traceId: obs.traceId };
        }
      }
    })(),
  );
};
