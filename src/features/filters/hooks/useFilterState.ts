import { type FilterState } from "@/src/features/filters/types";
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
const CommaArrayParam = {
  encode: (value: FilterState) =>
    encodeDelimitedArray(
      value.map((f) => {
        const stringified = `${f.column};${f.type};${
          f.type === "numberObject" || f.type === "stringObject" ? f.key : ""
        };${f.operator};${
          f.type === "datetime"
            ? f.value.toISOString()
            : f.type === "stringOptions"
              ? f.value.join("|")
              : f.type === "arrayOptions"
                ? f.value.join("|")
                : f.value
        }`;
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
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (DEBUG_QUERY_STATE)
          console.log("values", [column, type, key, operator, value]);
        const parsedValue =
          value === undefined || type === undefined
            ? undefined
            : type === "datetime"
              ? new Date(value)
              : type === "number" || type === "numberObject"
                ? Number(value)
                : type === "stringOptions"
                  ? value.split("|")
                  : type === "arrayOptions"
                    ? value.split("|")
                    : type === "boolean"
                      ? value === "true"
                      : value;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (DEBUG_QUERY_STATE) console.log("parsedValue", parsedValue);
        const parsed = singleFilter.safeParse({
          column,
          key: key !== "" ? key : undefined,
          operator,
          value: parsedValue,
          type,
        });
        if (!parsed.success) return null;
        return parsed.data;
      })
      .filter((v) => v !== null) as FilterState | undefined) ?? undefined,
};

// manage state with hook
export const useQueryFilterState = (initialState: FilterState = []) => {
  const [filterState, setFilterState] = useQueryParam(
    "filter",
    withDefault(CommaArrayParam, initialState),
  );

  return [filterState, setFilterState] as const;
};

export const useMemoryFilterState = (initialState: FilterState = []) => {
  const [filterState, setFilterState] = useState(initialState);
  return [filterState, setFilterState] as const;
};
