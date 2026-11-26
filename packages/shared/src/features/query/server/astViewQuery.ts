/**
 * The dashboard views that compile through the query AST, as declarations: an
 * {@link AstView} supplies what differs per view (filter lowering, relations,
 * level, FROM/JOIN/WHERE, the per-entry expressions, the inner select's
 * keys), and {@link defineAstView} runs the steps every such view shares, in
 * one order, so every view validates a query in the same order. Server-only:
 * the declarations the client reads stay in `dataModel.ts`.
 */
import type {
  AliasableExpression,
  AliasedExpression,
  DynamicReferenceBuilder,
  Expression,
  ExpressionBuilder,
  SelectQueryBuilder,
  StringReference,
} from "kysely";
import { getClickhouseKysely } from "../../../server/query-ast/dialect";
import { QueryCompileError } from "../../../server/query-ast/errors";
import type { QueryType, ViewDeclarationType, ViewVersion } from "../types";
import type { QueryLevel } from "./registryEntry";
import {
  type AppliedBucketingDimension,
  type AppliedDimensionType,
  type AppliedMetricType,
  type BucketValues,
  type FilterColumn,
  type TimeWindow,
  applyBucketingDimension,
  assertKnownRelationTables,
  astBucketSelection,
  astInnerMetrics,
  astOuterClauses,
  astOuterSelect,
  astSingleLevelMetrics,
  canUseSingleLevelQuery,
  collectRelationTables,
  compileWithOuterClauses,
  mapDimensions,
  mapMetrics,
  resolveFilterColumn,
  utcDateTime,
  validateAndProcessOrderBy,
  validateFilters,
  withRequiredDimensions,
} from "./viewQuerySteps";

/** What `QueryBuilder` knows about one `build` call besides the query and its view. */
export type BuildContext = {
  /** The project the query is compiled for (tenancy). */
  projectId: string;
  version: ViewVersion;
  /** Histogram bins and row limit. */
  chartConfig: { bins?: number; row_limit?: number } | undefined;
  /** The caller allows a single-level query where the view can build one. */
  enableSingleLevelOptimization: boolean;
  /** The project never updates its scores, so they are read without `FINAL`. */
  skipScoresFinal: boolean;
  /** Longest window the v2 traces view restricts to root events on; 0: every window. */
  rootEventConditionMaxWindowHours: number;
};

/** One element of a dashboard query's `filters`. */
export type QueryFilter = QueryType["filters"][number];

/**
 * What the hooks after filter lowering read: the query, the declaration it
 * was dispatched for, the call's context, its mapped dimensions (required
 * ones included), metrics and bucket, and its filters as the view lowered
 * them (`F`).
 */
export type ViewQueryInput<F> = {
  query: QueryType;
  view: ViewDeclarationType;
  ctx: BuildContext;
  dimensions: AppliedDimensionType[];
  metrics: AppliedMetricType[];
  bucket: AppliedBucketingDimension;
  filters: F[];
};

/** A dimension in a select: aliased, or a bare ARRAY JOIN alias (`costType`). */
export type DimensionSelection =
  | AliasedExpression<unknown, string>
  | DynamicReferenceBuilder<string>;

/**
 * What one AST view supplies. `DB` and `Base` type the view's source: the
 * relations it can read and the one every select reads (`e` for the events
 * views, `scores` for the score views); the hooks get the select's builder,
 * typed over `Base` alone, and an entry that reads a joined relation builds
 * a builder with that relation by name in its own module. `F` is a lowered
 * dashboard filter, `P` what the view's planning step hands its source.
 */
