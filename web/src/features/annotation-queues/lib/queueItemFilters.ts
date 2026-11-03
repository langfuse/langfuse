import {
  type ColumnDefinition,
  type FilterCondition,
  type ScoreConfigDomain,
} from "@langfuse/shared";
import {
  resolveQueueItemScore,
  type QueueItemScore,
} from "@/src/features/annotation-queues/lib/queueItemScores";
import {
  formatQueueTraceFieldText,
  parseQueueTraceFieldDate,
  parseQueueTraceFieldNumber,
  type QueueTraceColumn,
} from "@/src/features/annotation-queues/lib/queueTraceColumns";

type QueueItemFilterConfig = Pick<
  ScoreConfigDomain,
  "id" | "name" | "dataType" | "categories"
>;

/** What a queue item exposes to the filters. */
export type QueueItemFilterRow = {
  status: string;
  traceUserId?: string | null;
  /** Raw values of the configured trace columns, by column id. */
  traceFields?: Record<string, string | null>;
  scores: QueueItemScore[];
};

const STATUS_COLUMN = { id: "status", name: "Status" } as const;
const USER_ID_COLUMN = { id: "userId", name: "User ID" } as const;
const scoreColumnId = (configId: string) => `scoreConfig-${configId}`;

/** Number-like formats get number filters, dates date filters. */
const traceColumnFilterType = (column: QueueTraceColumn) => {
  switch (column.format) {
    case "number":
    case "duration":
      return "number" as const;
    case "datetime":
      return "datetime" as const;
    default:
      return "string" as const;
  }
};

/**
 * The filter toolbar stores a filter by column name, so names must be unique
 * within a queue: a name already taken by an earlier column (a trace column
 * labelled "Status", two score configs with one name) gets a " (2)", " (3)"…
 * suffix.
 */
const withUniqueNames = (columns: ColumnDefinition[]): ColumnDefinition[] => {
  const taken = new Set<string>();
  return columns.map((column) => {
    let name = column.name;
    for (let n = 2; taken.has(name); n++) name = `${column.name} (${n})`;
    taken.add(name);
    return name === column.name ? column : { ...column, name };
  });
};

/**
 * Filter columns for a queue: the configured trace columns first, then status,
 * the trace's user id and one column per score config, each with a unique
 * name. Score filters apply to the value shown in the table, i.e. the
 * reviewer's annotation, or the source's value while nobody has reviewed it.
 */
export function buildQueueItemFilterColumns(
  configs: QueueItemFilterConfig[],
  traceColumns: QueueTraceColumn[] = [],
): ColumnDefinition[] {
  return withUniqueNames([
    ...traceColumns.map(
      (column): ColumnDefinition => ({
        id: column.id,
        name: column.label,
        type: traceColumnFilterType(column),
        internal: column.id,
      }),
    ),
    {
      ...STATUS_COLUMN,
      type: "stringOptions",
      internal: "status",
      options: [{ value: "PENDING" }, { value: "COMPLETED" }],
    },
    { ...USER_ID_COLUMN, type: "string", internal: "userId" },
    ...configs.map((config): ColumnDefinition => {
      const base = {
        id: scoreColumnId(config.id),
        name: config.name,
        internal: scoreColumnId(config.id),
      };
      switch (config.dataType) {
        case "NUMERIC":
          return { ...base, type: "number" };
        case "TEXT":
          return { ...base, type: "string" };
        default:
          return {
            ...base,
            type: "stringOptions",
            options: (config.categories ?? []).map((category) => ({
              value: category.label,
            })),
          };
      }
    }),
  ]);
}

const matchesString = (
  value: string | null | undefined,
  filter: Extract<FilterCondition, { type: "string" }>,
) => {
  if (filter.operator === "is not empty") return !!value;
  if (value === null || value === undefined) return false;
  const actual = value.toLowerCase();
  const expected = filter.value.toLowerCase();
  switch (filter.operator) {
    case "=":
      return actual === expected;
    case "contains":
      return actual.includes(expected);
    case "does not contain":
      return !actual.includes(expected);
    case "starts with":
      return actual.startsWith(expected);
    case "ends with":
      return actual.endsWith(expected);
  }
};

