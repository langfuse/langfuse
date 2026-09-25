import { Decimal } from "decimal.js";
import { logger, recordIncrement } from "@langfuse/shared/src/server";
import { TableName, type RecordInsertType } from "./types";

// Decimal64(12): valid range is (-10^6, 10^6), i.e. 18 total digits with 12 fractional.
// JS double can't represent 999999.999999999999 exactly (rounds to 1e6), so we use a
// value with enough decimal places to be safe while staying representable as a JS number.
const DECIMAL_64_12_LIMIT = new Decimal("1e6");
const DECIMAL_64_12_MAX_NUM = 999_999.999_999;
const DECIMAL_64_12_MIN_NUM = -DECIMAL_64_12_MAX_NUM;

export function truncateOversizedRecord<
  Row extends RecordInsertType<TableName>,
>(tableName: TableName, record: Row): Row {
  const maxFieldSize = 1024 * 1024; // 1MB per field as safety margin
  const truncationMessage = "[TRUNCATED: Field exceeded size limit]";

  // Helper function to safely truncate string fields
  const truncateField = (value: string | null | undefined): string | null => {
    if (!value) return value || null;
    if (value.length > maxFieldSize) {
      return (
        // Keep the first 500KB and append a truncation message
        value.substring(0, 500 * 1024) + truncationMessage
      );
    }
    return value;
  };

  // Truncate input field if present
  if ("input" in record && record.input && record.input.length > maxFieldSize) {
    record.input = truncateField(record.input);
    logger.info(
      `Truncated oversized input field for record ${record.id} of type ${tableName}`,
      {
        projectId: record.project_id,
      },
    );
  }

  // Truncate output field if present
  if (
    "output" in record &&
    record.output &&
    record.output.length > maxFieldSize
  ) {
    record.output = truncateField(record.output);
    logger.info(
      `Truncated oversized output field for record ${record.id} of type ${tableName}`,
      {
        projectId: record.project_id,
      },
    );
  }

  // Truncate metadata field if present
  if ("metadata" in record && record.metadata) {
    const metadata = record.metadata;
    const truncatedMetadata: Record<string, string> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (value && value.length > maxFieldSize) {
        truncatedMetadata[key] = truncateField(value) || "";
        logger.info(
          `Truncated oversized metadata for record ${record.id} of type ${tableName} and key ${key}`,
          {
            projectId: record.project_id,
          },
        );
      } else {
        truncatedMetadata[key] = value;
      }
    }
    record.metadata = truncatedMetadata;
  }

  return record;
}

export function clampDecimal64Value(value: number): [number, boolean] {
  if (!Number.isFinite(value)) return [0, true];
  if (new Decimal(value).abs().gte(DECIMAL_64_12_LIMIT)) {
    return [value >= 0 ? DECIMAL_64_12_MAX_NUM : DECIMAL_64_12_MIN_NUM, true];
  }
  return [value, false];
}

type CostMapContext = {
  recordId: string;
  projectId: string;
  fieldName: string;
};

export function clampDecimal64Map(
  map: Record<string, number>,
  context: CostMapContext,
): Record<string, number>;
export function clampDecimal64Map(
  map: Record<string, number> | undefined,
  context: CostMapContext,
): Record<string, number> | undefined;
export function clampDecimal64Map(
  map: Record<string, number> | undefined,
  context: CostMapContext,
): Record<string, number> | undefined {
  if (!map) return map;

  let result: Record<string, number> | undefined;
  for (const [key, value] of Object.entries(map)) {
    const [cv, wasClamped] = clampDecimal64Value(value);
    if (wasClamped) {
      if (!result) result = { ...map };
      result[key] = cv;
    }
  }
  if (!result) return map;

  logger.warn("Clamped Decimal64(12) overflow in cost map", {
    projectId: context.projectId,
    recordId: context.recordId,
    fieldName: context.fieldName,
  });
  recordIncrement("langfuse.clickhouse_writer.decimal64_clamped");
  return result;
}

export function clampDecimal64Fields<Row extends RecordInsertType<TableName>>(
  tableName: TableName,
  record: Row,
): Row {
  const ctx = { recordId: record.id, projectId: record.project_id };

  switch (tableName) {
    case TableName.Observations:
    case TableName.ObservationsBatchStaging:
    case TableName.EventsFull: {
      if ("provided_cost_details" in record) {
        record.provided_cost_details = clampDecimal64Map(
          record.provided_cost_details,
          { ...ctx, fieldName: "provided_cost_details" },
        );
      }
      if ("cost_details" in record) {
        record.cost_details = clampDecimal64Map(record.cost_details, {
          ...ctx,
          fieldName: "cost_details",
        });
      }
      if ("total_cost" in record && typeof record.total_cost === "number") {
        const [cv, wasClamped] = clampDecimal64Value(record.total_cost);
        if (wasClamped) {
          record.total_cost = cv;
          logger.warn("Clamped Decimal64(12) overflow in total_cost", {
            projectId: ctx.projectId,
            recordId: ctx.recordId,
            fieldName: "total_cost",
          });
          recordIncrement("langfuse.clickhouse_writer.decimal64_clamped");
        }
      }
      break;
    }
  }

  return record;
}
