import {
  filterOperators,
  FTS_MATCH_OPERATOR,
  type FtsMatchOperator,
} from "../../../interfaces/filters";
import { clickhouseCompliantRandomCharacters } from "../../repositories/clickhouse";
import { escapeSqlLikePattern } from "../../utils/sqlLike";
import { quoteIdent } from "../schemaUtils";

/**
 * GreptimeDB filter -> SQL translator (04-read-path.md, P0b). Mirrors the `Filter`/`FilterList`
 * contract of `queries/clickhouse-sql/clickhouse-filter.ts` so the read path can swap the dialect
 * while keeping the same factory + repository call sites, but emits GreptimeDB (MySQL-wire) SQL:
 *
 *   - `:named` placeholders (the read pool sets `namedPlaceholders: true`), not CH `{v: Type}`.
 *   - all identifiers backtick-quoted (GreptimeDB reserves id/name/value/key/type/level/timestamp/
 *     input/output/...).
 *   - `contains`/`starts with`/`ends with` -> `LIKE` (CH used position/startsWith/endsWith).
 *   - the FTS match operator -> indexed `matches_term(col, ?)` (requires a FULLTEXT column, 0004).
 *   - metadata / tags filters -> **project-scoped, soft-delete-aware `EXISTS` semi-joins** over the
 *     `*_metadata` / `*_tags` EAV subtables (CH used map/array access on the same row). The subquery
 *     MUST carry `project_id` to avoid cross-project id collisions (tenant isolation).
 */

export type GreptimeOperator =
  | (typeof filterOperators)[keyof typeof filterOperators][number]
  | "!="
  | FtsMatchOperator;

export interface CompiledFilter {
  query: string;
  params: Record<string, unknown>;
}

export interface GreptimeFilter {
  apply(): CompiledFilter;
  table: string;
  tablePrefix?: string;
  operator: GreptimeOperator;
  field: string;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const uid = () => clickhouseCompliantRandomCharacters();

const isBareIdentifier = (s: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);

/**
 * Qualified, quoted column reference: `t`.`name` (prefix is an alias, left unquoted).
 * A non-bare `field` is an already-qualified SQL expression (e.g. a rollup column ref like
 * `o.latency_milliseconds / 1000`) and is emitted verbatim — quoting it would corrupt the SQL.
 */
const col = (tablePrefix: string | undefined, field: string): string =>
  isBareIdentifier(field)
    ? `${tablePrefix ? `${tablePrefix}.` : ""}${quoteIdent(field)}`
    : field;

const likeContains = (v: string) => `%${escapeSqlLikePattern(v)}%`;
const likeStarts = (v: string) => `${escapeSqlLikePattern(v)}%`;
const likeEnds = (v: string) => `%${escapeSqlLikePattern(v)}`;

/** EAV subtable name for a projection table (`traces` -> `traces_metadata` / `traces_tags`). */
const metadataTable = (projectionTable: string) =>
  `${projectionTable}_metadata`;
const tagsTable = (projectionTable: string) => `${projectionTable}_tags`;

/**
 * Build a project-scoped EXISTS over an EAV subtable, correlated to the outer projection row.
 * `outer` is the outer alias (or table name) holding `project_id` + `id`. `inner` predicates are
 * already-quoted/parameterised conditions on the subtable alias `m`.
 */
const eavExists = (opts: {
  eavTable: string;
  outer: string;
  innerPredicate: string;
  negate?: boolean;
}): string => {
  const m = "m";
  const sub =
    `SELECT 1 FROM ${quoteIdent(opts.eavTable)} ${m} ` +
    `WHERE ${m}.${quoteIdent("project_id")} = ${opts.outer}.${quoteIdent("project_id")} ` +
    `AND ${m}.${quoteIdent("entity_id")} = ${opts.outer}.${quoteIdent("id")} ` +
    `AND ${opts.innerPredicate} ` +
    `AND ${m}.${quoteIdent("is_deleted")} = false`;
  return `${opts.negate ? "NOT EXISTS" : "EXISTS"} (${sub})`;
};

const outerAlias = (f: { tablePrefix?: string; table: string }) =>
  f.tablePrefix ?? f.table;

// ---------------------------------------------------------------------------
// scalar-column filters
// ---------------------------------------------------------------------------

export class StringFilter implements GreptimeFilter {
  public table: string;
  public field: string;
  public value: string;
  public operator:
    | (typeof filterOperators)["string"][number]
    | FtsMatchOperator;
  public tablePrefix?: string;
  public emptyEqualsNull?: boolean;
  /** Column carries a FULLTEXT index (0004): the FTS match operator uses matches_term. */
  public fullTextIndexed?: boolean;

