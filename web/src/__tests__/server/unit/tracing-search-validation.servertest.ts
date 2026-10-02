import {
  BatchActionQuerySchema,
  BatchExportQuerySchema,
  BatchTableNames,
} from "@langfuse/shared";
import { GenerationTableOptions } from "@/src/server/api/routers/generations/utils/GenerationTableOptions";
import { EventsTableOptions } from "@/src/features/events/server/types";

describe("tracing search validation", () => {
  const invalidSearch = {
    searchQuery: "alpha",
    searchType: [],
  };

  it.each([
    {
      name: "legacy observation table",
      schema: GenerationTableOptions,
      input: {
        projectId: "project-id",
        filter: [],
        orderBy: null,
        ...invalidSearch,
      },
    },
    {
      name: "v4 events table",
      schema: EventsTableOptions,
      input: {
        projectId: "project-id",
        filter: [],
        orderBy: null,
        ...invalidSearch,
      },
    },
    {
      name: "batch action",
      schema: BatchActionQuerySchema,
      input: {
        filter: null,
        orderBy: null,
        ...invalidSearch,
      },
    },
    {
      name: "batch export",
      schema: BatchExportQuerySchema,
      input: {
        tableName: BatchTableNames.Traces,
        filter: null,
        orderBy: null,
        ...invalidSearch,
      },
    },
  ])("rejects an empty search type list for $name", ({ schema, input }) => {
    expect(schema.safeParse(input).success).toBe(false);
  });

  it.each([GenerationTableOptions, EventsTableOptions])(
    "allows an empty search type list when the query is empty",
    (schema) => {
      expect(
        schema.safeParse({
          projectId: "project-id",
          filter: [],
          orderBy: null,
          searchQuery: "",
          searchType: [],
        }).success,
      ).toBe(true);
    },
  );
});
