import { InvalidRequestError } from "../../../errors/InvalidRequestError";
import {
  query as querySchema,
  SCORES_LISTABLE_COUNT_VIEW,
  type QueryType,
  type ViewVersion,
} from "../types";
import { validateQuery } from "../validateQuery";
import { QueryBuilder } from "./queryBuilder";

/** Combines independently counted entities without joining away unattached scores. */
export async function buildBillableUnitsQuery({
  query,
  projectId,
  version,
  chartConfig,
  enableSingleLevelOptimization = false,
}: {
  query: QueryType;
  projectId: string;
  version: ViewVersion;
  chartConfig?: { bins?: number; row_limit?: number };
  enableSingleLevelOptimization?: boolean;
}): Promise<{ query: string; parameters: Record<string, unknown> }> {
  const parsed = querySchema.safeParse(query);
  if (!parsed.success) {
    throw new InvalidRequestError(`Invalid query: ${parsed.error.message}`);
  }
  const validation = validateQuery(parsed.data, version);
  if (!validation.valid) throw new InvalidRequestError(validation.reason);

  const hasTime = query.timeDimension !== null;
  const orderBy = query.orderBy?.length
    ? query.orderBy
    : [{ field: hasTime ? "time_dimension" : "count_count", direction: "asc" }];
  for (const order of orderBy) {
    if (
      order.field !== "count_count" &&
      !(hasTime && order.field === "time_dimension")
    ) {
      throw new InvalidRequestError(`Invalid orderBy field: ${order.field}.`);
    }
  }
  const rowLimit = chartConfig?.row_limit;
  if (
    rowLimit !== undefined &&
    (!Number.isInteger(rowLimit) || rowLimit < 1 || rowLimit > 1000)
  ) {
    throw new InvalidRequestError(
      "row_limit must be an integer between 1 and 1000.",
    );
  }

  const parameters: Record<string, unknown> = {};
  const childViews = [
    "traces",
    "observations",
    SCORES_LISTABLE_COUNT_VIEW,
  ] as const;
  const children = await Promise.all(
    childViews.map(async (view, index) => {
      const compiled = await new QueryBuilder(undefined, version).build(
        { ...parsed.data, view, chartConfig: undefined, orderBy: null },
        projectId,
        view !== "traces" && enableSingleLevelOptimization,
      );
      const prefix = `units${index}_`;
      for (const [name, value] of Object.entries(compiled.parameters)) {
        parameters[`${prefix}${name}`] = value;
      }
      const sql = compiled.query.replace(
        /\{(\w+)(\s*:)/g,
        (placeholder, name: string, suffix: string) =>
          Object.hasOwn(compiled.parameters, name)
            ? `{${prefix}${name}${suffix}`
            : placeholder,
      );
      return `SELECT ${hasTime ? "time_dimension, " : ""}count_count FROM (${sql})`;
    }),
  );

  return {
    query: `SELECT ${hasTime ? "time_dimension, " : ""}sum(count_count) AS count_count
      FROM (${children.join("\nUNION ALL\n")})
      ${hasTime ? "GROUP BY time_dimension" : ""}
      ORDER BY ${orderBy.map(({ field, direction }) => `${field} ${direction}`).join(", ")}
      ${rowLimit === undefined ? "" : `LIMIT ${rowLimit}`}`,
    parameters,
  };
}
