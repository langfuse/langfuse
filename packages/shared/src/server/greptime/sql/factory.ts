import { type EventsTableFilterState } from "../../../types";
import { InvalidRequestError } from "../../../errors";
import {
  findUiColumnMapping,
  type ColumnDefinition,
} from "../../../tableDefinitions";
import { logger } from "../../logger";
import { COMPATIBLE_FILTER_TYPES } from "../../queries/clickhouse-sql/filterTypeCompatibility";
import {
  StringFilter,
  DateTimeFilter,
  StringOptionsFilter,
  FilterList,
  NumberFilter,
  ArrayOptionsFilter,
  BooleanFilter,
  NumberObjectFilter,
  StringObjectFilter,
  NullFilter,
  CategoryOptionsFilter,
  ScoreNumberObjectFilter,
  type GreptimeFilter,
} from "./greptime-filter";
import { type GreptimeColumnMappings } from "./columnMappings";

/**
 * GreptimeDB filter factory (04-read-path.md, P1) — port of
 * `queries/clickhouse-sql/factory.ts:createFilterFromFilterState`. Same UI filter-state contract,
 * same column-type validation, but it resolves columns against a `GreptimeColumnMappings` and emits
 * GreptimeDB filter objects (`greptime-filter.ts`). The mapping's `greptimeTableName` /
 * `greptimeSelect` / `queryPrefix` feed the filter classes; metadata/tags route to the project-scoped
 * EAV `EXISTS` builders via `greptimeTableName`.
 *
 * `categoryOptions` (score-category rollup) is not supported here — it lives only in the
 * traces/observations rollup mappings (P2). It throws loudly rather than silently mis-filtering.
 */

const PHYSICAL_PROJECTION_TABLES = new Set([
  "traces",
  "observations",
  "scores",
]);

// Columns carrying a FULLTEXT index (migration 0004): the FTS match operator can use matches_term.
const FULLTEXT_COLUMNS: Record<string, ReadonlySet<string>> = {
  traces: new Set(["input", "output"]),
  observations: new Set(["input", "output"]),
};
const isFullTextColumn = (table: string, field: string): boolean =>
  FULLTEXT_COLUMNS[table]?.has(field) ?? false;

