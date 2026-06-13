import { type z } from "zod";
import {
  type QueryType,
  type ViewDeclarationType,
  type granularities,
  type metricAggregations,
  query as queryModel,
  getValidAggregationsForMeasureType,
} from "../types";
import {
  BYTYPE_SQL,
  assertGreptimeSupportedField,
  getGreptimeViewDeclaration,
} from "../greptimeDataModel";
import { InvalidRequestError } from "../../../errors";
import { createGreptimeFilterFromFilterState } from "../../../server/greptime/sql/factory";
import {
  FilterList,
  greptimeTimestampLiteral,
} from "../../../server/greptime/sql/greptime-filter";
import { type GreptimeColumnMapping } from "../../../server/greptime/sql/columnMappings";
import {
  greptimeTimeBucket,
  resolveAutoGranularity,
} from "../../../server/greptime/sql/time-bucket";
import {
  greptimeQuantile,
  PERCENTILE_P,
} from "../../../server/greptime/sql/quantile";
import { selectJsonColumn } from "../../../server/greptime/sql/rowContract";
import { quoteIdent } from "../../../server/greptime/schemaUtils";
import { notDeleted } from "../../../server/repositories/greptime/queryHelpers";

/**
 * GreptimeDB dashboard query builder (04-read-path.md, P3). Consumes the same `QueryType` as the
 * ClickHouse engine but emits GreptimeDB SQL (`:named` params) over the merged projection via
 * `greptimeDataModel`. See that file for the measure/dimension SQL contract.
 *
 * Levels:
 *  - SINGLE-level when no applied measure is relation-backed (the base row IS the entity, or only
 *    1:1 parent dimensions are joined): one SELECT applies the user aggregation directly.
 *  - TWO-level when any applied measure joins a 1:N child relation (observations/scores under a
 *    trace, scores under an observation): inner SELECT groups the join per base entity (relation
 *    measures = their inner aggregate, leaf measures / dims collapsed with `min()` since they are
 *    invariant per entity); outer SELECT applies the user aggregation across entities.
 *
 * Two query shapes need app-side post-processing in `greptimeQueryExecutor` (returned in
 * `postProcess`): dynamic-key by-type (costByType/usageByType) and time-series gap-fill.
 */

const PREFIX_TABLE: Record<string, string> = {
  t: "traces",
  o: "observations",
  s: "scores",
  sc: "scores",
};

// obs↔trace and score↔trace lookbacks (absolute lower bound on the child time dimension, matching
// the P1/P2 read paths). Keyed by relation table name.
const RELATION_LOOKBACK_MS: Record<string, number> = {
  observations: 2 * 24 * 60 * 60 * 1000, // OBSERVATIONS_TO_TRACE_INTERVAL = 2 DAY
  scores: 60 * 60 * 1000, // TRACE_TO_SCORES_INTERVAL = 1 HOUR
};

type Granularity = z.infer<typeof granularities>;
type Aggregation = z.infer<typeof metricAggregations>;

export type PostProcess = {
  // Gap-fill descriptor (present when the query buckets by time).
  timeFill?: {
    granularity: Exclude<Granularity, "auto">;
    fromTimestamp: string;
    toTimestamp: string;
    dimensionAliases: string[];
    metricAliases: string[];
  };
  // Dynamic by-type expansion descriptor (present for costByType/usageByType queries). When set, the
  // built query is a per-entity raw fetch (no aggregation); the executor expands the JSON map.
  byType?: {
    jsonColumn: "usage_details" | "cost_details";
    keyDimensionAlias: string; // costType | usageType
    valueMetricAlias: string; // sum_costByType | sum_usageByType
    aggregation: Aggregation;
    groupDimensionAliases: string[]; // non-by-type dimensions
    hasTime: boolean;
  };
};

export type GreptimeBuildResult = {
  query: string;
  parameters: Record<string, unknown>;
  postProcess: PostProcess;
};

type AppliedDimension = {
  field: string;
  alias: string;
  sql: string;
  relationTable?: string;
  isByType: boolean;
  byTypeJson?: "usage_details" | "cost_details";
};

type AppliedMeasure = {
  measure: string;
  alias: string;
  sql: string;
  aggregation: Aggregation;
  relationTable?: string;
  isByType: boolean;
  requiresDimension?: string;
};

const baseAlias = (view: ViewDeclarationType): string => {
  switch (view.baseCte) {
    case "traces":
      return "t";
    case "observations":
      return "o";
    case "scores":
      return "s";
    default:
      return view.baseCte;
  }
};

