import { FilterCondition, TracingSearchType } from "@langfuse/shared";
import {
  getDistinctScoreNames,
  getScoresForTraces,
  streamTracesForExport,
  logger,
  tracesTableUiColumnDefinitions,
} from "@langfuse/shared/src/server";
import { Readable } from "stream";
import { env } from "../../env";
import {
  getChunkWithFlattenedScores,
  isTraceTimestampFilter,
  prepareScoresForOutput,
} from "./getDatabaseReadStream";
import { fetchCommentsForExport } from "./fetchCommentsForExport";

const PAGE_SIZE = 1000;

export const getTraceStream = async (props: {
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

  // Drop observation-level filters: the GreptimeDB trace projection has no observation columns.
  const traceOnlyFilters = (filter ?? []).filter((f) => {
    const columnDef = tracesTableUiColumnDefinitions.find(
      (col) => col.uiTableName === f.column || col.uiTableId === f.column,
    );
    return columnDef?.clickhouseTableName !== "observations";
  });

  const distinctScoreNames = await getDistinctScoreNames({
    projectId,
    cutoffCreatedAt,
    filter: traceOnlyFilters,
    isTimestampFilter: isTraceTimestampFilter,
  });
  const emptyScoreColumns = distinctScoreNames.reduce(
    (acc, name) => ({ ...acc, [name]: null }),
    {} as Record<string, null>,
  );

  let recordsProcessed = 0;

  return Readable.from(
    (async function* () {
      for await (const page of streamTracesForExport({
        projectId,
        filter: traceOnlyFilters,
        cutoffCreatedAt,
        searchQuery,
        searchType,
        rowLimit,
        pageSize: PAGE_SIZE,
      })) {
        const traceIds = page.map((t) => t.id);
        const [scores, commentsByTrace] = await Promise.all([
          getScoresForTraces({
            projectId,
            traceIds,
            excludeMetadata: true,
          }),
          fetchCommentsForExport(projectId, "TRACE", traceIds),
        ]);

        const scoresByTrace = new Map<string, typeof scores>();
        for (const score of scores) {
          if (!score.traceId) continue;
          const list = scoresByTrace.get(score.traceId) ?? [];
          list.push(score);
          scoresByTrace.set(score.traceId, list);
        }

        for (const trace of page) {
          recordsProcessed++;
          if (recordsProcessed % 10000 === 0)
            logger.info(
              `Streaming traces for project ${projectId}: processed ${recordsProcessed} rows`,
            );

          const outputScores = prepareScoresForOutput(
            (scoresByTrace.get(trace.id) ?? []).map((s) => ({
              name: s.name,
              value: s.value,
              dataType: s.dataType,
              stringValue: s.stringValue,
            })),
          );

          yield getChunkWithFlattenedScores(
            [
              {
                id: trace.id,
                timestamp: trace.timestamp,
                name: trace.name ?? "",
                userId: trace.userId,
                sessionId: trace.sessionId,
                release: trace.release,
                version: trace.version,
                environment: trace.environment ?? undefined,
                tags: trace.tags,
                bookmarked: trace.bookmarked,
                public: trace.public,
                input: trace.input,
                output: trace.output,
                metadata: trace.metadata,
                scores: outputScores,
                comments: commentsByTrace.get(trace.id) ?? [],
              },
            ],
            emptyScoreColumns,
          )[0];
        }
      }
    })(),
  );
};
