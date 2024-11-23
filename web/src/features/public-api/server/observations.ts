import {
  FilterList,
  StringFilter,
  NumberFilter,
  type ObservationRecordReadType,
  queryClickhouse,
  convertObservationToView,
  DateTimeFilter,
} from "@langfuse/shared/src/server";

export type QueryType = {
  page: number;
  limit: number;
  projectId: string;
  userId?: string;
  name?: string;
  type?: string;
  parentObservationId?: string;
  fromStartTime?: string;
  toStartTime?: string;
  version?: string;
};

export const generateObservationsForPublicApi = async (props: QueryType) => {
  const filter = generateFilter(props).apply();

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
        event_ts
      FROM observations o
      WHERE project_id = {projectId: String}
      AND ${filter.query}
      ORDER BY event_ts desc
      LIMIT 1 by id, project_id
      ${props.limit !== undefined && props.page !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
      `;

  const records = await queryClickhouse<ObservationRecordReadType>({
    query,
    params: {
      ...filter.params,
      projectId: props.projectId,
      ...(props.limit !== undefined ? { limit: props.limit } : {}),
      ...(props.page !== undefined
        ? { offset: (props.page - 1) * props.limit }
        : {}),
    },
  });
  return records.map(convertObservationToView);
};

export const getObservationsCountForPublicApi = async (props: QueryType) => {
  const filter = generateFilter(props).apply();

  const query = `
        SELECT
        count() as count
      FROM observations
      WHERE project_id = {projectId: String}
      AND ${filter.query}
      `;

  const records = await queryClickhouse<{ count: string }>({
    query,
    params: { ...filter.params, projectId: props.projectId },
  });
  return records.map((record) => Number(record.count)).shift();
};

const generateFilter = (filter: QueryType) => {
  const observationsFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "observations",
      field: "project_id",
      operator: "=",
      value: filter.projectId,
    }),
  ]);

  const filterParams = [
    { key: "userId", field: "user_id" },
    { key: "name", field: "name" },
    { key: "type", field: "type" },
    { key: "parentObservationId", field: "parent_observation_id" },
    {
      key: "fromStartTime",
      field: "start_time",
      isDate: true,
      operator: ">=" as const,
    },
    {
      key: "toStartTime",
      field: "start_time",
      isDate: true,
      operator: "<=" as const,
    },
    { key: "version", field: "version" },
  ];

  filterParams.forEach((param) => {
    const value = filter[param.key as keyof QueryType];
    if (value) {
      observationsFilter.push(
        param.isDate
          ? new DateTimeFilter({
              clickhouseTable: "observations",
              field: param.field,
              operator: param.operator || ("=" as const),
              value: new Date(value),
            })
          : typeof value === "string"
            ? new StringFilter({
                clickhouseTable: "observations",
                field: param.field,
                operator: "=",
                value: value,
              })
            : new NumberFilter({
                clickhouseTable: "observations",
                field: param.field,
                operator: "=",
                value: value,
              }),
      );
    }
  });
  return observationsFilter;
};
