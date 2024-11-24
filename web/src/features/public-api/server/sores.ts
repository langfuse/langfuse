import {
  FilterList,
  StringFilter,
  NumberFilter,
  type ScoreRecordReadType,
  queryClickhouse,
  DateTimeFilter,
  ArrayOptionsFilter,
  convertToScore,
  StringOptionsFilter,
} from "@langfuse/shared/src/server";
import { z } from "zod";

export type ScoreQueryType = {
  page: number;
  limit: number;
  projectId: string;
  traceId?: string;
  userId?: string;
  name?: string;
  source?: string;
  fromTimestamp?: string;
  toTimestamp?: string;
  value?: number;
  scoreId?: string;
  configId?: string;
  queueId?: string;
  traceTags?: string | string[];
  operator?: string;
  scoreIds?: string[];
  dataType?: string;
};

export const generateScoresForPublicApi = async (props: ScoreQueryType) => {
  const { scoresFilter, tracesFilter } = generateScoreFilter(props);
  const appliedScoresFilter = scoresFilter.apply();
  const appliedTracesFilter = tracesFilter.apply();

  const query = `
        SELECT
          s.id,
          s.timestamp,
          s.name,
          s.value,
          s.string_value,
          s.author_user_id,
          s.project_id,
          s.created_at,  
          s.updated_at,  
          s.source,
          s.comment,
          s.data_type,
          s.config_id,
          s.queue_id,
          s.trace_id,
          s.observation_id,
          t.user_id,
          t.tags
      FROM scores s
        JOIN traces t FINAL ON s.trace_id = t.id AND s.project_id = t.project_id
      WHERE s.project_id = {projectId: String}
      AND t.project_id = {projectId: String}
      ${appliedScoresFilter.query ? `AND ${appliedScoresFilter.query}` : ""}
      ${tracesFilter.length() > 0 ? `AND ${appliedTracesFilter.query}` : ""}
      ORDER BY s.timestamp desc
      LIMIT 1 BY s.id, s.project_id
      ${props.limit !== undefined && props.page !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
      `;

  const records = await queryClickhouse<
    ScoreRecordReadType & { tags: string[]; user_id: string }
  >({
    query,
    params: {
      ...appliedScoresFilter.params,
      ...appliedTracesFilter.params,
      projectId: props.projectId,
      ...(props.limit !== undefined ? { limit: props.limit } : {}),
      ...(props.page !== undefined
        ? { offset: (props.page - 1) * props.limit }
        : {}),
    },
  });
  return records.map((record) => ({
    ...convertToScore(record),
    trace: { userId: record.user_id, tags: record.tags },
  }));
};

export const getScoresCountForPublicApi = async (props: ScoreQueryType) => {
  const { scoresFilter, tracesFilter } = generateScoreFilter(props);
  const appliedScoresFilter = scoresFilter.apply();
  const appliedTracesFilter = tracesFilter.apply();

  const query = `
      SELECT
        count() as count
      FROM scores s
        JOIN traces t FINAL ON s.trace_id = t.id AND s.project_id = t.project_id
      WHERE s.project_id = {projectId: String}
      AND t.project_id = {projectId: String}
      ${appliedScoresFilter.query ? `AND ${appliedScoresFilter.query}` : ""}
      ${tracesFilter.length() > 0 ? `AND ${appliedTracesFilter.query}` : ""}
      `;

  const records = await queryClickhouse<{ count: string }>({
    query,
    params: {
      ...appliedScoresFilter.params,
      ...appliedTracesFilter.params,
      projectId: props.projectId,
    },
  });
  return records.map((record) => Number(record.count)).shift();
};