const translateAggregation = (agg: Aggregation, expr: string): string => {
  switch (agg) {
    case "sum":
      return `sum(${expr})`;
    case "avg":
      return `avg(${expr})`;
    case "max":
      return `max(${expr})`;
    case "min":
      return `min(${expr})`;
    case "count":
      return `count(*)`;
    case "uniq":
      return `count(distinct ${expr})`;
    case "p50":
    case "p75":
    case "p90":
    case "p95":
    case "p99":
      return greptimeQuantile(PERCENTILE_P[agg], expr);
    case "histogram":
      throw new InvalidRequestError(
        "histogram aggregation is not yet supported on GreptimeDB dashboards (P3 follow-up).",
      );
    default: {
      const exhaustive: never = agg;
      throw new InvalidRequestError(`Invalid aggregation: ${exhaustive}`);
    }
  }
};

/** Build the per-view filter column mapping from the GreptimeDB view declaration. */
const buildFilterMappings = (
  view: ViewDeclarationType,
): GreptimeColumnMapping[] => {
  const mappings: GreptimeColumnMapping[] = [];
  const base = baseAlias(view);
  const plainCol = /^(\w+)\.(\w+)$/;

  for (const [field, dim] of Object.entries(view.dimensions)) {
    if (dim.sql === BYTYPE_SQL) continue;
    const m = plainCol.exec(dim.sql);
    if (!m) continue; // expression dimensions (date_format(...)) are not directly filterable
    const [, prefix, col] = m;
    mappings.push({
      uiTableName: dim.alias ?? field,
      uiTableId: dim.alias ?? field,
      greptimeTableName: PREFIX_TABLE[prefix] ?? view.baseCte,
      greptimeSelect: col,
      queryPrefix: prefix,
    });
  }

  // time dimension + metadata (EAV) on the base table
  mappings.push({
    uiTableName: view.timeDimension,
    uiTableId: view.timeDimension,
    greptimeTableName: view.baseCte,
    greptimeSelect: view.timeDimension,
    queryPrefix: base,
  });
  mappings.push({
    uiTableName: "metadata",
    uiTableId: "metadata",
    greptimeTableName: view.baseCte,
    greptimeSelect: "metadata",
    queryPrefix: base,
  });
  // segment columns (e.g. data_type) are applied as constant filters via the factory
  for (const segment of view.segments) {
    if (mappings.some((m) => m.uiTableId === segment.column)) continue;
    mappings.push({
      uiTableName: segment.column,
      uiTableId: segment.column,
      greptimeTableName: view.baseCte,
      greptimeSelect: segment.column,
      queryPrefix: base,
    });
  }
  return mappings;
};

const resolveDimensions = (
  query: QueryType,
  view: ViewDeclarationType,
): AppliedDimension[] =>
  query.dimensions.map((d) => {
    assertGreptimeSupportedField(d.field);
    const dim = view.dimensions[d.field];
    if (!dim) {
      throw new InvalidRequestError(
        `Invalid dimension '${d.field}' for view '${query.view}'. Must be one of ${Object.keys(view.dimensions).join(", ")}`,
      );
    }
    const isByType = dim.sql === BYTYPE_SQL;
    return {
      field: d.field,
      alias: dim.alias ?? d.field,
      sql: dim.sql,
      relationTable: dim.relationTable,
      isByType,
      byTypeJson: isByType
        ? dim.pairExpand?.valuesSql.includes("cost_details")
          ? "cost_details"
          : "usage_details"
        : undefined,
    };
  });

const resolveMeasures = (
  query: QueryType,
  view: ViewDeclarationType,
): AppliedMeasure[] =>
  query.metrics.map((metric) => {
    assertGreptimeSupportedField(metric.measure);
    const measure = view.measures[metric.measure];
    if (!measure) {
      throw new InvalidRequestError(
        `Invalid measure '${metric.measure}' for view '${query.view}'. Must be one of ${Object.keys(view.measures).join(", ")}`,
      );
    }
    const validAggs = getValidAggregationsForMeasureType(measure.type);
    if (!validAggs.includes(metric.aggregation)) {
      throw new InvalidRequestError(
        `Aggregation '${metric.aggregation}' is not valid for measure '${metric.measure}' (type ${measure.type}). Valid: ${validAggs.join(", ")}`,
      );
    }
    return {
      measure: metric.measure,
      alias: measure.alias ?? metric.measure,
      sql: measure.sql,
      aggregation: metric.aggregation,
      relationTable: measure.relationTable,
      isByType: measure.sql === BYTYPE_SQL,
      requiresDimension: measure.requiresDimension,
    };
  });