  constructor(opts: {
    table: string;
    field: string;
    operator: (typeof filterOperators)["string"][number] | FtsMatchOperator;
    value: string;
    tablePrefix?: string;
    emptyEqualsNull?: boolean;
    fullTextIndexed?: boolean;
  }) {
    this.table = opts.table;
    this.field = opts.field;
    this.value = opts.value;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
    this.emptyEqualsNull = opts.emptyEqualsNull;
    this.fullTextIndexed = opts.fullTextIndexed;
  }

  apply(): CompiledFilter {
    const ref = col(this.tablePrefix, this.field);
    const v = `v${uid()}`;

    // '' ≡ NULL: an empty-value equality/affix match also matches NULL.
    if (this.emptyEqualsNull && this.value === "") {
      if (
        this.operator === "=" ||
        this.operator === "contains" ||
        this.operator === "starts with" ||
        this.operator === "ends with"
      ) {
        return { query: `(${ref} = '' OR ${ref} IS NULL)`, params: {} };
      }
    }

    let query: string;
    let bound: string = this.value;
    switch (this.operator) {
      case "=":
        query = `${ref} = :${v}`;
        break;
      case "contains":
        query = `${ref} LIKE :${v}`;
        bound = likeContains(this.value);
        break;
      case "does not contain":
        query = `(${ref} IS NULL OR ${ref} NOT LIKE :${v})`;
        bound = likeContains(this.value);
        break;
      case "starts with":
        query = `${ref} LIKE :${v}`;
        bound = likeStarts(this.value);
        break;
      case "ends with":
        query = `${ref} LIKE :${v}`;
        bound = likeEnds(this.value);
        break;
      case FTS_MATCH_OPERATOR:
        // Indexed whole-term match on a FULLTEXT column; fall back to a scan-prone LIKE otherwise.
        query = this.fullTextIndexed
          ? `matches_term(${ref}, :${v})`
          : `lower(${ref}) LIKE lower(:${v})`;
        if (!this.fullTextIndexed) bound = likeContains(this.value);
        break;
      default:
        throw new Error(`Unsupported string operator: ${this.operator}`);
    }

    // '' ≡ NULL: "does not contain" already null-guards above; keep affixes empty-safe.
    return { query, params: { [v]: bound } };
  }
}

export class NumberFilter implements GreptimeFilter {
  public table: string;
  public field: string;
  public value: number;
  public operator: (typeof filterOperators)["number"][number] | "!=";
  public tablePrefix?: string;

  constructor(opts: {
    table: string;
    field: string;
    operator: (typeof filterOperators)["number"][number] | "!=";
    value: number;
    tablePrefix?: string;
  }) {
    this.table = opts.table;
    this.field = opts.field;
    this.value = opts.value;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
  }

  apply(): CompiledFilter {
    const v = `v${uid()}`;
    return {
      query: `${col(this.tablePrefix, this.field)} ${this.operator} :${v}`,
      params: { [v]: this.value },
    };
  }
}

export class DateTimeFilter implements GreptimeFilter {
  public table: string;
  public field: string;
  public value: Date;
  public operator: (typeof filterOperators)["datetime"][number];
  public tablePrefix?: string;