export type AstView<DB, Base extends keyof DB & string, F, P> = {
  /** The declarations it compiles; one in both version maps serves v1 and v2. */
  serves: readonly ViewDeclarationType[];
  /** `validateFilters` also takes `numberObject` metadata filters. */
  numericMetadata?: true;
  /**
   * One dashboard filter, on the column {@link resolveFilterColumn} resolved;
   * the view reads the condition from `filter`.
   */
  lowerFilter(
    column: FilterColumn,
    filter: QueryFilter,
    view: ViewDeclarationType,
  ): F;
  /**
   * The relations the query reads, each checked against the declaration;
   * absent: those of the output (`collectRelationTables`).
   */
  relations?(input: ViewQueryInput<F>): ReadonlySet<string>;
  /** The query's level, and what the view decides from its relations. */
  plan(input: ViewQueryInput<F> & { relations: ReadonlySet<string> }): {
    level: QueryLevel;
    plan: P;
  };
  /** FROM, JOINs, ARRAY JOIN and WHERE. */
  source(
    input: ViewQueryInput<F> & {
      relations: ReadonlySet<string>;
      plan: P;
      window: TimeWindow;
    },
  ): SelectQueryBuilder<DB, Base, {}>;
  /** A dimension in the single-level select or the inner select. */
  dimension(
    eb: ExpressionBuilder<DB, Base>,
    dimension: AppliedDimensionType,
    level: QueryLevel,
  ): DimensionSelection;
  /** A measure's value in the single-level select or the inner select. */
  measure(
    eb: ExpressionBuilder<DB, Base>,
    metric: AppliedMetricType,
    level: QueryLevel,
  ): AliasableExpression<unknown>;
  bucket(eb: ExpressionBuilder<DB, Base>): BucketValues;
  /**
   * The inner select of a two-level query, one row per entity: the keys it
   * selects and groups by, its alias, and the GROUP BY items a dimension
   * adds after the keys (`extraGroupBy`).
   */
  perRow: {
    keys: readonly StringReference<DB, Base>[];
    alias: string;
    extraGroupBy?: (
      dimensions: AppliedDimensionType[],
    ) => Expression<unknown>[];
  };
};

/** The level of a view whose only rule is `canUseSingleLevelQuery`, when the caller allows one. */
export const levelIfAllowed = ({
  ctx,
  dimensions,
  metrics,
}: ViewQueryInput<unknown>): QueryLevel =>
  ctx.enableSingleLevelOptimization &&
  canUseSingleLevelQuery(dimensions, metrics)
    ? "single"
    : "two";

/** `QueryBuilder.build` for the declarations of one AST view. */
export type AstViewBuilder = (
  query: QueryType,
  view: ViewDeclarationType,
  ctx: BuildContext,
) => { query: string; parameters: Record<string, unknown> };

/** An {@link AstView} as `QueryBuilder` dispatches to it. */
type DefinedAstView = {
  serves: readonly ViewDeclarationType[];
  build: AstViewBuilder;
};

/**
 * `spec` as the declarations it serves and their builder, whose type hides
 * the spec's type parameters. The builder runs, in order: map dimensions and
 * metrics, apply the bucket, add required dimensions, validate and lower the
 * filters, check the relations, plan, validate ORDER BY, build the source and
 * the outer clauses, select, compile. A two-level query selects
 * `<keys>, <dimensions>, <bucket>, <measures>` from the source, grouped by
 * the keys, under `perRow.alias`.
 */
export function defineAstView<DB, Base extends keyof DB & string, F, P>(
  spec: AstView<DB, Base, F, P>,
): DefinedAstView {
  return {
    serves: spec.serves,
    build: (query, view, ctx) => buildAstViewQuery(spec, query, view, ctx),
  };
}

/**
 * The builders of `astViews`, keyed by the declaration objects they serve.
 * Throws `QueryCompileError` for a declaration two of them serve.
 */
export function astViewsByDeclaration(
  astViews: readonly DefinedAstView[],
): ReadonlyMap<ViewDeclarationType, AstViewBuilder> {
  const byDeclaration = new Map<ViewDeclarationType, AstViewBuilder>();
  for (const { serves, build } of astViews) {
    for (const declaration of serves) {
      if (byDeclaration.has(declaration)) {
        throw new QueryCompileError(
          `View "${declaration.name}" is served by two AST views.`,
        );
      }
      byDeclaration.set(declaration, build);
    }
  }
  return byDeclaration;
}

