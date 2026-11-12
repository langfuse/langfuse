import { singleFilterList } from "../../interfaces/filters";
import { eventsTableCols } from "../../eventsTable";
import { type ColumnDefinition } from "../../tableDefinitions/types";

export const sessionTraceFilterColumns: ColumnDefinition[] = [
  {
    id: "isRootObservation",
    name: "Root observation",
    type: "boolean",
    internal: "is_root_observation",
  },
  { id: "traceName", name: "Trace name", type: "string", internal: "name" },
  {
    id: "environment",
    name: "Environment",
    type: "string",
    internal: "environment",
  },
  {
    id: "name",
    name: "Observation name",
    type: "string",
    internal: "name",
  },
  {
    id: "type",
    name: "Observation type",
    type: "string",
    internal: "type",
  },
  {
    id: "level",
    name: "Observation level",
    type: "string",
    internal: "level",
  },
];

// Saved views and shared URLs created before observation filtering used root fields.
const legacyObservationColumns: Record<string, string> = {
  rootName: "name",
  rootType: "type",
  rootLevel: "level",
  rootMetadata: "metadata",
};

export const sessionTraceFilterSchema = singleFilterList
  .transform((filters) =>
    filters.map((filter) => ({
      ...filter,
      column:
        legacyObservationColumns[filter.column] ??
        eventsTableCols.find(
          (column: ColumnDefinition) =>
            column.name === filter.column ||
            column.aliases?.includes(filter.column),
        )?.id ??
        filter.column,
    })),
  )
  .superRefine((filters, ctx) => {
    filters.forEach((filter, index) => {
      if (filter.column === "isRootObservation") {
        if (filter.type === "boolean" && filter.operator === "=") return;
      } else if (["name", "traceName"].includes(filter.column)) {
        if (filter.type === "stringOptions" && filter.operator === "none of")
          return;
        if (
          filter.type === "string" &&
          ["=", "contains", "does not contain"].includes(filter.operator)
        )
          return;
      } else if (["type", "level", "environment"].includes(filter.column)) {
        if (filter.type === "string" && filter.operator === "=") return;
      }
      ctx.addIssue({
        code: "custom",
        path: [index],
        message: `Unsupported session filter: ${filter.column} (${filter.type})`,
      });
    });
  });
