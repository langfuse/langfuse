import {
  BatchExportQueryType,
  FilterCondition,
  ScoreDataType,
  TimeFilter,
  TracingSearchType,
} from "@langfuse/shared";
import {
  getDistinctScoreNames,
  queryClickhouseStream,
  convertDateToClickhouseDateTime,
  logger,
  convertObservation,
  ObservationRecordReadType,
} from "@langfuse/shared/src/server";
import { Readable } from "stream";
import { env } from "../../env";
import { log } from "console";

export const getObservationStream = async ({
  projectId,
  filter,
  orderBy,
  cutoffCreatedAt,
  searchQuery,
  searchType,
  rowLimit = env.BATCH_EXPORT_ROW_LIMIT,
}: {
  projectId: string;
  cutoffCreatedAt: Date;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  rowLimit?: number;
} & BatchExportQueryType): Promise<Readable> => {
  const clickhouseConfigs = {
    request_timeout: 120_000,
  };

  const createdAtCutoffFilterCh = {
    column: "observations",
    operator: "<" as const,
    value: cutoffCreatedAt,
    type: "datetime" as const,
  };
  const distinctScoreNames = await getDistinctScoreNames({
    projectId,
    cutoffCreatedAt,
    filter: filter
      ? [...filter, createdAtCutoffFilterCh]
      : [createdAtCutoffFilterCh],
    isTimestampFilter: (filter: FilterCondition): filter is TimeFilter => {
      return filter.column === "Start Time" && filter.type === "datetime";
    },
    clickhouseConfigs,
  });

  const query = `
    SELECT
      id,
      trace_id,
      project_id,
      type,
      parent_observation_id,
      start_time,
      end_time,
      name,
      metadata,
      level,
      status_message,
      version,
      input, 
      output,
      provided_model_name,
      internal_model_id,
      model_parameters,
      provided_usage_details,
      usage_details,
      provided_cost_details,
      cost_details,
      total_cost,
      completion_start_time,
      prompt_id,
      prompt_name,
      prompt_version,
      created_at,
      updated_at,
      event_ts,
      groupArray(tuple(s.name, s.value, s.data_type, s.string_value)) as scores_avg
    FROM observations o
     LEFT JOIN scores s on s.observation_id=o.id and s.trace_id=o.trace_id and s.project_id=o.project_id
    WHERE project_id = {projectId: String}
    AND start_time <= {cutoffCreatedAt: DateTime64(3)}
  `;

  // Create an async generator from ClickHouse
  const asyncGenerator = queryClickhouseStream<
    ObservationRecordReadType & {
      scores_avg: {
        name: string;
        value: number;
        dataType: ScoreDataType;
        stringValue: string;
      }[];
    }
  >({
    query,
    params: {
      projectId,
      cutoffCreatedAt: convertDateToClickhouseDateTime(cutoffCreatedAt),
    },
    clickhouseConfigs,
    tags: {
      feature: "batch-export",
      type: "observation",
      kind: "export",
      projectId,
    },
  });

  // Convert async generator to Node.js Readable stream
  let recordsProcessed = 0;

  return Readable.from(
    (async function* () {
      for await (const row of asyncGenerator) {
        recordsProcessed++;

        logger.info(`Processed ${recordsProcessed} rows`);

        // Stop if we've hit the row limit
        if (rowLimit && recordsProcessed > rowLimit) {
          break;
        }

        yield {
          ...convertObservation(row),
          scores: row.scores_avg.map((score) => ({
            name: score.name,
            value: score.value,
            dataType: score.dataType,
            stringValue: score.stringValue,
          })),
        };
      }
    })(),
  );
};
