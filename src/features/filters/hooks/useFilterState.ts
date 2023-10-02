import { type FilterState } from "@/src/features/filters/types";
import { singleFilter } from "@/src/server/api/interfaces/filters";
import {
  useQueryParam,
  encodeDelimitedArray,
  decodeDelimitedArray,
  withDefault,
} from "use-query-params";

const CommaArrayParam = {
  encode: (state: FilterState) =>
    encodeDelimitedArray(
      state.map(
        (f) => `${f.column}:${f.type}:${f.operator}:${f.value.toString()}`,
      ),
      ",",
    ),

  decode: (arrayStr: string | (string | null)[] | null | undefined) =>
    decodeDelimitedArray(arrayStr, ",")
      ?.map((f) => {
        if (!f) return null;
        const [column, type, operator, value] = f.split(":");
        const parsed = singleFilter.safeParse({
          column,
          operator,
          value,
          type,
        });
        if (!parsed.success) return null;
        return parsed.data;
      })
      .filter(Boolean) ?? [],
};

// manage state with hook
export const useFilterState = (initialState: FilterState = []) => {
  const [filterState, setFilterState] = useQueryParam(
    "filter",
    withDefault(CommaArrayParam, initialState),
  );

  return [filterState, setFilterState] as const;
};