const timeBucketExpr = (
  query: QueryType,
  view: ViewDeclarationType,
): { expr: string; granularity: Exclude<Granularity, "auto"> } | null => {
  if (!query.timeDimension) return null;
  const granularity =
    query.timeDimension.granularity === "auto"
      ? resolveAutoGranularity(
          new Date(query.fromTimestamp).getTime(),
          new Date(query.toTimestamp).getTime(),
        )
      : query.timeDimension.granularity;
  const colRef = `${baseAlias(view)}.${view.timeDimension}`;
  return { expr: greptimeTimeBucket(granularity, colRef), granularity };
};

export class GreptimeQueryBuilder {
  build(query: QueryType, projectId: string): GreptimeBuildResult {
    const parsed = queryModel.safeParse(query);
    if (!parsed.success) {
      throw new InvalidRequestError(
        `Invalid query: ${JSON.stringify(parsed.error.issues)}`,
      );
    }

    const view = getGreptimeViewDeclaration(query.view);
    const dims = resolveDimensions(query, view);
    const measures = resolveMeasures(query, view);
    const bucket = timeBucketExpr(query, view);

    const byTypeMeasure = measures.find((m) => m.isByType);
    if (byTypeMeasure) {
      return this.buildByType(query, projectId, view, dims, measures, bucket);
    }

    return this.buildAggregate(query, projectId, view, dims, measures, bucket);
  }

  // -------------------------------------------------------------------------
  // standard filters + relation joins (shared)
  // -------------------------------------------------------------------------
  private buildFromAndWhere(
    query: QueryType,
    projectId: string,
    view: ViewDeclarationType,
    relationTables: Set<string>,
  ): { fromClause: string; parameters: Record<string, unknown> } {
    const base = baseAlias(view);
    const mappings = buildFilterMappings(view);
    const parameters: Record<string, unknown> = {};

    // user filters + standard project_id / time-range / segment filters via the factory
    const standardFilters = [
      {
        column: "project_id",
        type: "string" as const,
        operator: "=" as const,
        value: projectId,
      },
      {
        column: view.timeDimension,
        type: "datetime" as const,
        operator: ">=" as const,
        value: new Date(query.fromTimestamp),
      },
      {
        column: view.timeDimension,
        type: "datetime" as const,
        operator: "<=" as const,
        value: new Date(query.toTimestamp),
      },
    ];
    const projectIdMapping: GreptimeColumnMapping = {
      uiTableName: "project_id",
      uiTableId: "project_id",
      greptimeTableName: view.baseCte,
      greptimeSelect: "project_id",
      queryPrefix: base,
    };

    const filterList = new FilterList(
      createGreptimeFilterFromFilterState(
        [...standardFilters, ...view.segments, ...query.filters],
        [...mappings, projectIdMapping],
      ),
    );
    const applied = filterList.apply();
    Object.assign(parameters, applied.params);

    let fromClause = `FROM ${quoteIdent(view.baseCte)} AS ${base}`;

    for (const rel of relationTables) {
      const relation = view.tableRelations[rel];
      if (!relation) {
        throw new InvalidRequestError(`Invalid relation table: ${rel}`);
      }
      const relAlias =
        rel === "scores" ? "sc" : baseAliasForTable(relation.name);
      fromClause +=
        `\nINNER JOIN ${quoteIdent(relation.name)} AS ${relAlias} ` +
        `${relation.joinConditionSql} AND ${notDeleted(relAlias)}`;
      // relation time-range lower bound (lookback) keeps the child scan bounded
      const lookback = RELATION_LOOKBACK_MS[relation.name] ?? 0;
      const from = greptimeTimestampLiteral(
        new Date(new Date(query.fromTimestamp).getTime() - lookback),
      );
      const to = greptimeTimestampLiteral(new Date(query.toTimestamp));
      fromClause +=
        ` AND ${relAlias}.${relation.timeDimension} >= '${from}'` +
        ` AND ${relAlias}.${relation.timeDimension} <= '${to}'`;
    }

    fromClause += ` WHERE ${applied.query} AND ${notDeleted(base)}`;
    return { fromClause, parameters };
  }

