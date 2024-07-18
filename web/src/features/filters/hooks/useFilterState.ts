import {
  type FilterState,
  type TableName,
  observationsTableCols,
  tracesTableCols,
  singleFilter,
  sessionsViewCols,
} from "@langfuse/shared";
import { scoresTableCols } from "@/src/server/api/definitions/scoresTable";
import { useState } from "react";
import {
  useQueryParam,
  encodeDelimitedArray,
  decodeDelimitedArray,
  withDefault,
} from "use-query-params";
import { promptsTableCols } from "@/src/server/api/definitions/promptsTable";
import { usersTableCols } from "@/src/server/api/definitions/usersTable";

const DEBUG_QUERY_STATE = false;

// encode/decode filter state
// The decode has to return null or undefined so that withDefault will use the default value.
// An empty array will be interpreted as existing state and hence the default value will not be used.
const getCommaArrayParam = (table: TableName) => ({
  encode: (filterState: FilterState) =>
    encodeDelimitedArray(
      filterState.map((f) => {
        const columnId = getColumnId(table, f.column);

        const stringified = `${columnId};${f.type};${
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
          column: getColumnName(table, column),
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
    withDefault(getCommaArrayParam(table), initialState),
  );

  return [filterState, setFilterState] as const;
};

export const useMemoryFilterState = (initialState: FilterState = []) => {
  const [filterState, setFilterState] = useState(initialState);
  return [filterState, setFilterState] as const;
};

const tableCols = {
  generations: observationsTableCols,
  traces: tracesTableCols,
  sessions: sessionsViewCols,
  scores: scoresTableCols,
  prompts: promptsTableCols,
  users: usersTableCols,
  dashboard: [
    { id: "traceName", name: "Trace Name" },
    { id: "tags", name: "Tags" },
  ],
};

function getColumnId(table: TableName, name: string): string | undefined {
  return tableCols[table]?.find((col) => col.name === name)?.id;
}

function getColumnName(table: TableName, id: string): string | undefined {
  return tableCols[table]?.find((col) => col.id === id)?.name;
}
