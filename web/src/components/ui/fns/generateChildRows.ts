import {
  type JsonTableRow,
  transformJsonToTableData,
} from "@/src/components/table/utils/jsonExpansionUtils";

export function generateChildRows(row: JsonTableRow): JsonTableRow[] {
  if (!row.rawChildData || row.childrenGenerated) {
    return row.subRows || [];
  }

  return transformJsonToTableData(
    row.rawChildData,
    row.key,
    row.level + 1,
    row.id,
    false,
  );
}
