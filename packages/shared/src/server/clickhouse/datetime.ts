import { convertDateToClickhouseDateTime } from "./client";

type DateTime64Precision = 3 | 6;

type DateTime64InsertTableSpec = {
  precision: DateTime64Precision;
  fields: readonly string[];
};

/**
 * DateTime64 columns written via JSONEachRow. Worker insert types carry these as
 * millisecond (precision 3) or microsecond (precision 6) integer ticks.
 *
 * ClickHouse 26.8+ treats an unquoted JSON number as Unix seconds and then
 * scales it by 10^precision, which overflows those ticks to 9999-12-31. Quoted
 * datetime strings are parsed the same way on every supported version.
 */
export const CLICKHOUSE_DATETIME64_INSERT_FIELDS = {
  traces: {
    precision: 3,
    fields: ["timestamp", "created_at", "updated_at", "event_ts"],
  },
  observations: {
    precision: 3,
    fields: [
      "start_time",
      "end_time",
      "completion_start_time",
      "created_at",
      "updated_at",
      "event_ts",
    ],
  },
  observations_batch_staging: {
    precision: 3,
    fields: [
      "start_time",
      "end_time",
      "completion_start_time",
      "created_at",
      "updated_at",
      "event_ts",
      "s3_first_seen_timestamp",
    ],
  },
  scores: {
    precision: 3,
    fields: ["timestamp", "created_at", "updated_at", "event_ts"],
  },
  dataset_run_items_rmt: {
    precision: 3,
    fields: [
      "created_at",
      "updated_at",
      "event_ts",
      "dataset_run_created_at",
      "dataset_item_version",
    ],
  },
  blob_storage_file_log: {
    precision: 3,
    fields: ["created_at", "updated_at", "event_ts"],
  },
  events_full: {
    precision: 6,
    fields: [
      "start_time",
      "end_time",
      "completion_start_time",
      "created_at",
      "updated_at",
      "event_ts",
      "experiment_item_version",
    ],
  },
  traces_null: {
    precision: 3,
    fields: ["start_time", "end_time", "created_at", "updated_at", "event_ts"],
  },
} as const satisfies Record<string, DateTime64InsertTableSpec>;

export type ClickHouseDateTime64InsertTable =
  keyof typeof CLICKHOUSE_DATETIME64_INSERT_FIELDS;

// ClickHouse DateTime64 calendar range is 1925-01-01 through 2283-11-11.
// ISO-8601 expanded years (`+058638-...`) are not valid DateTime64 input.
const CLICKHOUSE_DATETIME64_MIN_YEAR = 1925;
const CLICKHOUSE_DATETIME64_MAX_YEAR = 2283;

const assertClickHouseDateTime64Year = (date: Date): void => {
  const year = date.getUTCFullYear();
  if (
    year < CLICKHOUSE_DATETIME64_MIN_YEAR ||
    year > CLICKHOUSE_DATETIME64_MAX_YEAR
  ) {
    throw new Error(
      `DateTime64 tick is outside ClickHouse year range (${year})`,
    );
  }
};

export const convertDateTime64TicksToClickhouseDateTime = (
  ticks: number,
  precision: DateTime64Precision,
): string => {
  if (precision === 3) {
    const date = new Date(ticks);
    assertClickHouseDateTime64Year(date);
    return convertDateToClickhouseDateTime(date);
  }

  const milliseconds = Math.floor(ticks / 1000);
  const microsecondRemainder = ((ticks % 1000) + 1000) % 1000;
  const date = new Date(milliseconds);
  assertClickHouseDateTime64Year(date);
  return `${convertDateToClickhouseDateTime(date)}${String(microsecondRemainder).padStart(3, "0")}`;
};

export const quoteDateTime64InsertValue = (
  value: unknown,
  precision: DateTime64Precision,
): unknown => {
  if (value == null) {
    return value;
  }
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date) {
    return convertDateTime64TicksToClickhouseDateTime(
      precision === 3 ? value.getTime() : value.getTime() * 1000,
      precision,
    );
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return convertDateTime64TicksToClickhouseDateTime(value, precision);
  }
  return value;
};

export const quoteDateTime64InsertRecords = <T extends object>(
  table: string,
  records: T[],
): T[] => {
  const spec =
    CLICKHOUSE_DATETIME64_INSERT_FIELDS[
      table as ClickHouseDateTime64InsertTable
    ];
  if (!spec) {
    return records;
  }

  return records.map((record) => {
    const current = record as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    for (const field of spec.fields) {
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        continue;
      }
      const quoted = quoteDateTime64InsertValue(current[field], spec.precision);
      if (quoted !== current[field]) {
        updates[field] = quoted;
      }
    }

    return Object.keys(updates).length > 0
      ? ({ ...record, ...updates } as T)
      : record;
  });
};