  constructor(opts: {
    table: string;
    field: string;
    operator: (typeof filterOperators)["datetime"][number];
    value: Date;
    tablePrefix?: string;
  }) {
    this.table = opts.table;
    this.field = opts.field;
    this.value = opts.value;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
  }

  apply(): CompiledFilter {
    const v = `v${uid()}`;
    // GreptimeDB coerces a 'YYYY-MM-DD HH:MM:SS.mmm' string literal to TIMESTAMP in comparisons
    // (verified). Bind ms-precision; mysql2's Date serialization would drop milliseconds.
    return {
      query: `${col(this.tablePrefix, this.field)} ${this.operator} :${v}`,
      params: { [v]: greptimeTimestampLiteral(this.value) },
    };
  }
}

export const greptimeTimestampLiteral = (d: Date): string =>
  d.toISOString().replace("T", " ").replace("Z", "");

export class BooleanFilter implements GreptimeFilter {
  public table: string;
  public field: string;
  public value: boolean;
  public operator: (typeof filterOperators)["boolean"][number];
  public tablePrefix?: string;

  constructor(opts: {
    table: string;
    field: string;
    operator: (typeof filterOperators)["boolean"][number];
    value: boolean;
    tablePrefix?: string;
  }) {
    this.table = opts.table;
    this.field = opts.field;
    this.value = opts.value;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
  }

  apply(): CompiledFilter {
    const v = `v${uid()}`;
    const op = this.operator === "<>" ? "!=" : this.operator;
    return {
      query: `${col(this.tablePrefix, this.field)} ${op} :${v}`,
      params: { [v]: this.value },
    };
  }
}

export class NullFilter implements GreptimeFilter {
  public table: string;
  public field: string;
  public operator: (typeof filterOperators)["null"][number];
  public tablePrefix?: string;
  public emptyEqualsNull?: boolean;

  constructor(opts: {
    table: string;
    field: string;
    operator: (typeof filterOperators)["null"][number];
    tablePrefix?: string;
    emptyEqualsNull?: boolean;
  }) {
    this.table = opts.table;
    this.field = opts.field;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
    this.emptyEqualsNull = opts.emptyEqualsNull;
  }

  apply(): CompiledFilter {
    const ref = col(this.tablePrefix, this.field);
    if (this.emptyEqualsNull) {
      return {
        query:
          this.operator === "is null"
            ? `(${ref} = '' OR ${ref} IS NULL)`
            : `(${ref} != '' AND ${ref} IS NOT NULL)`,
        params: {},
      };
    }
    return { query: `${ref} ${this.operator}`, params: {} };
  }
}

export class StringOptionsFilter implements GreptimeFilter {
  public table: string;
  public field: string;
  public values: string[];
  public operator: (typeof filterOperators.stringOptions)[number];
  public tablePrefix?: string;
  public emptyEqualsNull?: boolean;

  constructor(opts: {
    table: string;
    field: string;
    operator: (typeof filterOperators.stringOptions)[number];
    values: string[];
    tablePrefix?: string;
    emptyEqualsNull?: boolean;
  }) {
    this.table = opts.table;
    this.field = opts.field;
    this.values = opts.values;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
    this.emptyEqualsNull = opts.emptyEqualsNull;
  }

