import { type FilterState, type TableName } from "@/src/features/filters/types";
import { GENERATIONS_ID_NAME_MAP } from "@/src/server/api/definitions/observationsTable";
import { SCORES_ID_NAME_MAP } from "@/src/server/api/definitions/scoresTable";
import { SESSIONS_ID_NAME_MAP } from "@/src/server/api/definitions/sessionsView";
import { TRACES_ID_NAME_MAP } from "@/src/server/api/definitions/tracesTable";
import { singleFilter } from "@/src/server/api/interfaces/filters";
import { useState } from "react";
import {
  useQueryParam,
  encodeDelimitedArray,
  decodeDelimitedArray,
  withDefault,
} from "use-query-params";

const DEBUG_QUERY_STATE = false;

// encode/decode filter state
// The decode has to return null or undefined so that withDefault will use the default value.
// An empty array will be interpreted as existing state and hence the default value will not be used.
const CommaArrayParam = (table: TableName) => ({
  encode: (value: FilterState) =>
    encodeDelimitedArray(
      value.map((f) => {
        const map = getIdNameMap(table);
        const reversed_map = Object.fromEntries(
          Object.entries(map).map(([key, value]) => [value, key]),
        );
        const columnName =
          f.column in reversed_map ? reversed_map[f.column] : f.column;

        const stringified = `${columnName};${f.type};${
          f.type === "numberObject" || f.type === "stringObject" ? f.key : ""
        };${f.operator};${encodeURIComponent(
          f.type === "datetime"
            ? f.value.toISOString()
            : f.type === "stringOptions"
              ? f.value.join("|")
              : f.type === "arrayOptions"
                ? f.value.join("|")
                : f.value,
        )}`;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (DEBUG_QUERY_STATE) console.log("stringified", stringified);
        return stringified;
      }),
      ",",
    ),

  decode: (arrayStr: string | (string | null)[] | null | undefined) =>
    (decodeDelimitedArray(arrayStr, ",")
      ?.map((f) => {
        const map = getIdNameMap(table);
        if (!f) return null;
        const [column, type, key, operator, value] = f.split(";");
        const columnName = column && column in map ? map[column] : column;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (DEBUG_QUERY_STATE)
          console.log("values", [column, type, key, operator, value]);
        const decodedValue = value ? decodeURIComponent(value) : undefined;
        const parsedValue =
          decodedValue === undefined || type === undefined
            ? undefined
            : type === "datetime"
              ? new Date(decodedValue)
              : type === "number" || type === "numberObject"
                ? Number(decodedValue)
                : type === "stringOptions"
                  ? decodedValue.split("|")
                  : type === "arrayOptions"
                    ? decodedValue.split("|")
                    : type === "boolean"
                      ? decodedValue === "true"
                      : decodedValue;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (DEBUG_QUERY_STATE) console.log("parsedValue", parsedValue);
        const parsed = singleFilter.safeParse({
          column: columnName,
          key: key !== "" ? key : undefined,
          operator,
          value: parsedValue,
          type,
        });
        if (!parsed.success) return null;
        return parsed.data;
      })
      .filter((v) => v !== null) as FilterState | undefined) ?? undefined,
});

// manage state with hook
export const useQueryFilterState = (
  initialState: FilterState = [],
  table: TableName,
) => {
  const [filterState, setFilterState] = useQueryParam(
    "filter",
    withDefault(CommaArrayParam(table), initialState),
  );

  return [filterState, setFilterState] as const;
};

export const useMemoryFilterState = (initialState: FilterState = []) => {
  const [filterState, setFilterState] = useState(initialState);
  return [filterState, setFilterState] as const;
};

// Utility function to get the ID-Name map based on the table name
function getIdNameMap(table: TableName): { [key: string]: string } {
  switch (table) {
    case "generations":
      return GENERATIONS_ID_NAME_MAP;
    case "traces":
      return TRACES_ID_NAME_MAP;
    case "sessions":
      return SESSIONS_ID_NAME_MAP;
    case "scores":
      return SCORES_ID_NAME_MAP;
    case "dashboard":
      return { traceName: "traceName" };
    default:
      return {};
  }
}
