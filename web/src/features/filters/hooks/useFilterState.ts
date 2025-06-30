import {
  type FilterState,
  type TableName,
  observationsTableCols,
  tracesTableCols,
  singleFilter,
  sessionsViewCols,
  promptsTableCols,
} from "@langfuse/shared";
import { scoresTableCols } from "@/src/server/api/definitions/scoresTable";
import {
  useQueryParam,
  encodeDelimitedArray,
  decodeDelimitedArray,
  withDefault,
} from "use-query-params";
import { usersTableCols } from "@/src/server/api/definitions/usersTable";
import useSessionStorage from "@/src/components/useSessionStorage";
import { evalConfigFilterColumns } from "@/src/server/api/definitions/evalConfigsTable";
import { evalExecutionsFilterCols } from "@/src/server/api/definitions/evalExecutionsTable";

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
          f.type === "numberObject" ||
          f.type === "stringObject" ||
          f.type === "categoryOptions"
            ? f.key
            : ""
        };${f.operator};${encodeURIComponent(
          f.type === "datetime"
            ? new Date(f.value).toISOString()
            : f.type === "stringOptions" ||
                f.type === "arrayOptions" ||
                f.type === "categoryOptions"
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
                : type === "stringOptions" ||
                    type === "arrayOptions" ||
                    type === "categoryOptions"
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
  projectId?: string, // Passing projectId is expected as filters might differ across projects. However, we can't call hooks conditionally. There is a case in the prompts table where this will only be used if projectId is defined, but it's not defined in all cases.
) => {
  const [sessionFilterState, setSessionFilterState] =
    useSessionStorage<FilterState>(
      !!projectId ? `${table}FilterState-${projectId}` : `${table}FilterState`,
      initialState,
    );
  // Merge initial state with session state if filter elements don't exist
  const mergedInitialState = initialState.reduce(
    (acc, filter) => {
      const exists = sessionFilterState.some((f) => f.column === filter.column);
      if (!exists) {
        acc.push(filter);
      }
      return acc;
    },
    [...sessionFilterState],
  );

  // Update session storage with merged state
  if (mergedInitialState.length !== sessionFilterState.length) {
    setSessionFilterState(mergedInitialState);
  }

  // Note: `use-query-params` library does not automatically update the URL with the default value
  const [filterState, setFilterState] = useQueryParam(
    "filter",
    withDefault(getCommaArrayParam(table), sessionFilterState),
  );

  const setFilterStateWithSession = (newState: FilterState): void => {
    setFilterState(newState);
    setSessionFilterState(newState);
  };

  return [filterState, setFilterStateWithSession] as const;
};

const tableCols = {
  generations: observationsTableCols,
  traces: tracesTableCols,
  sessions: sessionsViewCols,
  scores: scoresTableCols,
  prompts: promptsTableCols,
  users: usersTableCols,
  eval_configs: evalConfigFilterColumns,
  job_executions: evalExecutionsFilterCols,
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
  return tableCols[table]?.find((col) => col.name === name)?.id;
}

function getColumnName(table: TableName, id: string): string | undefined {
  return tableCols[table]?.find((col) => col.id === id)?.name;
}
