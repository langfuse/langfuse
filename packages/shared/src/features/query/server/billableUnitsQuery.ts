/**
 * The billable-units view's query on the query AST ({@link buildBillableUnits}):
 * its FROM and WHERE over the `billable_events` ledger, and its dimension and
 * measure selections, read from the entries of `billableUnitsRegistry.ts`.
 * The steps it shares with the other views are in `viewQuerySteps.ts`;
 * `QueryBuilder` dispatches the view here.
 */
import { expressionBuilder } from "kysely";
import { env } from "../../../env";
import { InvalidRequestError } from "../../../errors/InvalidRequestError";
import { type QueryType, type ViewVersion } from "../types";
import { billableUnitsView } from "../dataModel";
import { conditionFromFilter } from "../../../query-ast/filterStateCodec";
import { getClickhouseKysely } from "../../../server/query-ast/dialect";
import {
  aliasRef,
  uniq,
  utcDateTime,
} from "../../../server/query-ast/extensions";
import {
  billableUnitsDimension,
  billableUnitsFilterCondition,
  billableUnitsMeasure,
} from "./billableUnitsRegistry";
import {
  applyBucketingDimension,
  astBucketSelection,
  astSingleLevelMetrics,
  compileWithOuterClauses,
  dimensionAlias,
  mapDimensions,
  mapMetrics,
  validateAndProcessOrderBy,
  validateFilters,
  withFillRange,
} from "./viewQuerySteps";

/**
 * `QueryBuilder.build` for the billable-units view, on v1 and v2 alike.
 * Always single-level: the ledger has no per-unit id for the inner GROUP BY
 * of a two-level query, and the measure counts distinct units itself.
 * Tenancy adds the project condition. Throws `InvalidRequestError` for a
 * filter on a column outside `BILLABLE_UNITS_FILTER_COLUMNS`, and on a
 * deployment in `legacy` write mode.
 */
export function buildBillableUnits(
  query: QueryType,
  projectId: string,
  version: ViewVersion,
  chartConfig: { bins?: number; row_limit?: number } | undefined,
): { query: string; parameters: Record<string, unknown> } {
  // The ledger's observations and traces come from the events tables, which
  // a legacy deployment never writes, so it would count only scores.
  if (env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "legacy") {
    throw new InvalidRequestError(
      "Billable units are not available on this deployment",
    );
  }
  const view = billableUnitsView;
  const appliedDimensions = mapDimensions(query.dimensions, view);
  const appliedMetrics = mapMetrics(query.metrics, view);
  const bucket = applyBucketingDimension(query, view, version);
  validateFilters(query.filters, view);
  const orderBy = validateAndProcessOrderBy(
    query.orderBy,
    appliedDimensions,
    appliedMetrics,
    bucket,
  );
  const fill = withFillRange(
    bucket,
    query.fromTimestamp,
    query.toTimestamp,
    query.orderBy,
  );

  let source = getClickhouseKysely().selectFrom("billable_events as b");
  const sourceEb = expressionBuilder(source);
  for (const filter of query.filters) {
    source = source.where(
      billableUnitsFilterCondition(sourceEb, conditionFromFilter(filter)),
    );
  }
  source = source
    .where("b.ingested_at", ">=", utcDateTime(new Date(query.fromTimestamp)))
    .where("b.ingested_at", "<=", utcDateTime(new Date(query.toTimestamp)));

  // select <dimensions>, <bucket>, <aggregation>(<measure>) … from <source>
  return compileWithOuterClauses(
    projectId,
    {
      groupBy: [
        ...appliedDimensions.map((d) => aliasRef(dimensionAlias(d))),
        ...(bucket.type === "none"
          ? []
          : [aliasRef(bucket.bucketDimensionAlias)]),
      ],
      orderBy,
      fill,
      rowLimit: chartConfig?.row_limit,
    },
    source.select((eb) => [
      ...appliedDimensions.map((d) =>
        billableUnitsDimension(d.name)(eb).as(dimensionAlias(d)),
      ),
      ...astBucketSelection(bucket, "single", {
        time: eb.ref("b.ingested_at"),
        entity: (field) => billableUnitsDimension(field)(eb),
      }),
      ...(appliedMetrics.length === 0
        ? // A unit has a ledger row per ingestion, so `count(*)` would count rows.
          [uniq(billableUnitsMeasure("count")(eb)).as("count")]
        : // `count` and `uniq` both run as `uniq`: the view's
          // `aggregationOverrides` set `queryAggregation`.
          astSingleLevelMetrics(
            eb,
            appliedMetrics,
            (metric) => billableUnitsMeasure(metric.measureName)(eb),
            chartConfig?.bins,
          )),
    ]),
  );
}
