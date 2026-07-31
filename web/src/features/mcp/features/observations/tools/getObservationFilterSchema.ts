import { z } from "zod";
import {
  eventsTableCols,
  filterOperators,
  FTS_MATCH_OPERATOR,
  OBSERVATION_MCP_ALLOWED_EVENTS_TABLE_FILTER_COLUMNS,
} from "@langfuse/shared";
import { defineTool } from "../../../core/define-tool";
import { observationEventsFilterConfig } from "@/src/features/events/config/filter-config";

const EmptyInputSchema = z.object({});

const OBSERVATION_MCP_FILTER_COLUMNS = eventsTableCols
  .filter((column) => {
    for (const allowedColumn of OBSERVATION_MCP_ALLOWED_EVENTS_TABLE_FILTER_COLUMNS) {
      if (allowedColumn === column.id) return true;
    }
    return false;
  })
  .map((column) =>
    // eventsTableCols uses traceTags for the table/filter id, while the MCP
    // observation shape exposes the field as tags.
    column.id === "traceTags" ? "tags" : column.id,
  );

const OBSERVATION_MCP_FILTER_CONFIG_COLUMN_OVERRIDES: Record<string, string> = {
  tags: "traceTags",
};

const OBSERVATION_MCP_INDEXED_MATCH_COLUMNS = new Set([
  "input",
  "output",
  "metadata",
]);

export const [
  getObservationFilterSchemaTool,
  handleGetObservationFilterSchema,
] = defineTool({
  name: "getObservationFilterSchema",
  description:
    "Show which observation fields can be used in listObservations filters, including the supported operators for each field.",
  baseSchema: EmptyInputSchema,
  inputSchema: EmptyInputSchema,
  handler: async () => {
    const publicFilterColumnsByConfigColumn = Object.fromEntries(
      OBSERVATION_MCP_FILTER_COLUMNS.map((publicColumn) => [
        OBSERVATION_MCP_FILTER_CONFIG_COLUMN_OVERRIDES[publicColumn] ??
          publicColumn,
        publicColumn,
      ]),
    );

    const columns = Object.fromEntries(
      observationEventsFilterConfig.columnDefinitions
        .filter((column) => column.id in publicFilterColumnsByConfigColumn)
        .map((column) => {
          const publicColumn = publicFilterColumnsByConfigColumn[column.id];

          return [
            publicColumn,
            {
              type: column.type,
              operators: OBSERVATION_MCP_INDEXED_MATCH_COLUMNS.has(publicColumn)
                ? [...filterOperators[column.type], FTS_MATCH_OPERATOR]
                : filterOperators[column.type],
              nullable: Boolean(column.nullable),
              requiresKey:
                column.type === "stringObject" ||
                column.type === "numberObject" ||
                column.type === "booleanObject",
            },
          ];
        }),
    );

    return {
      resource: "observation",
      columns,
    };
  },
  readOnlyHint: true,
});
