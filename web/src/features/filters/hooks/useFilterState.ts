import { type UIFilterState } from "@/src/features/filters/types";
import { GENERATIONS_NAME_ID_MAP } from "@/src/server/api/definitions/observationsTable";
import { TRACES_NAME_ID_MAP } from "@/src/server/api/definitions/tracesTable";
import { singleFilterWithUrlParam } from "@/src/server/api/interfaces/filters";
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
const CommaArrayParam = (table: string) => ({
  encode: (value: UIFilterState) =>
    encodeDelimitedArray(
      value.map((f) => {
        const stringified = `${f.urlName};${f.type};${
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
        if (!f) return null;
        const [column, type, key, operator, value] = f.split(";");
        let map: { [key: string]: string };
        switch (table) {
          case "generation":
            map = GENERATIONS_NAME_ID_MAP;
            break;
          case "trace":
            map = TRACES_NAME_ID_MAP;
            break;
          case "session":
            map = {};
            break;
          case "score":
            map = {};
            break;
          default:
            map = {};
            break;
        }
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
        const parsed = singleFilterWithUrlParam.safeParse({
          column: columnName,
          key: key !== "" ? key : undefined,
          operator,
          urlName: column,
          value: parsedValue,
          type,
        });
        if (!parsed.success) return null;
        return parsed.data;
      })
      .filter((v) => v !== null) as UIFilterState | undefined) ?? undefined,
});

// manage state with hook
export const useQueryFilterState = (
  initialState: UIFilterState = [],
  table: string,
) => {
  const [filterState, setFilterState] = useQueryParam(
    "filter",
    withDefault(CommaArrayParam(table), initialState),
  );

  return [filterState, setFilterState] as const;
};

export const useMemoryFilterState = (initialState: UIFilterState = []) => {
  const [filterState, setFilterState] = useState(initialState);
  return [filterState, setFilterState] as const;
};
