import {
  getEventsSidebarDisabledReason,
  getSyncableEventsLuceneFilterState,
  planEventsSearchBarFilterSync,
  planEventsSidebarSearchSync,
} from "@/src/features/events/components/events-lucene-search-sync";

describe("events lucene search sync", () => {
  it("applies syncable search-bar filters to sidebar state while preserving non-lucene filters", () => {
    const result = planEventsSearchBarFilterSync({
      currentExplicitFilters: [
        {
          type: "stringOptions",
          column: "environment",
          operator: "any of",
          value: ["prod"],
        },
        {
          type: "string",
          column: "statusMessage",
          operator: "contains",
          value: "timeout",
        },
      ],
      previousSyncedFilters: [
        {
          type: "string",
          column: "statusMessage",
          operator: "contains",
          value: "timeout",
        },
      ],
      nextSearchQuery: 'name:"weather agent"',
      hideControls: false,
    });

    expect(result).toEqual({
      nextExplicitFilters: [
        {
          type: "stringOptions",
          column: "environment",
          operator: "any of",
          value: ["prod"],
        },
        {
          type: "string",
          column: "name",
          operator: "contains",
          value: "weather agent",
        },
      ],
      nextSyncedFilters: [
        {
          type: "string",
          column: "name",
          operator: "contains",
          value: "weather agent",
        },
      ],
    });
  });

  it("mirrors lucene-serializable sidebar filters back into the search query", () => {
    const result = planEventsSidebarSearchSync({
      currentSearchQuery: 'name:"weather agent"',
      nextExplicitFilters: [
        {
          type: "stringOptions",
          column: "environment",
          operator: "any of",
          value: ["prod"],
        },
        {
          type: "string",
          column: "statusMessage",
          operator: "contains",
          value: "timeout",
        },
      ],
      hideControls: false,
    });

    expect(result).toEqual({
      shouldUpdateSearchQuery: true,
      nextSearchQuery: 'statusMessage:"timeout"',
      nextSyncedFilters: [
        {
          type: "string",
          column: "statusMessage",
          operator: "contains",
          value: "timeout",
        },
      ],
    });
  });

  it("does not overwrite plain free-text search when sidebar filters change", () => {
    const result = planEventsSidebarSearchSync({
      currentSearchQuery: "customer timeout",
      nextExplicitFilters: [
        {
          type: "string",
          column: "statusMessage",
          operator: "contains",
          value: "timeout",
        },
      ],
      hideControls: false,
    });

    expect(result).toEqual({
      shouldUpdateSearchQuery: false,
      nextSearchQuery: "customer timeout",
      nextSyncedFilters: undefined,
    });
  });

  it("extracts only fielded conjunctive queries as syncable sidebar filters", () => {
    expect(
      getSyncableEventsLuceneFilterState(
        'statusMessage:"timeout" AND startTime:[2025-01-01 TO *]',
      ),
    ).toEqual([
      {
        type: "string",
        column: "statusMessage",
        operator: "contains",
        value: "timeout",
      },
      {
        type: "datetime",
        column: "startTime",
        operator: ">=",
        value: new Date("2025-01-01T00:00:00.000Z"),
      },
    ]);
  });

  it("keeps nested boolean queries in the search bar instead of flattening them into sidebar filters", () => {
    expect(
      getSyncableEventsLuceneFilterState(
        "name:weather AND (level:ERROR OR level:WARN)",
      ),
    ).toBeUndefined();

    expect(
      planEventsSearchBarFilterSync({
        currentExplicitFilters: [
          {
            type: "string",
            column: "statusMessage",
            operator: "contains",
            value: "timeout",
          },
        ],
        previousSyncedFilters: [
          {
            type: "string",
            column: "statusMessage",
            operator: "contains",
            value: "timeout",
          },
        ],
        nextSearchQuery: "name:weather AND (level:ERROR OR level:WARN)",
        hideControls: false,
      }),
    ).toEqual({
      nextExplicitFilters: [],
      nextSyncedFilters: undefined,
    });
  });

  it("does not overwrite nested boolean search queries when sidebar filters change", () => {
    expect(
      planEventsSidebarSearchSync({
        currentSearchQuery: "name:weather AND (level:ERROR OR level:WARN)",
        nextExplicitFilters: [
          {
            type: "string",
            column: "statusMessage",
            operator: "contains",
            value: "timeout",
          },
        ],
        hideControls: false,
      }),
    ).toEqual({
      shouldUpdateSearchQuery: false,
      nextSearchQuery: "name:weather AND (level:ERROR OR level:WARN)",
      nextSyncedFilters: undefined,
    });
  });

  it("disables the sidebar for grouped lucene filters that cannot sync into sidebar state", () => {
    expect(
      getEventsSidebarDisabledReason(
        "name:weather AND (level:ERROR OR level:WARN)",
      ),
    ).toBe(
      "Sidebar filters are disabled while the search bar contains grouped or chained Lucene filters. Simplify to flat AND clauses or clear the search bar to edit sidebar filters.",
    );

    expect(
      getEventsSidebarDisabledReason(
        'statusMessage:"timeout" AND startTime:[2025-01-01 TO *]',
      ),
    ).toBeUndefined();

    expect(getEventsSidebarDisabledReason("customer timeout")).toBeUndefined();
  });
});
