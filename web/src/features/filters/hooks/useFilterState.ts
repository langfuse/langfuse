import {
  type FilterState,
  type TableName,
  observationsTableCols,
  tracesTableCols,
  singleFilter,
  sessionsViewCols,
  promptsTableCols,
  datasetItemFilterColumns,
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
const getCommaArrayParam = (table: TableName, t: (key: string) => string) => ({
  encode: (filterState: FilterState) =>
    encodeDelimitedArray(
      filterState.map((f) => {
        const columnId = getColumnId(table, f.column, t);

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
          column: getColumnName(table, column, t),
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
  t: (key: string) => string,
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
    withDefault(getCommaArrayParam(table, t), sessionFilterState),
  );

  const setFilterStateWithSession = (newState: FilterState): void => {
    setFilterState(newState);
    setSessionFilterState(newState);
  };

  return [filterState, setFilterStateWithSession] as const;
};

const getTableCols = (t: (key: string) => string) => ({
  generations: observationsTableCols,
  traces: tracesTableCols,
  sessions: sessionsViewCols,
  scores: scoresTableCols,
  prompts: promptsTableCols,
  users: usersTableCols,
  eval_configs: evalConfigFilterColumns,
  job_executions: evalExecutionsFilterCols,
  dataset_items: datasetItemFilterColumns,
  widgets: [
    {
      id: "environment",
      name: t("common.filters.environment"),
    },
    { id: "traceName", name: t("common.filters.traceName") },
    { id: "tags", name: t("common.filters.tags") },
    { id: "release", name: t("common.filters.release") },
    { id: "user", name: t("common.filters.user") },
    { id: "session", name: t("common.filters.session") },
    { id: "version", name: t("common.filters.version") },
  ],
  dashboard: [
    { id: "traceName", name: t("common.filters.traceName") },
    { id: "tags", name: t("common.filters.tags") },
    { id: "release", name: t("common.filters.release") },
    { id: "user", name: t("common.filters.user") },
    { id: "version", name: t("common.filters.version") },
  ],
});

function getColumnId(
  table: TableName,
  name: string,
  t: (key: string) => string,
): string | undefined {
  return getTableCols(t)[table]?.find((col) => col.name === name)?.id;
}

function getColumnName(
  table: TableName,
  id: string,
  t: (key: string) => string,
): string | undefined {
  return getTableCols(t)[table]?.find((col) => col.id === id)?.name;
}
