import {
  getEffectiveEventsSearchQueryForSync,
  getEventsSidebarDisabledReason,
  getSyncableEventsLuceneFilterState,
  planEventsSearchBarFilterSync,
  planEventsSidebarSearchSync,
} from "@/src/features/events/components/events-lucene-search-sync";

describe("events lucene search sync", () => {
  it("prefers the latest intended search query while the URL is still catching up", () => {
    expect(
      getEffectiveEventsSearchQueryForSync({
        latestSearchQuery: 'traceName:"ChatCompletion"',
        urlSearchQuery: "traceName:",
      }),
    ).toBe('traceName:"ChatCompletion"');

    expect(
      getEffectiveEventsSearchQueryForSync({
        latestSearchQuery: undefined,
        urlSearchQuery: 'environment:"prod"',
      }),
    ).toBe('environment:"prod"');
  });

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
          type: "stringOptions",
          column: "name",
          operator: "any of",
          value: ["weather agent"],
        },
      ],
      nextSyncedFilters: [
        {
          type: "stringOptions",
          column: "name",
          operator: "any of",
          value: ["weather agent"],
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
      nextSearchQuery: 'environment:"prod" AND statusMessage:"timeout"',
      nextSyncedFilters: [
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
    });
  });

  it("hydrates an empty search query from syncable sidebar filters", () => {
    const result = planEventsSidebarSearchSync({
      currentSearchQuery: "",
      nextExplicitFilters: [
        {
          type: "stringOptions",
          column: "environment",
          operator: "any of",
          value: ["langfuse-evaluation"],
        },
      ],
      hideControls: false,
    });

    expect(result).toEqual({
      shouldUpdateSearchQuery: true,
      nextSearchQuery: 'environment:"langfuse-evaluation"',
      nextSyncedFilters: [
        {
          type: "stringOptions",
          column: "environment",
          operator: "any of",
          value: ["langfuse-evaluation"],
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
        'traceName:"chat-trace" AND startTime:[2025-01-01 TO *]',
      ),
    ).toEqual([
      {
        type: "stringOptions",
        column: "traceName",
        operator: "any of",
        value: ["chat-trace"],
      },
      {
        type: "datetime",
        column: "startTime",
        operator: ">=",
        value: new Date("2025-01-01T00:00:00.000Z"),
      },
    ]);
  });

  it("keeps wildcard text filters syncable across the search bar and sidebar", () => {
    expect(getSyncableEventsLuceneFilterState('environment:"prod*"')).toEqual([
      {
        type: "string",
        column: "environment",
        operator: "starts with",
        value: "prod",
      },
    ]);

    expect(
      planEventsSidebarSearchSync({
        currentSearchQuery: "",
        nextExplicitFilters: [
          {
            type: "string",
            column: "environment",
            operator: "starts with",
            value: "prod",
          },
        ],
        hideControls: false,
      }),
    ).toEqual({
      shouldUpdateSearchQuery: true,
      nextSearchQuery: "environment:prod*",
      nextSyncedFilters: [
        {
          type: "string",
          column: "environment",
          operator: "starts with",
          value: "prod",
        },
      ],
    });
  });

  it("keeps nested boolean queries in the search bar instead of flattening them into sidebar filters", () => {
    expect(
      getSyncableEventsLuceneFilterState(
        "name:weather AND (level:ERROR OR level:WARN)",
      ),
    ).toEqual([
      {
        type: "stringOptions",
        column: "name",
        operator: "any of",
        value: ["weather"],
      },
      {
        type: "stringOptions",
        column: "level",
        operator: "any of",
        value: ["ERROR", "WARN"],
      },
    ]);

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
      nextExplicitFilters: [
        {
          type: "stringOptions",
          column: "name",
          operator: "any of",
          value: ["weather"],
        },
        {
          type: "stringOptions",
          column: "level",
          operator: "any of",
          value: ["ERROR", "WARN"],
        },
      ],
      nextSyncedFilters: [
        {
          type: "stringOptions",
          column: "name",
          operator: "any of",
          value: ["weather"],
        },
        {
          type: "stringOptions",
          column: "level",
          operator: "any of",
          value: ["ERROR", "WARN"],
        },
      ],
    });
  });

  it("merges sidebar filters into grouped same-field lucene queries", () => {
    expect(
      planEventsSidebarSearchSync({
        currentSearchQuery: "name:weather AND (level:ERROR OR level:WARN)",
        nextExplicitFilters: [
          {
            type: "stringOptions",
            column: "name",
            operator: "any of",
            value: ["weather"],
          },
          {
            type: "stringOptions",
            column: "level",
            operator: "any of",
            value: ["ERROR", "WARN"],
          },
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
      shouldUpdateSearchQuery: true,
      nextSearchQuery:
        'name:"weather" AND (level:"ERROR" OR level:"WARN") AND statusMessage:"timeout"',
      nextSyncedFilters: [
        {
          type: "stringOptions",
          column: "name",
          operator: "any of",
          value: ["weather"],
        },
        {
          type: "stringOptions",
          column: "level",
          operator: "any of",
          value: ["ERROR", "WARN"],
        },
        {
          type: "string",
          column: "statusMessage",
          operator: "contains",
          value: "timeout",
        },
      ],
    });
  });

  it("disables the sidebar only for lucene groups that cannot sync into sidebar state", () => {
    expect(
      getEventsSidebarDisabledReason(
        "name:weather AND (level:ERROR OR level:WARN)",
      ),
    ).toBeUndefined();

    expect(
      getEventsSidebarDisabledReason(
        "name:weather AND (level:ERROR OR (environment:prod AND sessionId:abc))",
      ),
    ).toBe("Sidebar is disabled for complex search bar filters.");

    expect(
      getEventsSidebarDisabledReason(
        'traceName:"chat-trace" AND startTime:[2025-01-01 TO *]',
      ),
    ).toBeUndefined();

    expect(getEventsSidebarDisabledReason("customer timeout")).toBeUndefined();
  });
});