const matchesNumber = (
  value: number | null | undefined,
  filter: Extract<FilterCondition, { type: "number" }>,
) => {
  if (value === null || value === undefined) return false;
  switch (filter.operator) {
    case "=":
      return value === filter.value;
    case ">":
      return value > filter.value;
    case "<":
      return value < filter.value;
    case ">=":
      return value >= filter.value;
    case "<=":
      return value <= filter.value;
  }
};

const matchesDate = (
  value: Date | null | undefined,
  filter: Extract<FilterCondition, { type: "datetime" }>,
) => {
  if (!value) return false;
  const actual = value.getTime();
  const expected = new Date(filter.value).getTime();
  switch (filter.operator) {
    case ">":
      return actual > expected;
    case "<":
      return actual < expected;
    case ">=":
      return actual >= expected;
    case "<=":
      return actual <= expected;
  }
};

const matchesOptions = (
  value: string | null | undefined,
  filter: Extract<FilterCondition, { type: "stringOptions" }>,
) => {
  const included =
    value !== null && value !== undefined
      ? filter.value.includes(value)
      : false;
  return filter.operator === "any of" ? included : !included;
};

const matchesValue = (
  value: { string?: string | null; number?: number | null },
  filter: FilterCondition,
) => {
  switch (filter.type) {
    case "string":
      return matchesString(value.string, filter);
    case "number":
      return matchesNumber(value.number, filter);
    case "stringOptions":
      return matchesOptions(value.string, filter);
    default:
      // Other filter types are never offered for queue items.
      return true;
  }
};

/**
 * Whether a queue item passes every filter. A filter is resolved to exactly
 * one column of `buildQueueItemFilterColumns`, by its unique name or else by
 * id; filters for columns the queue no longer has are ignored.
 */
export function queueItemMatchesFilters(
  row: QueueItemFilterRow,
  filters: FilterCondition[],
  configs: QueueItemFilterConfig[],
  traceColumns: QueueTraceColumn[] = [],
): boolean {
  const filterColumns = buildQueueItemFilterColumns(configs, traceColumns);
  const findColumnId = (filterColumn: string) =>
    (
      filterColumns.find((column) => column.name === filterColumn) ??
      filterColumns.find((column) => column.id === filterColumn)
    )?.id;

  return filters.every((filter) => {
    const columnId = findColumnId(filter.column);
    if (!columnId) return true;
    const traceColumn = traceColumns.find((column) => column.id === columnId);
    if (traceColumn) {
      const raw = row.traceFields?.[traceColumn.id] ?? null;
      if (filter.type === "number") {
        return matchesNumber(
          raw ? parseQueueTraceFieldNumber(raw) : null,
          filter,
        );
      }
      if (filter.type === "datetime") {
        return matchesDate(raw ? parseQueueTraceFieldDate(raw) : null, filter);
      }
      // Match the raw value or its formatted form, so a phone filter works
      // with "+1202…" as well as "(202) …".
      const values = raw
        ? [
            ...new Set([
              raw,
              formatQueueTraceFieldText(raw, traceColumn.format),
            ]),
          ]
        : [null];
      return filter.type === "string" && filter.operator === "does not contain"
        ? values.every((value) => matchesValue({ string: value }, filter))
        : values.some((value) => matchesValue({ string: value }, filter));
    }
    if (columnId === STATUS_COLUMN.id) {
      return matchesValue({ string: row.status }, filter);
    }
    if (columnId === USER_ID_COLUMN.id) {
      return matchesValue({ string: row.traceUserId }, filter);
    }
    const config = configs.find(
      (candidate) => scoreColumnId(candidate.id) === columnId,
    );
    if (!config) return true;
    const resolved = resolveQueueItemScore(row.scores, config);
    return matchesValue(
      {
        string: resolved?.score.stringValue,
        number: resolved?.score.value,
      },
      filter,
    );
  });
}