  private collectRelations(
    dims: AppliedDimension[],
    measures: AppliedMeasure[],
  ): Set<string> {
    const set = new Set<string>();
    for (const d of dims) if (d.relationTable) set.add(d.relationTable);
    for (const m of measures) if (m.relationTable) set.add(m.relationTable);
    return set;
  }

  // -------------------------------------------------------------------------
  // aggregate query (single- or two-level)
  // -------------------------------------------------------------------------
  private buildAggregate(
    query: QueryType,
    projectId: string,
    view: ViewDeclarationType,
    dims: AppliedDimension[],
    measures: AppliedMeasure[],
    bucket: { expr: string; granularity: Exclude<Granularity, "auto"> } | null,
  ): GreptimeBuildResult {
    const base = baseAlias(view);
    const relations = this.collectRelations(dims, measures);
    const needsTwoLevel = measures.some((m) => m.relationTable);
    const { fromClause, parameters } = this.buildFromAndWhere(
      query,
      projectId,
      view,
      relations,
    );

    const dimAliases = dims.map((d) => d.alias);
    const metricAliases = measures.map((m) => `${m.aggregation}_${m.alias}`);
    if (bucket) {
      metricAliases.push(...[]); // metrics tracked separately
    }
    const groupOutAliases = [
      ...dimAliases,
      ...(bucket ? ["time_dimension"] : []),
    ];

    let sql: string;
    if (!needsTwoLevel) {
      // single-level
      const selectParts: string[] = [];
      for (const d of dims)
        selectParts.push(`${d.sql} AS ${quoteIdent(d.alias)}`);
      if (bucket) selectParts.push(`${bucket.expr} AS time_dimension`);
      for (const m of measures) {
        selectParts.push(
          `${translateAggregation(m.aggregation, m.sql)} AS ${quoteIdent(`${m.aggregation}_${m.alias}`)}`,
        );
      }
      if (measures.length === 0) selectParts.push("count(*) AS count");
      const groupBy = [
        ...dims.map((d) => d.sql),
        ...(bucket ? ["time_dimension"] : []),
      ];
      sql =
        `SELECT ${selectParts.join(", ")} ${fromClause}` +
        (groupBy.length ? ` GROUP BY ${groupBy.join(", ")}` : "");
    } else {
      // two-level
      const innerParts: string[] = [`${base}.project_id`, `${base}.id`];
      for (const d of dims) {
        if (d.relationTable) {
          // parent (1:1) dims are invariant per entity -> min() collapses fan-out
          innerParts.push(`min(${d.sql}) AS ${quoteIdent(d.alias)}`);
        } else {
          innerParts.push(`min(${d.sql}) AS ${quoteIdent(d.alias)}`);
        }
      }
      if (bucket) innerParts.push(`min(${bucket.expr}) AS time_dimension`);
      for (const m of measures) {
        const innerExpr = m.relationTable
          ? m.sql // already an aggregate over the child relation
          : m.sql === "*"
            ? "count(*)"
            : `min(${m.sql})`;
        innerParts.push(`${innerExpr} AS ${quoteIdent(m.alias)}`);
      }
      const inner =
        `SELECT ${innerParts.join(", ")} ${fromClause} ` +
        `GROUP BY ${base}.project_id, ${base}.id`;

      const outerParts: string[] = [];
      for (const d of dims) outerParts.push(quoteIdent(d.alias));
      if (bucket) outerParts.push("time_dimension");
      for (const m of measures) {
        outerParts.push(
          `${translateAggregation(m.aggregation, quoteIdent(m.alias))} AS ${quoteIdent(`${m.aggregation}_${m.alias}`)}`,
        );
      }
      if (measures.length === 0) outerParts.push("count(*) AS count");
      sql =
        `SELECT ${outerParts.join(", ")} FROM (${inner}) AS inner_q` +
        (groupOutAliases.length
          ? ` GROUP BY ${groupOutAliases.map(quoteIdent).join(", ")}`
          : "");
    }

    sql += this.orderLimit(query, dims, measures, bucket);

    const postProcess: PostProcess = {};
    if (bucket) {
      postProcess.timeFill = {
        granularity: bucket.granularity,
        fromTimestamp: query.fromTimestamp,
        toTimestamp: query.toTimestamp,
        dimensionAliases: dimAliases,
        metricAliases:
          measures.length > 0
            ? measures.map((m) => `${m.aggregation}_${m.alias}`)
            : ["count"],
      };
    }
    return { query: sql, parameters, postProcess };
  }

