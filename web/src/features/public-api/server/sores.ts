import {
  FilterList,
  StringFilter,
  NumberFilter,
  type ScoreRecordReadType,
  queryClickhouse,
  DateTimeFilter,
  ArrayOptionsFilter,
  convertToScore,
} from "@langfuse/shared/src/server";

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
      LIMIT 1 by s.id, s.project_id
      ${props.limit !== undefined && props.page !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
      `;

  console.log(query);

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

  const filterParams = [
    { key: "userId", field: "user_id", table: "traces" },
    { key: "traceId", field: "trace_id", table: "scores" },
    { key: "name", field: "name", table: "scores" },
    { key: "source", field: "source", table: "scores" },
    {
      key: "fromTimestamp",
      field: "timestamp",
      isDate: true,
      operator: ">=" as const,
      table: "scores",
    },
    {
      key: "toTimestamp",
      field: "timestamp",
      isDate: true,
      operator: "<" as const,
      table: "scores",
    },
    { key: "value", field: "value", table: "scores" },
    { key: "scoreId", field: "id", table: "scores" },
    { key: "configId", field: "config_id", table: "scores" },
    { key: "queueId", field: "queue_id", table: "scores" },
    { key: "traceTags", field: "tags", isArray: true, table: "traces" },
    { key: "dataType", field: "data_type", table: "scores" },
  ];

  filterParams.forEach((param) => {
    const value = filter[param.key as keyof ScoreQueryType];
    if (value) {
      let filterInstance;
      if (param.isDate && typeof value === "string") {
        filterInstance = new DateTimeFilter({
          clickhouseTable: param.table,
          field: param.field,
          operator: param.operator || ("=" as const),
          value: new Date(value),
          tablePrefix: param.table === "scores" ? "s" : "t",
        });
      } else if (typeof value === "string") {
        filterInstance = new StringFilter({
          clickhouseTable: param.table,
          field: param.field,
          operator: "=",
          value: value,
          tablePrefix: param.table === "scores" ? "s" : "t",
        });
      } else if (Array.isArray(value)) {
        filterInstance = new ArrayOptionsFilter({
          clickhouseTable: param.table,
          field: param.field,
          operator: "any of",
          values: value,
          tablePrefix: param.table === "scores" ? "s" : "t",
        });
      } else {
        filterInstance = new NumberFilter({
          clickhouseTable: param.table,
          field: param.field,
          operator: "=",
          value: value,
          tablePrefix: param.table === "scores" ? "s" : "t",
        });
      }

      if (param.table === "scores") {
        scoresFilter.push(filterInstance);
      } else if (param.table === "traces") {
        tracesFilter.push(filterInstance);
      }
    }
  });

  return { scoresFilter, tracesFilter };
};
