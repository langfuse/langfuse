import { z } from "zod";
import {
  singleFilterList,
  stringFilter,
  arrayOptionsFilter,
  stringObjectFilter,
} from "../../interfaces/filters";
import { type ColumnDefinition } from "../../tableDefinitions";

export const sessionTraceFilterColumns: ColumnDefinition[] = [
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
    id: "rootName",
    name: "Root observation name",
    type: "string",
    internal: "name",
  },
  {
    id: "rootType",
    name: "Root observation type",
    type: "string",
    internal: "type",
  },
  {
    id: "rootLevel",
    name: "Root observation level",
    type: "string",
    internal: "level",
  },
  {
    id: "rootMetadata",
    name: "Root observation metadata",
    type: "stringObject",
    internal: "metadata",
  },
];

export const sessionTraceFilterSchema = singleFilterList.pipe(
  z.array(
    z.discriminatedUnion("type", [
      stringFilter.extend({
        column: z.enum([
          "traceName",
          "userId",
          "environment",
          "rootName",
          "rootType",
          "rootLevel",
        ]),
      }),
      arrayOptionsFilter.safeExtend({ column: z.literal("traceTags") }),
      stringObjectFilter.extend({ column: z.literal("rootMetadata") }),
    ]),
  ),
);
