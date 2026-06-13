import {
  BatchExportFileFormat,
  FilterCondition,
  TimeFilter,
  TracingSearchType,
} from "@langfuse/shared";
import {
  getDistinctScoreNames,
  getScoresForObservations,
  streamObservationsForExport,
  enrichObservationWithModelData,
  createModelCache,
  observationsTableUiColumnDefinitions,
} from "@langfuse/shared/src/server";
import { Readable } from "stream";
import { env } from "../../env";
import {
  getChunkWithFlattenedScores,
  prepareScoresForOutput,
} from "./getDatabaseReadStream";
import { fetchCommentsForExport } from "./fetchCommentsForExport";

const DEFAULT_PAGE_SIZE = 1000;
const REDUCED_PAGE_SIZE = 200; // Smaller pages for JSON/JSONL which hold parsed objects in memory

export const getObservationStream = async (props: {
  projectId: string;
  cutoffCreatedAt: Date;
  filter: FilterCondition[] | null;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  rowLimit?: number;
  fileFormat?: BatchExportFileFormat;
}): Promise<Readable> => {
  const {
    projectId,
    cutoffCreatedAt,
    filter = [],
    searchQuery,
    searchType,
    rowLimit = env.BATCH_EXPORT_ROW_LIMIT,
  } = props;

  const isCsv = props.fileFormat === BatchExportFileFormat.CSV;
  const pageSize = isCsv ? DEFAULT_PAGE_SIZE : REDUCED_PAGE_SIZE;
  const maybeParse = <T>(v: T): T => {
    if (isCsv || typeof v !== "string") return v;
    try {
      return JSON.parse(v) as T;
    } catch {
      return v;
    }
  };

  // Drop trace-level filters: the GreptimeDB observation projection scan filters on observation columns.
  const observationOnlyFilters = (filter ?? []).filter((f) => {
    const columnDef = observationsTableUiColumnDefinitions.find(
      (col) => col.uiTableName === f.column || col.uiTableId === f.column,
    );
    return columnDef?.clickhouseTableName !== "traces";
  });

  const distinctScoreNames = await getDistinctScoreNames({
    projectId,
    cutoffCreatedAt,
    filter: observationOnlyFilters,
    isTimestampFilter: (f: FilterCondition): f is TimeFilter =>
      f.column === "Start Time" && f.type === "datetime",
  });
  const emptyScoreColumns = distinctScoreNames.reduce(
    (acc, name) => ({ ...acc, [name]: null }),
    {} as Record<string, null>,
  );

  const modelCache = createModelCache(projectId);

  return Readable.from(
    (async function* () {
      for await (const page of streamObservationsForExport({
        projectId,
        filter: observationOnlyFilters,
        cutoffCreatedAt,
        searchQuery,
        searchType,
        rowLimit,
        pageSize,
      })) {
        const observationIds = page.map((o) => o.id);
        const [scores, commentsByObservation] = await Promise.all([
          getScoresForObservations({
            projectId,
            observationIds,
            excludeMetadata: true,
          }),
          fetchCommentsForExport(projectId, "OBSERVATION", observationIds),
        ]);

        const scoresByObs = new Map<string, typeof scores>();
        for (const score of scores) {
          if (!score.observationId) continue;
          const list = scoresByObs.get(score.observationId) ?? [];
          list.push(score);
          scoresByObs.set(score.observationId, list);
        }

        for (const obs of page) {
          const model = await modelCache.getModel(obs.internalModelId);
          const modelData = enrichObservationWithModelData(model);
          const outputScores = prepareScoresForOutput(
            (scoresByObs.get(obs.id) ?? []).map((s) => ({
              name: s.name,
              value: s.value,
              dataType: s.dataType,
              stringValue: s.stringValue,
            })),
          );

          yield getChunkWithFlattenedScores(
            [
              {
                ...obs,
                input: maybeParse(obs.input),
                output: maybeParse(obs.output),
                toolDefinitionsCount: null,
                toolCallsCount: null,
                ...modelData,
                scores: outputScores,
                comments: commentsByObservation.get(obs.id) ?? [],
              },
            ],
            emptyScoreColumns,
          )[0];
        }
      }
    })(),
  );
};
