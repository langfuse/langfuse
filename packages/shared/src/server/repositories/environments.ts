import { queryClickhouse } from "./clickhouse";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";

export type EnvironmentFilterProps = {
  projectId: string;
  minTimestamp?: Date;
};

export const getEnvironmentsForProjectAndTimeFilter = async (
  props: EnvironmentFilterProps,
) => {
  const { projectId, minTimestamp } = props;

  const query = `
    with environments as (
      (
        SELECT DISTINCT environment AS environment
        FROM traces t
        WHERE project_id = {projectId: String} 
        ${minTimestamp ? `AND timestamp >= {minTimestamp: DateTime64(3)}` : ""}
        LIMIT 100
      ) UNION ALL (
        SELECT DISTINCT environment AS environment
        FROM observations
        WHERE project_id = {projectId: String}
        ${minTimestamp ? `AND start_time >= {minTimestamp: DateTime64(3)}` : ""}
        LIMIT 100
      ) UNION ALL (
        SELECT DISTINCT environment AS environment
        FROM scores
        WHERE project_id = {projectId: String}
        ${minTimestamp ? `AND timestamp >= {minTimestamp: DateTime64(3)}` : ""}
        LIMIT 100
      )
    )
    select distinct environment from environments;
  `;

  return queryClickhouse<{
    environment: string;
  }>({
    query: query,
    params: {
      projectId: projectId,
      ...(minTimestamp
        ? { minTimestamp: convertDateToClickhouseDateTime(minTimestamp) }
        : {}),
    },
    tags: {
      feature: "tracing",
      type: "environment",
      kind: "analytic",
      projectId,
    },
  });
};