  apply(): CompiledFilter {
    const ref = col(this.tablePrefix, this.field);
    // Expand to explicit named params; mysql2 does not splice arrays into named IN-lists.
    const params: Record<string, unknown> = {};
    const placeholders = this.values.map((val) => {
      const name = `v${uid()}`;
      params[name] = val;
      return `:${name}`;
    });
    const list = placeholders.join(", ");
    const hasEmpty = this.emptyEqualsNull && this.values.includes("");

    let query =
      this.values.length === 0
        ? this.operator === "any of"
          ? "1 = 0"
          : "1 = 1"
        : this.operator === "any of"
          ? `${ref} IN (${list})`
          : `${ref} NOT IN (${list})`;

    if (hasEmpty && this.operator === "any of") {
      query = `(${query} OR ${ref} IS NULL)`;
    } else if (this.emptyEqualsNull && this.operator === "none of") {
      const guard = hasEmpty ? `${ref} IS NOT NULL` : `${ref} != ''`;
      query = `(${query} AND ${guard})`;
    }
    return { query, params };
  }
}

// ---------------------------------------------------------------------------
// EAV-backed filters (metadata / tags)
// ---------------------------------------------------------------------------

/** metadata key/value filter -> EXISTS over `<table>_metadata`. */
export class StringObjectFilter implements GreptimeFilter {
  public table: string;
  public field: string;
  public key: string;
  public value: string;
  public operator:
    | (typeof filterOperators)["stringObject"][number]
    | FtsMatchOperator;
  public tablePrefix?: string;

  constructor(opts: {
    table: string;
    field: string;
    operator:
      | (typeof filterOperators)["stringObject"][number]
      | FtsMatchOperator;
    key: string;
    value: string;
    tablePrefix?: string;
  }) {
    this.table = opts.table;
    this.field = opts.field;
    this.key = opts.key;
    this.value = opts.value;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
  }

  apply(): CompiledFilter {
    const k = `k${uid()}`;
    const v = `v${uid()}`;
    const mValue = `m.${quoteIdent("value")}`;
    const params: Record<string, unknown> = { [k]: this.key };

    let valueCond: string;
    let bound: string = this.value;
    // 'does not contain' is the negation of a positive containment EXISTS, so that a row with NO
    // entry for the key still matches (parity with ClickHouse's map path metadata[key], where a
    // missing key yields '' and is treated as "does not contain"). EXISTS(key AND value NOT LIKE)
    // would instead require the key to be present.
    let negate = false;
    switch (this.operator) {
      case "=":
        valueCond = `${mValue} = :${v}`;
        break;
      case "contains":
        valueCond = `${mValue} LIKE :${v}`;
        bound = likeContains(this.value);
        break;
      case "does not contain":
        valueCond = `${mValue} LIKE :${v}`;
        bound = likeContains(this.value);
        negate = true;
        break;
      case "starts with":
        valueCond = `${mValue} LIKE :${v}`;
        bound = likeStarts(this.value);
        break;
      case "ends with":
        valueCond = `${mValue} LIKE :${v}`;
        bound = likeEnds(this.value);
        break;
      case FTS_MATCH_OPERATOR:
        valueCond = `matches_term(${mValue}, :${v})`;
        break;
      default:
        throw new Error(`Unsupported metadata operator: ${this.operator}`);
    }
    params[v] = bound;

    const query = eavExists({
      eavTable: metadataTable(this.table),
      outer: outerAlias(this),
      innerPredicate: `m.${quoteIdent("key")} = :${k} AND (${valueCond})`,
      negate,
    });
    return { query, params };
  }
}

/** numeric metadata key/value filter -> EXISTS with CAST(value AS DOUBLE). */
export class NumberObjectFilter implements GreptimeFilter {
  public table: string;
  public field: string;
  public key: string;
  public value: number;
  public operator: (typeof filterOperators)["numberObject"][number] | "!=";
  public tablePrefix?: string;

  constructor(opts: {
    table: string;
    field: string;
    operator: (typeof filterOperators)["numberObject"][number] | "!=";
    key: string;
    value: number;
    tablePrefix?: string;
  }) {
    this.table = opts.table;
    this.field = opts.field;
    this.key = opts.key;
    this.value = opts.value;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
  }

