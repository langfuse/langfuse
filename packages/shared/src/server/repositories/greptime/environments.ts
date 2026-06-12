import { LISTABLE_SCORE_TYPES } from "../../../domain/scores";
import { greptimeQuery } from "../../greptime/client";
import { greptimeString } from "../../greptime/sql/rowContract";
import { greptimeInClause, greptimeTsParam, notDeleted } from "./queryHelpers";

/**
 * Distinct environments across traces/observations/scores (04-read-path.md). Replaces the ClickHouse
 * 3-way UNION; plain `DISTINCT` on the merged projections with the `is_deleted = false` guard.
 */
export const getEnvironmentsForProjectGreptime = async (props: {
  projectId: string;
  fromTimestamp?: Date;
}): Promise<{ environment: string }[]> => {
  const { projectId, fromTimestamp } = props;
  const ts = fromTimestamp ? greptimeTsParam(fromTimestamp) : undefined;
  const dataTypes = greptimeInClause("data_type", LISTABLE_SCORE_TYPES, "dt");

  const rows = await greptimeQuery<{ environment: string }>({
    query: `
      SELECT DISTINCT environment FROM traces
        WHERE project_id = :projectId AND ${notDeleted()}
        ${ts ? "AND timestamp >= :ts" : ""}
      UNION
      SELECT DISTINCT environment FROM observations
        WHERE project_id = :projectId AND ${notDeleted()}
        ${ts ? "AND start_time >= :ts" : ""}
      UNION
      SELECT DISTINCT environment FROM scores
        WHERE project_id = :projectId AND ${notDeleted()} AND ${dataTypes.sql}
        ${ts ? "AND timestamp >= :ts" : ""}`,
    params: { projectId, ...(ts ? { ts } : {}), ...dataTypes.params },
    readOnly: true,
  });

  const environments = new Set(
    rows
      .map((r) => greptimeString(r.environment))
      .filter((e): e is string => Boolean(e)),
  );
  environments.add("default");
  return Array.from(environments).map((environment) => ({ environment }));
};
