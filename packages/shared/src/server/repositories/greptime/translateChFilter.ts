import {
  ArrayOptionsFilter as ChArrayOptionsFilter,
  BooleanFilter as ChBooleanFilter,
  CategoryOptionsFilter as ChCategoryOptionsFilter,
  DateTimeFilter as ChDateTimeFilter,
  type Filter as ChFilter,
  type FilterList as ChFilterList,
  NullFilter as ChNullFilter,
  NumberFilter as ChNumberFilter,
  NumberObjectFilter as ChNumberObjectFilter,
  StringFilter as ChStringFilter,
  StringObjectFilter as ChStringObjectFilter,
  StringOptionsFilter as ChStringOptionsFilter,
} from "../../queries";
import {
  ArrayOptionsFilter,
  BooleanFilter,
  CategoryOptionsFilter,
  DateTimeFilter,
  FilterList,
  type GreptimeFilter,
  NullFilter,
  NumberFilter,
  NumberObjectFilter,
  type ScoreGrain,
  ScoreNumberObjectFilter,
  StringFilter,
  StringObjectFilter,
  StringOptionsFilter,
} from "../../greptime/sql/greptime-filter";

/**
 * Translate a *compiled* ClickHouse `FilterList` (the kind the public-API web wrappers build via
 * `deriveFilters` and hand to the repository generators) onto the equivalent GreptimeDB `FilterList`
 * (04-read-path.md, P5). Promoted + generalised from the P4 daily-metrics `chToGreptimeFilter`.
 *
 * It is **field-routed, not blindly by-class** so it can never silently mis-translate a rollup-score
 * filter (Codex P5 review #3):
 *   - self-contained scalar/EAV classes (String/Number/DateTime/Boolean/Null/StringOptions/
 *     ArrayOptions/StringObject + metadata NumberObject) map 1:1 using the CH filter's own
 *     field/table/prefix/operator/value(s)/key.
 *   - rollup-score classes — CH `CategoryOptionsFilter` (`score_categories`) and a CH
 *     `NumberObjectFilter` on `scores_avg` — have no per-row column on the merged projection; they
 *     route to a correlated score-grain `EXISTS`. The grain is supplied by the **caller's entity**
 *     (a traces generator filters by `trace_id`, observations by `observation_id`), passed as
 *     `opts.scoreGrain`. With no grain in context they throw loud rather than mis-filter.
 *
 * The public-API simple-param surface only ever produces the self-contained classes; rollup-score
 * filters are reachable only via an advanced `?filter=` JSON on traces/observations and require the
 * caller to pass the entity grain.
 */

export type TranslateChFilterOptions = {
  /** Entity grain for rollup-score filters (`scores_avg` / `score_categories`). */
  scoreGrain?: ScoreGrain;
};

// Columns carrying a FULLTEXT index (migration 0004): the FTS match operator can use matches_term.
const FULLTEXT_COLUMNS: Record<string, ReadonlySet<string>> = {
  traces: new Set(["input", "output"]),
  observations: new Set(["input", "output"]),
};
const isFullTextColumn = (table: string, field: string): boolean =>
  FULLTEXT_COLUMNS[table]?.has(field) ?? false;

// Rollup-score column refs that only exist as a materialised array in the CH UI CTE.
const ROLLUP_SCORE_FIELDS = new Set(["scores_avg", "score_categories"]);

const requireGrain = (
  opts: TranslateChFilterOptions,
  filterName: string,
): ScoreGrain => {
  if (!opts.scoreGrain) {
    throw new Error(
      `Cannot translate rollup-score filter (${filterName}) to GreptimeDB without an entity scoreGrain; ` +
        `the caller must pass opts.scoreGrain (e.g. { scoresColumn: 'trace_id', outerPrefix: 't', outerColumn: 'id' }).`,
    );
  }
  return opts.scoreGrain;
};

/** Map one compiled ClickHouse filter onto its GreptimeDB equivalent. */
export const chFilterToGreptime = (
  f: ChFilter,
  opts: TranslateChFilterOptions = {},
): GreptimeFilter => {
  const table = f.clickhouseTable;
  const tablePrefix = f.tablePrefix;

  if (f instanceof ChStringFilter) {
    return new StringFilter({
      table,
      field: f.field,
      operator: f.operator,
      value: f.value,
      tablePrefix,
      emptyEqualsNull: f.emptyEqualsNull,
      fullTextIndexed: isFullTextColumn(table, f.field),
    });
  }
  if (f instanceof ChStringOptionsFilter) {
    return new StringOptionsFilter({
      table,
      field: f.field,
      operator: f.operator,
      values: f.values,
      tablePrefix,
      emptyEqualsNull: f.emptyEqualsNull,
    });
  }
  if (f instanceof ChArrayOptionsFilter) {
    return new ArrayOptionsFilter({
      table,
      field: f.field,
      operator: f.operator,
      values: f.values,
      tablePrefix,
    });
  }
  if (f instanceof ChDateTimeFilter) {
    return new DateTimeFilter({
      table,
      field: f.field,
      operator: f.operator,
      value: f.value,
      tablePrefix,
    });
  }
  if (f instanceof ChNumberFilter) {
    return new NumberFilter({
      table,
      field: f.field,
      operator: f.operator,
      value: f.value,
      tablePrefix,
    });
  }
  if (f instanceof ChBooleanFilter) {
    return new BooleanFilter({
      table,
      field: f.field,
      operator: f.operator,
      value: f.value,
      tablePrefix,
    });
  }
  if (f instanceof ChNullFilter) {
    return new NullFilter({
      table,
      field: f.field,
      operator: f.operator,
      tablePrefix,
      emptyEqualsNull: f.emptyEqualsNull,
    });
  }
  if (f instanceof ChStringObjectFilter) {
    // metadata key/value -> project-scoped EAV EXISTS over `<table>_metadata`.
    return new StringObjectFilter({
      table,
      field: f.field,
      operator: f.operator,
      key: f.key,
      value: f.value,
      tablePrefix,
    });
  }
  if (f instanceof ChNumberObjectFilter) {
    // `scores_avg` -> rollup score-grain EXISTS; any other field -> numeric metadata EAV EXISTS.
    if (ROLLUP_SCORE_FIELDS.has(f.field)) {
      return new ScoreNumberObjectFilter({
        key: f.key,
        value: f.value,
        operator: f.operator,
        grain: requireGrain(opts, "NumberObjectFilter[scores_avg]"),
      });
    }
    return new NumberObjectFilter({
      table,
      field: f.field,
      operator: f.operator,
      key: f.key,
      value: f.value,
      tablePrefix,
    });
  }
  if (f instanceof ChCategoryOptionsFilter) {
    // `score_categories` -> rollup score-grain EXISTS.
    return new CategoryOptionsFilter({
      key: f.key,
      values: f.values,
      operator: f.operator,
      grain: requireGrain(opts, "CategoryOptionsFilter"),
    });
  }

  throw new Error(
    `Unsupported ClickHouse filter for GreptimeDB translation: ${f.constructor.name}`,
  );
};

/** Translate an entire compiled ClickHouse `FilterList` to a GreptimeDB `FilterList`. */
export const translateChFilterList = (
  list: ChFilterList,
  opts: TranslateChFilterOptions = {},
): FilterList => {
  const out = new FilterList();
  list.forEach((f) => out.push(chFilterToGreptime(f, opts)));
  return out;
};