  apply(): CompiledFilter {
    const k = `k${uid()}`;
    const v = `v${uid()}`;
    const query = eavExists({
      eavTable: metadataTable(this.table),
      outer: outerAlias(this),
      innerPredicate:
        `m.${quoteIdent("key")} = :${k} AND ` +
        `CAST(m.${quoteIdent("value")} AS DOUBLE) ${this.operator} :${v}`,
    });
    return { query, params: { [k]: this.key, [v]: this.value } };
  }
}

/** tags filter -> EXISTS over `<table>_tags`. */
export class ArrayOptionsFilter implements GreptimeFilter {
  public table: string;
  public field: string;
  public values: string[];
  public operator: (typeof filterOperators.arrayOptions)[number];
  public tablePrefix?: string;

  constructor(opts: {
    table: string;
    field: string;
    operator: (typeof filterOperators.arrayOptions)[number];
    values: string[];
    tablePrefix?: string;
  }) {
    this.table = opts.table;
    this.field = opts.field;
    this.values = opts.values;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
  }

  apply(): CompiledFilter {
    const params: Record<string, unknown> = {};
    const tagCol = `m.${quoteIdent("tag")}`;
    const eavTable = tagsTable(this.table);
    const outer = outerAlias(this);

    const bindList = (): string =>
      this.values
        .map((val) => {
          const name = `v${uid()}`;
          params[name] = val;
          return `:${name}`;
        })
        .join(", ") || "NULL";

    switch (this.operator) {
      case "any of":
        return {
          query: eavExists({
            eavTable,
            outer,
            innerPredicate: `${tagCol} IN (${bindList()})`,
          }),
          params,
        };
      case "none of":
        return {
          query: eavExists({
            eavTable,
            outer,
            innerPredicate: `${tagCol} IN (${bindList()})`,
            negate: true,
          }),
          params,
        };
      case "all of": {
        // every tag must exist: AND of one EXISTS per tag
        const conjuncts = this.values.map((val) => {
          const name = `v${uid()}`;
          params[name] = val;
          return eavExists({
            eavTable,
            outer,
            innerPredicate: `${tagCol} = :${name}`,
          });
        });
        return {
          query: conjuncts.length ? `(${conjuncts.join(" AND ")})` : "true",
          params,
        };
      }
      default:
        throw new Error(`Unsupported tags operator: ${this.operator}`);
    }
  }
}

// ---------------------------------------------------------------------------
// score-grain filters (rollup score columns: scores_avg / score_categories)
// ---------------------------------------------------------------------------

/**
 * How a rollup score filter correlates the `scores` table to the outer projection row. The CH read
 * path materialised a `scores_avg` / `score_categories` array in a CTE and filtered it; on the merged
 * projection we instead emit a correlated EXISTS over `scores` per the entity grain. `outerColumn` is
 * the outer projection column (e.g. `id` for traces/observations, `session_id` for sessions) and
 * `scoresColumn` is the `scores` column that links to it.
 */
export type ScoreGrain = {
  scoresColumn: "trace_id" | "session_id" | "observation_id";
  outerPrefix: string;
  outerColumn: string;
};

const SCORE_GRAIN_ALIAS = "cs";

/** Project-scoped, soft-delete-aware correlated EXISTS over `scores` for a score-grain filter. */
const scoreGrainExists = (opts: {
  grain: ScoreGrain;
  innerPredicate: string;
  groupHaving?: string;
  negate?: boolean;
}): string => {
  const cs = SCORE_GRAIN_ALIAS;
  const { grain } = opts;
  const sub =
    `SELECT 1 FROM ${quoteIdent("scores")} ${cs} ` +
    `WHERE ${cs}.${quoteIdent("project_id")} = ${grain.outerPrefix}.${quoteIdent("project_id")} ` +
    `AND ${cs}.${quoteIdent(grain.scoresColumn)} = ${grain.outerPrefix}.${quoteIdent(grain.outerColumn)} ` +
    `AND ${opts.innerPredicate} ` +
    `AND ${cs}.${quoteIdent("is_deleted")} = false` +
    (opts.groupHaving ? ` ${opts.groupHaving}` : "");
  return `${opts.negate ? "NOT EXISTS" : "EXISTS"} (${sub})`;
};

/**
 * Categorical score filter (`score_categories`). Replaces CH `hasAny(score_categories, ['key:value'])`:
 * a trace/session/observation matches when it has a CATEGORICAL score named `key` whose `string_value`
 * is one of `values`. `none of` is the negated EXISTS (missing score also matches). An empty value
 * list short-circuits (`any of` -> nothing, `none of` -> everything).
 */
export class CategoryOptionsFilter implements GreptimeFilter {
  public table = "scores";
  public field: string;
  public key: string;
  public values: string[];
  public operator: (typeof filterOperators.categoryOptions)[number];
  public tablePrefix?: string;
  public grain: ScoreGrain;

