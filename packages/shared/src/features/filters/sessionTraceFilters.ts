import { z } from "zod";
import {
  singleFilterList,
  stringFilter,
  stringOptionsFilter,
  arrayOptionsFilter,
  stringObjectFilter,
  booleanFilter,
} from "../../interfaces/filters";
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
  rootName: "name",
  rootType: "type",
  rootLevel: "level",
  rootMetadata: "metadata",
};

export const sessionTraceFilterSchema = singleFilterList
  .transform((filters) =>
    filters.map((filter) => ({
      ...filter,
      column: legacyObservationColumns[filter.column] ?? filter.column,
    })),
  )
  .pipe(
    z.array(
      z.discriminatedUnion("type", [
        booleanFilter.extend({ column: z.literal("isRootObservation") }),
        stringOptionsFilter.extend({ column: z.enum(["name", "traceName"]) }),
        stringFilter.extend({
          column: z.enum([
            "traceName",
            "userId",
            "environment",
            "name",
            "type",
            "level",
          ]),
        }),
        arrayOptionsFilter.safeExtend({ column: z.literal("traceTags") }),
        stringObjectFilter.extend({ column: z.literal("metadata") }),
      ]),
    ),
  );
