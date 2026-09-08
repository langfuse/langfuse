import {
  type FilterState,
  type TableName,
  observationsTableCols,
  tracesTableCols,
  sessionsViewCols,
  promptsTableCols,
  datasetRunsTableCols,
  datasetItemFilterColumns,
  datasetRunItemsTableCols,
  usersTableCols,
  singleFilter,
  escapePipeInValue,
  splitOnUnescapedPipe,
  unescapePipeInValue,
  normalizeLegacySessionPositionInTraceKey,
} from "@langfuse/shared";
import { scoresTableCols } from "@/src/server/api/definitions/scoresTable";
import { encodeDelimitedArray, decodeDelimitedArray } from "use-query-params";
import { evalConfigFilterColumns } from "@/src/server/api/definitions/evalConfigsTable";
import { evalExecutionsFilterCols } from "@/src/server/api/definitions/evalExecutionsTable";
import { experimentsTableCols } from "@/src/features/experiments/components/table/filter-config";
import { experimentItemsTableCols } from "@/src/features/experiments/config/experiment-items-filter-config";

const DEBUG_QUERY_STATE = false;

// Legacy URLs and hand-written links may carry keys that were never
// percent-encoded (e.g. a raw "%"). decodeURIComponent would throw on those
// and drop the entire filter param, so fall back to the raw value.
const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

// encode/decode filter state
// The decode has to return null or undefined so that withDefault will use the default value.
// An empty array will be interpreted as existing state and hence the default value will not be used.
export const getCommaArrayParam = (table: TableName) => ({
  encode: (filterState: FilterState) =>
    encodeDelimitedArray(
      filterState
        .map((f) => {
          const columnId = getColumnId(table, f.column);

          if (!columnId) {
            return null;
          }

          const stringified = `${columnId};${f.type};${
            f.type === "numberObject" ||
            f.type === "stringObject" ||
            f.type === "booleanObject" ||
            f.type === "categoryOptions" ||
            f.type === "positionInTrace"
              ? encodeURIComponent(f.key)
              : ""
          };${f.operator};${encodeURIComponent(
            f.type === "datetime"
              ? new Date(f.value).toISOString()
              : f.type === "stringOptions" ||
                  f.type === "arrayOptions" ||
                  f.type === "categoryOptions"
                ? (f.value as string[]).map(escapePipeInValue).join("|")
                : f.type === "positionInTrace"
                  ? f.value === undefined || f.value === null
                    ? ""
                    : f.value
                  : f.value,
          )}`;

          if (DEBUG_QUERY_STATE) console.log("stringified", stringified);
          return stringified;
        })
        .filter((s): s is string => s !== null),
      ",",
    ),

  decode: (arrayStr: string | (string | null)[] | null | undefined) =>
    (decodeDelimitedArray(arrayStr, ",")
      ?.map((f) => {
        if (!f) return null;
        const [column, type, key, operator, value] = f.split(";");

        if (DEBUG_QUERY_STATE)
          console.log("values", [column, type, key, operator, value]);
        const decodedValue = value ? decodeURIComponent(value) : undefined;
        // Keys are percent-encoded on encode so that keys containing the
        // field separator ";" (or other reserved chars) survive the round
        // trip. See safeDecodeURIComponent for legacy raw-key handling.
        const decodedKey = key ? safeDecodeURIComponent(key) : "";
        const normalizedKey =
          type === "positionInTrace"
            ? normalizeLegacySessionPositionInTraceKey(decodedKey)
            : decodedKey;
        const parsedValue =
          decodedValue === undefined || type === undefined
            ? undefined
            : type === "datetime"
              ? new Date(decodedValue)
              : type === "number" || type === "numberObject"
                ? Number(decodedValue)
                : type === "positionInTrace"
                  ? decodedValue === ""
                    ? undefined
                    : Number(decodedValue)
                  : type === "stringOptions" ||
                      type === "arrayOptions" ||
                      type === "categoryOptions"
                    ? splitOnUnescapedPipe(decodedValue).map(
                        unescapePipeInValue,
                      )
                    : type === "boolean" || type === "booleanObject"
                      ? decodedValue === "true"
                      : decodedValue;

        if (DEBUG_QUERY_STATE) console.log("parsedValue", parsedValue);
        const parsed = singleFilter.safeParse({
          column: getColumnName(table, column),
          key: normalizedKey !== "" ? normalizedKey : undefined,
          operator,
          value: parsedValue,
          type,
        });
        if (!parsed.success) return null;
        return parsed.data;
      })
      .filter((v) => v !== null) as FilterState | undefined) ?? undefined,
});

const tableCols = {
  generations: observationsTableCols,
  traces: tracesTableCols,
  sessions: sessionsViewCols,
  scores: scoresTableCols,
  prompts: promptsTableCols,
  users: usersTableCols,
  eval_configs: evalConfigFilterColumns,
  job_executions: evalExecutionsFilterCols,
  dataset_items: datasetItemFilterColumns,
  dataset_runs: datasetRunsTableCols,
  dataset_run_items_by_run: datasetRunItemsTableCols,
  experiments: experimentsTableCols,
  "experiment-items": experimentItemsTableCols,
  widgets: [
    { id: "environment", name: "Environment" },
    { id: "traceName", name: "Trace Name" },
    { id: "tags", name: "Tags" },
    { id: "release", name: "Release" },
    { id: "user", name: "User" },
    { id: "session", name: "Session" },
    { id: "version", name: "Version" },
  ],
  dashboard: [
    { id: "traceName", name: "Trace Name" },
    { id: "tags", name: "Tags" },
    { id: "release", name: "Release" },
    { id: "user", name: "User" },
    { id: "version", name: "Version" },
  ],
};

function getColumnId(table: TableName, name: string): string | undefined {
  // TODO: make this more robust, will change with new filters
  // to give more leeway to LLMs, we check against name or id
  return tableCols[table]?.find((col) => col.name === name || col.id === name)
    ?.id;
}

function getColumnName(table: TableName, id: string): string | undefined {
  return tableCols[table]?.find((col) => col.id === id)?.name;
}