  constructor(opts: {
    key: string;
    values: string[];
    operator: (typeof filterOperators.categoryOptions)[number];
    grain: ScoreGrain;
  }) {
    this.key = opts.key;
    this.values = opts.values;
    this.operator = opts.operator;
    this.grain = opts.grain;
    this.field = opts.grain.scoresColumn;
    this.tablePrefix = opts.grain.outerPrefix;
  }

  apply(): CompiledFilter {
    if (this.values.length === 0) {
      return {
        query: this.operator === "any of" ? "1 = 0" : "1 = 1",
        params: {},
      };
    }
    const cs = SCORE_GRAIN_ALIAS;
    const k = `k${uid()}`;
    const params: Record<string, unknown> = { [k]: this.key };
    const placeholders = this.values.map((val) => {
      const name = `v${uid()}`;
      params[name] = val;
      return `:${name}`;
    });
    const inner =
      `${cs}.${quoteIdent("name")} = :${k} AND ` +
      `${cs}.${quoteIdent("data_type")} = 'CATEGORICAL' AND ` +
      `${cs}.${quoteIdent("string_value")} IN (${placeholders.join(", ")})`;
    return {
      query: scoreGrainExists({
        grain: this.grain,
        innerPredicate: inner,
        negate: this.operator === "none of",
      }),
      params,
    };
  }
}

/**
 * Numeric score filter (`scores_avg`). Replaces CH `arrayFilter(x -> x.1 = key AND x.2 OP v, scores_avg)`:
 * a trace/session/observation matches when its NUMERIC/BOOLEAN score named `key` has a grouped average
 * value satisfying the operator (`GROUP BY name HAVING avg(value) OP v`), mirroring the CH CTE's
 * per-name `avg(value)`.
 */
export class ScoreNumberObjectFilter implements GreptimeFilter {
  public table = "scores";
  public field: string;
  public key: string;
  public value: number;
  public operator: (typeof filterOperators)["numberObject"][number] | "!=";
  public tablePrefix?: string;
  public grain: ScoreGrain;

  constructor(opts: {
    key: string;
    value: number;
    operator: (typeof filterOperators)["numberObject"][number] | "!=";
    grain: ScoreGrain;
  }) {
    this.key = opts.key;
    this.value = opts.value;
    this.operator = opts.operator;
    this.grain = opts.grain;
    this.field = opts.grain.scoresColumn;
    this.tablePrefix = opts.grain.outerPrefix;
  }