const generateScoreFilter = (filter: ScoreQueryType) => {
  const scoresFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "scores",
      field: "project_id",
      operator: "=",
      value: filter.projectId,
    }),
  ]);

  const tracesFilter = new FilterList();

  const secureFilterOptions = [
    {
      key: "userId",
      field: "user_id",
      table: "traces",
      filterType: "StringFilter",
    },
    {
      key: "traceId",
      field: "trace_id",
      table: "scores",
      filterType: "StringFilter",
    },
    { key: "name", field: "name", table: "scores", filterType: "StringFilter" },
    {
      key: "source",
      field: "source",
      table: "scores",
      filterType: "StringFilter",
    },
    {
      key: "fromTimestamp",
      field: "timestamp",
      isDate: true,
      operator: ">=" as const,
      table: "scores",
      filterType: "DateTimeFilter",
    },
    {
      key: "toTimestamp",
      field: "timestamp",
      isDate: true,
      operator: "<" as const,
      table: "scores",
      filterType: "DateTimeFilter",
    },
    {
      key: "value",
      field: "value",
      table: "scores",
      filterType: "NumberFilter",
    },
    {
      key: "scoreIds",
      field: "id",
      table: "scores",
      filterType: "StringOptionsFilter",
    },
    {
      key: "configId",
      field: "config_id",
      table: "scores",
      filterType: "StringFilter",
    },
    {
      key: "queueId",
      field: "queue_id",
      table: "scores",
      filterType: "StringFilter",
    },
    {
      key: "traceTags",
      field: "tags",
      isArray: true,
      table: "traces",
      filterType: "ArrayOptionsFilter",
    },
    {
      key: "dataType",
      field: "data_type",
      table: "scores",
      filterType: "StringFilter",
    },
  ];

  secureFilterOptions.forEach((secureFilterOption) => {
    const value = filter[secureFilterOption.key as keyof ScoreQueryType];
    if (value) {
      let filterInstance;
      switch (secureFilterOption.filterType) {
        case "DateTimeFilter":
          const availableOperators = z.enum(["=", ">", "<", ">=", "<=", "!="]);
          typeof value === "string" &&
          secureFilterOption.operator &&
          availableOperators.safeParse(secureFilterOption.operator).success
            ? (filterInstance = new DateTimeFilter({
                clickhouseTable: secureFilterOption.table,
                field: secureFilterOption.field,
                operator: secureFilterOption.operator,
                value: new Date(value),
                tablePrefix: secureFilterOption.table === "scores" ? "s" : "t",
              }))
            : undefined;

          break;
        case "ArrayOptionsFilter":
          if (Array.isArray(value) || typeof value === "string") {
            filterInstance = new ArrayOptionsFilter({
              clickhouseTable: secureFilterOption.table,
              field: secureFilterOption.field,
              operator: "all of",
              values: Array.isArray(value) ? value : value.split(","),
              tablePrefix: secureFilterOption.table === "scores" ? "s" : "t",
            });
          }
          break;
        case "StringOptionsFilter":
          if (Array.isArray(value) || typeof value === "string") {
            filterInstance = new StringOptionsFilter({
              clickhouseTable: secureFilterOption.table,
              field: secureFilterOption.field,
              operator: "any of",
              values: Array.isArray(value) ? value : value.split(","),
              tablePrefix: secureFilterOption.table === "scores" ? "s" : "t",
            });
          }
          break;
        case "StringFilter":
          if (typeof value === "string") {
            filterInstance = new StringFilter({
              clickhouseTable: secureFilterOption.table,
              field: secureFilterOption.field,
              operator: "=",
              value: value,
              tablePrefix: secureFilterOption.table === "scores" ? "s" : "t",
            });
          }
          break;
        case "NumberFilter":
          const availableOperatorsNum = z.enum(["=", ">", "<", ">=", "<="]);
          const parsedOperator = availableOperatorsNum.safeParse(
            secureFilterOption.operator,
          );
          if (parsedOperator.success) {
            filterInstance = new NumberFilter({
              clickhouseTable: secureFilterOption.table,
              field: secureFilterOption.field,
              operator: parsedOperator.data,
              value: Number(value),
              tablePrefix: secureFilterOption.table === "scores" ? "s" : "t",
            });
          }
          break;
      }

      if (filterInstance) {
        if (secureFilterOption.table === "scores") {
          scoresFilter.push(filterInstance);
        } else if (secureFilterOption.table === "traces") {
          tracesFilter.push(filterInstance);
        }
      }
    }
  });

  return { scoresFilter, tracesFilter };
};