  // -------------------------------------------------------------------------
  // by-type raw fetch (executor expands JSON map app-side)
  // -------------------------------------------------------------------------
  private buildByType(
    query: QueryType,
    projectId: string,
    view: ViewDeclarationType,
    dims: AppliedDimension[],
    measures: AppliedMeasure[],
    bucket: { expr: string; granularity: Exclude<Granularity, "auto"> } | null,
  ): GreptimeBuildResult {
    const base = baseAlias(view);
    const byTypeMeasure = measures.find((m) => m.isByType)!;
    const keyDim = dims.find((d) => d.isByType);
    if (!keyDim) {
      throw new InvalidRequestError(
        `Measure '${byTypeMeasure.measure}' requires the '${byTypeMeasure.requiresDimension}' dimension.`,
      );
    }
    const jsonColumn = keyDim.byTypeJson ?? "usage_details";
    const groupDims = dims.filter((d) => !d.isByType);
    const relations = this.collectRelations(groupDims, []);
    const { fromClause, parameters } = this.buildFromAndWhere(
      query,
      projectId,
      view,
      relations,
    );

    // per-entity raw fetch: id + group dims + bucket + the JSON map (app-side expanded)
    const selectParts: string[] = [`${base}.id AS __entity_id`];
    for (const d of groupDims)
      selectParts.push(`${d.sql} AS ${quoteIdent(d.alias)}`);
    if (bucket) selectParts.push(`${bucket.expr} AS time_dimension`);
    selectParts.push(selectJsonColumn(jsonColumn, { tablePrefix: base }));

    const sql = `SELECT ${selectParts.join(", ")} ${fromClause}`;

    return {
      query: sql,
      parameters,
      postProcess: {
        byType: {
          jsonColumn,
          keyDimensionAlias: keyDim.alias,
          valueMetricAlias: `${byTypeMeasure.aggregation}_${byTypeMeasure.alias}`,
          aggregation: byTypeMeasure.aggregation,
          groupDimensionAliases: groupDims.map((d) => d.alias),
          hasTime: Boolean(bucket),
        },
        ...(bucket
          ? {
              timeFill: {
                granularity: bucket.granularity,
                fromTimestamp: query.fromTimestamp,
                toTimestamp: query.toTimestamp,
                dimensionAliases: [
                  keyDim.alias,
                  ...groupDims.map((d) => d.alias),
                ],
                metricAliases: [
                  `${byTypeMeasure.aggregation}_${byTypeMeasure.alias}`,
                ],
              },
            }
          : {}),
      },
    };
  }

  // -------------------------------------------------------------------------
  // order by + limit
  // -------------------------------------------------------------------------
  private orderLimit(
    query: QueryType,
    dims: AppliedDimension[],
    measures: AppliedMeasure[],
    bucket: { expr: string; granularity: Exclude<Granularity, "auto"> } | null,
  ): string {
    const validAliases = new Set<string>([
      ...dims.map((d) => d.alias),
      ...(bucket ? ["time_dimension"] : []),
      ...measures.map((m) => `${m.aggregation}_${m.alias}`),
      ...(measures.length === 0 ? ["count"] : []),
    ]);

    let order: Array<{ field: string; direction: string }> = [];
    if (query.orderBy && query.orderBy.length > 0) {
      for (const o of query.orderBy) {
        if (!validAliases.has(o.field)) {
          throw new InvalidRequestError(
            `Invalid orderBy field '${o.field}'. Must be one of ${[...validAliases].join(", ")}`,
          );
        }
      }
      order = query.orderBy;
    } else if (bucket) {
      order = [{ field: "time_dimension", direction: "asc" }];
    } else if (measures.length > 0) {
      const m = measures[0];
      order = [{ field: `${m.aggregation}_${m.alias}`, direction: "desc" }];
    } else if (dims.length > 0) {
      order = [{ field: dims[0].alias, direction: "asc" }];
    }

    let clause = order.length
      ? ` ORDER BY ${order.map((o) => `${quoteIdent(o.field)} ${o.direction === "desc" ? "DESC" : "ASC"}`).join(", ")}`
      : "";

    const rowLimit = query.chartConfig?.row_limit;
    if (rowLimit) clause += ` LIMIT ${rowLimit}`;
    return clause;
  }
}

const baseAliasForTable = (table: string): string => {
  switch (table) {
    case "traces":
      return "t";
    case "observations":
      return "o";
    case "scores":
      return "sc";
    default:
      return table;
  }
};