function buildAstViewQuery<DB, Base extends keyof DB & string, F, P>(
  spec: AstView<DB, Base, F, P>,
  query: QueryType,
  view: ViewDeclarationType,
  ctx: BuildContext,
): { query: string; parameters: Record<string, unknown> } {
  const requestedDimensions = mapDimensions(query.dimensions, view);
  const metrics = mapMetrics(query.metrics, view);
  const bucket = applyBucketingDimension(query, view, ctx.version);
  const dimensions = withRequiredDimensions(requestedDimensions, metrics, view);
  validateFilters(query.filters, view, {
    numericMetadata: spec.numericMetadata,
  });
  const filters = query.filters.map((filter) =>
    spec.lowerFilter(resolveFilterColumn(view, filter.column), filter, view),
  );
  const input: ViewQueryInput<F> = {
    query,
    view,
    ctx,
    dimensions,
    metrics,
    bucket,
    filters,
  };
  const relations =
    spec.relations?.(input) ??
    collectRelationTables(dimensions, metrics, bucket);
  assertKnownRelationTables(view, relations);
  const { level, plan } = spec.plan({ ...input, relations });
  const orderBy = validateAndProcessOrderBy(
    query.orderBy,
    dimensions,
    metrics,
    bucket,
  );
  const window: TimeWindow = {
    from: utcDateTime(new Date(query.fromTimestamp)),
    to: utcDateTime(new Date(query.toTimestamp)),
  };
  const source = spec.source({ ...input, relations, plan, window });
  const outerClauses = astOuterClauses(
    query,
    dimensions,
    bucket,
    orderBy,
    ctx.chartConfig?.row_limit,
  );

  const selectInput = {
    source,
    dimensions,
    metrics,
    bucket,
    bins: ctx.chartConfig?.bins,
  };
  if (level === "single") {
    return compileWithOuterClauses(
      ctx.projectId,
      outerClauses,
      singleLevelSelect(spec, selectInput),
    );
  }
  return compileWithOuterClauses(
    ctx.projectId,
    outerClauses,
    twoLevelSelect(spec, selectInput),
  );
}

/** What both select shapes read: the view's source and the query's mapped output. */
type AstSelectInput<DB, Base extends keyof DB & string> = {
  source: SelectQueryBuilder<DB, Base, {}>;
  dimensions: AppliedDimensionType[];
  metrics: AppliedMetricType[];
  bucket: AppliedBucketingDimension;
  /** Histogram bins (`chartConfig.bins`). */
  bins: number | undefined;
};

/** One select over the source rows, aggregating them per output group. */
function singleLevelSelect<DB, Base extends keyof DB & string, F, P>(
  spec: AstView<DB, Base, F, P>,
  { source, dimensions, metrics, bucket, bins }: AstSelectInput<DB, Base>,
) {
  return source.select((eb) => [
    ...dimensions.map((d) => spec.dimension(eb, d, "single")),
    ...astBucketSelection(bucket, "single", spec.bucket(eb)),
    ...astSingleLevelMetrics(
      eb,
      metrics,
      (metric) => spec.measure(eb, metric, "single"),
      bins,
    ),
  ]);
}

/**
 * The outer select over an inner select of one row per entity
 * (`perRow.keys`), aggregating those rows per output group.
 */
function twoLevelSelect<DB, Base extends keyof DB & string, F, P>(
  spec: AstView<DB, Base, F, P>,
  { source, dimensions, metrics, bucket, bins }: AstSelectInput<DB, Base>,
) {
  const db = getClickhouseKysely();
  const keys = spec.perRow.keys.map((key) => db.dynamic.ref(key));
  const inner = source
    .select((eb) => [
      ...keys,
      ...dimensions.map((d) => spec.dimension(eb, d, "two")),
      ...astBucketSelection(bucket, "two", spec.bucket(eb)),
      ...astInnerMetrics(eb, metrics, (metric) =>
        spec.measure(eb, metric, "two"),
      ),
    ])
    .groupBy([...keys, ...(spec.perRow.extraGroupBy?.(dimensions) ?? [])]);
  return astOuterSelect(
    inner.as(spec.perRow.alias),
    dimensions,
    bucket,
    metrics,
    bins,
  );
}
