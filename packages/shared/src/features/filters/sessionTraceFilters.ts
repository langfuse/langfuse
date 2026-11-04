import { singleFilterList } from "../../interfaces/filters";
import { eventsTableCols } from "../../eventsTable";
import { normalizeLegacySessionPositionInTraceFilters } from "./sessionPositionInTrace";
import { type ColumnDefinition } from "../../tableDefinitions/types";

export const sessionTraceFilterColumns: ColumnDefinition[] = [
  {
    id: "isRootObservation",
    name: "Root observation",
    type: "boolean",
    internal: "is_root_observation",
  },
  { id: "traceName", name: "Trace name", type: "string", internal: "name" },
  { id: "userId", name: "User ID", type: "string", internal: "user_id" },
  {
    id: "environment",
    name: "Environment",
    type: "string",
    internal: "environment",
  },
  {
    id: "traceTags",
    name: "Trace tags",
    type: "arrayOptions",
    internal: "tags",
    options: [],
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
  {
    id: "metadata",
    name: "Observation metadata",
    type: "stringObject",
    internal: "metadata",
  },
];

// Saved views and shared URLs created before observation filtering used root fields.
const legacyObservationColumns: Record<string, string> = {
  "Position in Trace": "positionInTrace",
  rootName: "name",
  rootType: "type",
  rootLevel: "level",
  rootMetadata: "metadata",
};

export const sessionTraceFilterSchema = singleFilterList
  .transform((filters) =>
    normalizeLegacySessionPositionInTraceFilters(
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
    ),
  )
  .superRefine((filters, ctx) => {
    filters.forEach((filter, index) => {
      if (
        filter.type === "positionInTrace" &&
        filter.column === "positionInTrace"
      )
        return;
      const column: ColumnDefinition | undefined = eventsTableCols.find(
        (column) => column.id === filter.column,
      );
      if (
        column &&
        (filter.type === column.type ||
          (filter.type === "string" && column.type === "stringOptions") ||
          (filter.type === "stringOptions" && column.type === "string") ||
          (filter.type === "null" && column.nullable))
      )
        return;
      ctx.addIssue({
        code: "custom",
        path: [index],
        message: `Unsupported session filter: ${filter.column} (${filter.type})`,
      });
    });
  });