export const createGreptimeFilterFromFilterState = (
  filter: EventsTableFilterState,
  columnMapping: GreptimeColumnMappings,
  columnDefinitions?: ColumnDefinition[],
): GreptimeFilter[] => {
  const applicableFilters = filter.filter(
    (frontEndFilter) => frontEndFilter.type !== "positionInTrace",
  );

  return applicableFilters.map((frontEndFilter): GreptimeFilter => {
    const column = matchAndVerifyColumn(frontEndFilter, columnMapping);

    if (columnDefinitions && frontEndFilter.type !== "null") {
      const colDef = columnDefinitions.find((c) => c.id === column.uiTableId);
      if (colDef) {
        const compatible = COMPATIBLE_FILTER_TYPES[colDef.type];
        if (compatible && !compatible.includes(frontEndFilter.type)) {
          throw new InvalidRequestError(
            `Invalid filter type '${frontEndFilter.type}' for column '${frontEndFilter.column}'. Expected filter type '${colDef.type}'.`,
          );
        }
      }
    }

    const table = column.greptimeTableName;
    const field = column.greptimeSelect;
    const tablePrefix = column.queryPrefix;

    switch (frontEndFilter.type) {
      case "string":
        return new StringFilter({
          table,
          field,
          operator: frontEndFilter.operator,
          value: frontEndFilter.value,
          tablePrefix,
          emptyEqualsNull: column.emptyEqualsNull,
          fullTextIndexed: isFullTextColumn(table, field),
        });
      case "datetime":
        return new DateTimeFilter({
          table,
          field,
          operator: frontEndFilter.operator,
          value: frontEndFilter.value,
          tablePrefix,
        });
      case "stringOptions":
        return new StringOptionsFilter({
          table,
          field,
          operator: frontEndFilter.operator,
          values: frontEndFilter.value,
          tablePrefix,
          emptyEqualsNull: column.emptyEqualsNull,
        });
      case "number":
        return new NumberFilter({
          table,
          field,
          operator: frontEndFilter.operator,
          value: frontEndFilter.value,
          tablePrefix,
        });
      case "arrayOptions":
        return new ArrayOptionsFilter({
          table,
          field,
          operator: frontEndFilter.operator,
          values: frontEndFilter.value,
          tablePrefix,
        });
      case "boolean":
        return new BooleanFilter({
          table,
          field,
          value: frontEndFilter.value,
          operator: frontEndFilter.operator,
          tablePrefix,
        });
      case "numberObject":
        // Rollup numeric-score column (`scores_avg`) -> correlated score-grain EXISTS; a plain
        // metadata key/value column -> EAV EXISTS over `<table>_metadata`.
        if (column.scoreGrain) {
          return new ScoreNumberObjectFilter({
            key: frontEndFilter.key,
            operator: frontEndFilter.operator,
            value: frontEndFilter.value,
            grain: column.scoreGrain,
          });
        }
        return new NumberObjectFilter({
          table,
          field,
          key: frontEndFilter.key,
          operator: frontEndFilter.operator,
          value: frontEndFilter.value,
          tablePrefix,
        });
      case "stringObject":
        return new StringObjectFilter({
          table,
          field,
          operator: frontEndFilter.operator,
          key: frontEndFilter.key,
          value: frontEndFilter.value,
          tablePrefix,
        });
      case "null":
        return new NullFilter({
          table,
          field,
          operator: frontEndFilter.operator,
          tablePrefix,
          emptyEqualsNull: column.emptyEqualsNull,
        });
      case "categoryOptions":
        // score-category rollup filter -> correlated score-grain EXISTS over `scores`.
        if (!column.scoreGrain) {
          throw new InvalidRequestError(
            `categoryOptions filter requires a score-grain column mapping: ${frontEndFilter.column}`,
          );
        }
        return new CategoryOptionsFilter({
          key: frontEndFilter.key,
          values: frontEndFilter.value,
          operator: frontEndFilter.operator,
          grain: column.scoreGrain,
        });
      default:
        // eslint-disable-next-line no-case-declarations
        const exhaustiveCheck: never = frontEndFilter;
        logger.error(`Invalid filter type: ${JSON.stringify(exhaustiveCheck)}`);
        throw new InvalidRequestError(`Invalid filter type`);
    }
  });
};

const matchAndVerifyColumn = (
  filter: EventsTableFilterState[number],
  columnMapping: GreptimeColumnMappings,
) => {
  const column = findUiColumnMapping(columnMapping, filter.column);
  if (!column) {
    const errorMessage = `Column ${filter.column} does not match a GreptimeDB column mapping.`;
    logger.error(errorMessage, {
      filterColumn: filter.column,
      filterType: filter.type,
      availableColumns: columnMapping.map((c) => c.uiTableId ?? c.uiTableName),
    });
    throw new InvalidRequestError(errorMessage);
  }
  if (!PHYSICAL_PROJECTION_TABLES.has(column.greptimeTableName)) {
    throw new InvalidRequestError(
      `Invalid GreptimeDB table name: ${column.greptimeTableName}`,
    );
  }
  return column;
};

/** Port of `getProjectIdDefaultFilter`: pre-built `project_id = ?` filters per projection table. */
export function greptimeProjectIdDefaultFilter(
  projectId: string,
  opts: { tracesPrefix: string },
): {
  tracesFilter: FilterList;
  scoresFilter: FilterList;
  observationsFilter: FilterList;
} {
  return {
    tracesFilter: new FilterList([
      new StringFilter({
        table: "traces",
        field: "project_id",
        operator: "=",
        value: projectId,
        tablePrefix: opts.tracesPrefix,
      }),
    ]),
    scoresFilter: new FilterList([
      new StringFilter({
        table: "scores",
        field: "project_id",
        operator: "=",
        value: projectId,
      }),
    ]),
    observationsFilter: new FilterList([
      new StringFilter({
        table: "observations",
        field: "project_id",
        operator: "=",
        value: projectId,
      }),
    ]),
  };
}
