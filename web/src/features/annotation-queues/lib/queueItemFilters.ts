import {
  type ColumnDefinition,
  type FilterCondition,
  type ScoreConfigDomain,
} from "@langfuse/shared";
import {
  resolveQueueItemScore,
  type QueueItemScore,
} from "@/src/features/annotation-queues/lib/queueItemScores";

type QueueItemFilterConfig = Pick<
  ScoreConfigDomain,
  "id" | "name" | "dataType" | "categories"
>;

/** What a queue item exposes to the filters. */
export type QueueItemFilterRow = {
  status: string;
  traceUserId?: string | null;
  scores: QueueItemScore[];
};

const STATUS_COLUMN = { id: "status", name: "Status" } as const;
const USER_ID_COLUMN = { id: "userId", name: "User ID" } as const;
const scoreColumnId = (configId: string) => `scoreConfig-${configId}`;

/**
 * Filter columns for a queue: status, the trace's user id and one column per
 * score config. Score filters apply to the value shown in the table, i.e. the
 * reviewer's annotation, or the source's value while nobody has reviewed it.
 */
export function buildQueueItemFilterColumns(
  configs: QueueItemFilterConfig[],
): ColumnDefinition[] {
  return [
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
  ];
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
 * Whether a queue item passes every filter. A filter is matched against a
 * column by id or by name; filters for columns the queue no longer has are
 * ignored.
 */
export function queueItemMatchesFilters(
  row: QueueItemFilterRow,
  filters: FilterCondition[],
  configs: QueueItemFilterConfig[],
): boolean {
  const isColumn = (
    column: { id: string; name: string },
    filterColumn: string,
  ) => filterColumn === column.id || filterColumn === column.name;

  return filters.every((filter) => {
    if (isColumn(STATUS_COLUMN, filter.column)) {
      return matchesValue({ string: row.status }, filter);
    }
    if (isColumn(USER_ID_COLUMN, filter.column)) {
      return matchesValue({ string: row.traceUserId }, filter);
    }
    const config = configs.find((candidate) =>
      isColumn(
        { id: scoreColumnId(candidate.id), name: candidate.name },
        filter.column,
      ),
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