  apply(): CompiledFilter {
    const cs = SCORE_GRAIN_ALIAS;
    const k = `k${uid()}`;
    const v = `v${uid()}`;
    const inner =
      `${cs}.${quoteIdent("name")} = :${k} AND ` +
      `${cs}.${quoteIdent("data_type")} IN ('NUMERIC', 'BOOLEAN')`;
    const having =
      `GROUP BY ${cs}.${quoteIdent("name")} ` +
      `HAVING avg(${cs}.${quoteIdent("value")}) ${this.operator} :${v}`;
    return {
      query: scoreGrainExists({
        grain: this.grain,
        innerPredicate: inner,
        groupHaving: having,
      }),
      params: { [k]: this.key, [v]: this.value },
    };
  }
}

/**
 * Reverse correlation: filter `scores` rows by a `dataset_run_items` column (the run/dataset/item a
 * score's trace belongs to). Replaces the CH `scores ⋈ dataset_run_items_rmt` join used by
 * `mapScoresColumnsTable` (`datasetRunItemRunIds` / `datasetId` / `datasetItemIds`). The outer row is
 * a `scores` row (prefix `outerPrefix`); the EXISTS is project-scoped and soft-delete-aware, correlated
 * by `(project_id, trace_id)`. `none of` is the negated EXISTS.
 */
export type DatasetRunItemsGrain = {
  driColumn: "dataset_run_id" | "dataset_id" | "dataset_item_id";
  outerPrefix: string;
};

const DRI_GRAIN_ALIAS = "drif";

export class DatasetRunItemsOptionsFilter implements GreptimeFilter {
  public table = "dataset_run_items";
  public field: string;
  public values: string[];
  public operator: (typeof filterOperators.stringOptions)[number];
  public tablePrefix?: string;
  public grain: DatasetRunItemsGrain;

  constructor(opts: {
    values: string[];
    operator: (typeof filterOperators.stringOptions)[number];
    grain: DatasetRunItemsGrain;
  }) {
    this.values = opts.values;
    this.operator = opts.operator;
    this.grain = opts.grain;
    this.field = opts.grain.driColumn;
    this.tablePrefix = opts.grain.outerPrefix;
  }

  apply(): CompiledFilter {
    if (this.values.length === 0) {
      return {
        query: this.operator === "any of" ? "1 = 0" : "1 = 1",
        params: {},
      };
    }
    const d = DRI_GRAIN_ALIAS;
    const outer = this.grain.outerPrefix;
    const params: Record<string, unknown> = {};
    const placeholders = this.values.map((val) => {
      const name = `v${uid()}`;
      params[name] = val;
      return `:${name}`;
    });
    const sub =
      `SELECT 1 FROM ${quoteIdent("dataset_run_items")} ${d} ` +
      `WHERE ${d}.${quoteIdent("project_id")} = ${outer}.${quoteIdent("project_id")} ` +
      `AND ${d}.${quoteIdent("trace_id")} = ${outer}.${quoteIdent("trace_id")} ` +
      `AND ${d}.${quoteIdent(this.grain.driColumn)} IN (${placeholders.join(", ")}) ` +
      `AND ${d}.${quoteIdent("is_deleted")} = false`;
    return {
      query: `${this.operator === "none of" ? "NOT EXISTS" : "EXISTS"} (${sub})`,
      params,
    };
  }
}

// ---------------------------------------------------------------------------
// FilterList
// ---------------------------------------------------------------------------

export class FilterList {
  private filters: GreptimeFilter[];

  constructor(filters: GreptimeFilter[] = []) {
    this.filters = filters;
  }

  push(...filter: GreptimeFilter[]) {
    this.filters.push(...filter);
  }

  find(predicate: (filter: GreptimeFilter) => boolean) {
    return this.filters.find(predicate);
  }

  filter(predicate: (filter: GreptimeFilter) => boolean) {
    return new FilterList(this.filters.filter(predicate));
  }

  some(predicate: (filter: GreptimeFilter) => boolean) {
    return this.filters.some(predicate);
  }

  forEach(callback: (filter: GreptimeFilter) => void) {
    this.filters.forEach(callback);
  }

  length() {
    return this.filters.length;
  }

  public apply(): CompiledFilter {
    if (this.filters.length === 0) return { query: "", params: {} };
    const compiled = this.filters.map((f) => f.apply());
    return {
      query: compiled.map((c) => c.query).join(" AND "),
      params: compiled.reduce(
        (acc, c) => ({ ...acc, ...c.params }),
        {} as Record<string, unknown>,
      ),
    };
  }
}
