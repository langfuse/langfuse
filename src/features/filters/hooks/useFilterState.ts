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

const CommaArrayParam = {
  encode: (state: FilterState) =>
    encodeDelimitedArray(
      state.map(
        (f) =>
          `${f.column};${f.type};${f.operator};${
            f.type === "datetime"
              ? f.value.toISOString()
              : f.type === "number"
              ? f.value
              : f.type === "stringOptions"
              ? f.value.join("|")
              : f.value
          }`,
      ),
      ",",
    ),

  decode: (arrayStr: string | (string | null)[] | null | undefined) =>
    (decodeDelimitedArray(arrayStr, ",")
      ?.map((f) => {
        if (!f) return null;
        const [column, type, operator, value] = f.split(";");
        if (DEBUG_QUERY_STATE)
          console.log("values", [column, type, operator, value]);
        const parsedValue =
          value === undefined || type === undefined
            ? undefined
            : type === "datetime"
            ? new Date(value)
            : type === "number"
            ? Number(value)
            : type === "stringOptions"
            ? value.split("|")
            : value;
        if (DEBUG_QUERY_STATE) console.log("parsedValue", parsedValue);
        const parsed = singleFilter.safeParse({
          column,
          operator,
          value: parsedValue,
          type,
        });
        if (!parsed.success) return null;
        return parsed.data;
      })
      .filter((v) => v !== null) as FilterState) ?? [],
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
