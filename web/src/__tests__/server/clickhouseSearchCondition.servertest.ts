import { env } from "@/src/env.mjs";
import { type TracingSearchType } from "@langfuse/shared";
import {
  clickhouseSearchCondition,
  createEvent,
  createEventsCh,
  getObservationsWithModelDataFromEventsTable,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

const maybeEventsTable =
  env.LANGFUSE_ENABLE_EVENTS_TABLE_V2_APIS === "true"
    ? describe
    : describe.skip;

const searchFixture = `
  SELECT *
  FROM values(
    'id String, name String, input String, output String',
    ('id-match', 'alpha name', 'unrelated input', 'unrelated output'),
    ('input-match-lowercase', 'plain name', 'contains alpha token', 'unrelated output'),
    ('output-match-lowercase', 'plain name', 'unrelated input', 'contains alpha token'),
    ('input-match-uppercase', 'plain name', 'contains ALPHA token', 'unrelated output'),
    ('output-match-uppercase', 'plain name', 'unrelated input', 'contains ALPHA token'),
    ('input-match-substring', 'plain name', 'contains alphabet token', 'unrelated output'),
    ('output-match-substring', 'plain name', 'unrelated input', 'contains alphabet token'),
    ('input-match-cyrillic', 'plain name', 'contains привет token', 'unrelated output'),
    ('output-match-cyrillic', 'plain name', 'unrelated input', 'contains привет token'),
    ('input-match-cjk', 'plain name', 'contains 東京 token', 'unrelated output'),
    ('output-match-cjk', 'plain name', 'unrelated input', 'contains 東京 token'),
    ('input-match-escaped-cjk', 'plain name', 'contains \\\\u6771\\\\u4eac token', 'unrelated output'),
    ('output-match-escaped-cjk', 'plain name', 'unrelated input', 'contains \\\\u6771\\\\u4eac token'),
    ('miss', 'plain name', 'unrelated input', 'unrelated output')
  ) AS e
`;

const matchingIds = async (opts: {
  query: string;
  searchType: TracingSearchType[];
  useEventsTablePath?: boolean;
}) => {
  const search = clickhouseSearchCondition({
    query: opts.query,
    searchType: opts.searchType,
    tablePrefix: "e",
    searchColumns: ["id", "name"],
    useEventsTablePath: opts.useEventsTablePath,
  });

  const rows = await queryClickhouse<{ id: string }>({
    query: `
      SELECT e.id AS id
      FROM (${searchFixture}) AS e
      WHERE 1 = 1
      ${search.query}
      ORDER BY e.id ASC
    `,
    params: search.params,
    preferredClickhouseService: "EventsReadOnly",
    tags: {
      feature: "clickhouse-search-condition-test",
      type: "events",
      kind: "test",
    },
  });

  return rows.map((row) => row.id);
};

describe("clickhouseSearchCondition", () => {
  it.each([
    { query: undefined, searchType: ["content"], expected: false },
    { query: "alpha", searchType: undefined, expected: false },
    { query: "alpha", searchType: ["id"], expected: false },
    { query: "alpha", searchType: ["content"], expected: true },
    { query: "alpha", searchType: ["input"], expected: true },
    { query: "alpha", searchType: ["output"], expected: true },
    { query: "alpha", searchType: ["id", "content"], expected: true },
  ])(
    "detects whether $searchType search needs the full events table",
    ({ query, searchType, expected }) => {
      expect(
        clickhouseSearchCondition({
          query,
          searchType: searchType as TracingSearchType[] | undefined,
        }).requiresEventsFull,
      ).toBe(expected);
    },
  );

  maybeEventsTable("EventsReadOnly-backed search conditions", () => {
    it.each([
      {
        query: "alpha",
        searchType: ["content"],
        expectedIds: [
          "input-match-lowercase",
          "input-match-substring",
          "input-match-uppercase",
          "output-match-lowercase",
          "output-match-substring",
          "output-match-uppercase",
        ],
      },
      {
        query: "alpha",
        searchType: ["input"],
        expectedIds: [
          "input-match-lowercase",
          "input-match-substring",
          "input-match-uppercase",
        ],
      },
      {
        query: "alpha",
        searchType: ["output"],
        expectedIds: [
          "output-match-lowercase",
          "output-match-substring",
          "output-match-uppercase",
        ],
      },
      {
        query: "привет",
        searchType: ["content"],
        expectedIds: ["input-match-cyrillic", "output-match-cyrillic"],
      },
      {
        query: "東京",
        searchType: ["content"],
        expectedIds: [
          "input-match-cjk",
          "input-match-escaped-cjk",
          "output-match-cjk",
          "output-match-escaped-cjk",
        ],
      },
    ])(
      "matches expected substring rows for $query $searchType search",
      async ({ query, searchType, expectedIds }) => {
        await expect(
          matchingIds({
            query,
            searchType: searchType as TracingSearchType[],
          }),
        ).resolves.toEqual(expectedIds);
      },
    );

    it("does not add FTS to id search on events tables", async () => {
      const baseIds = await matchingIds({
        query: "alpha",
        searchType: ["id"],
      });
      const ftsIds = await matchingIds({
        query: "alpha",
        searchType: ["id"],
        useEventsTablePath: true,
      });

      expect(baseIds).toEqual(["id-match"]);
      expect(ftsIds).toEqual(baseIds);
    });

    it("matches JSON-escaped Unicode content on events tables with the FTS prefilter", async () => {
      const search = clickhouseSearchCondition({
        query: "東京",
        searchType: ["content"],
        tablePrefix: "e",
        searchColumns: ["id", "name"],
        useEventsTablePath: true,
      });

      expect(search.params).toMatchObject({
        searchString: "%東京%",
        searchStringEscaped: "%\\u6771\\u4eac%",
      });
      expect(search.query).toContain("{searchStringEscaped: String}");
      expect(search.query).toContain(
        "hasAllTokens(lower(e.input), lower({searchStringEscaped: String}))",
      );
      expect(search.query).toContain(
        "hasAllTokens(lower(e.output), lower({searchStringEscaped: String}))",
      );

      await expect(
        matchingIds({
          query: "東京",
          searchType: ["content"],
          useEventsTablePath: true,
        }),
      ).resolves.toEqual([
        "input-match-cjk",
        "input-match-escaped-cjk",
        "output-match-cjk",
        "output-match-escaped-cjk",
      ]);
    });

    it("round-trips raw and JSON-escaped Unicode through events_full search", async () => {
      const uniqueProjectId = randomUUID();
      const traceId = randomUUID();
      const rawSpanId = randomUUID();
      const escapedSpanId = randomUUID();
      const rawInput = `{"message":"東京"}`;
      const escapedInput = `{"message":"\\u6771\\u4eac"}`;

      await createEventsCh([
        createEvent({
          id: rawSpanId,
          span_id: rawSpanId,
          project_id: uniqueProjectId,
          trace_id: traceId,
          type: "GENERATION",
          name: "raw-unicode-search-roundtrip",
          input: rawInput,
          output: "ascii output",
        }),
        createEvent({
          id: escapedSpanId,
          span_id: escapedSpanId,
          project_id: uniqueProjectId,
          trace_id: traceId,
          type: "GENERATION",
          name: "escaped-unicode-search-roundtrip",
          input: escapedInput,
          output: "ascii output",
        }),
      ]);

      const stored = await queryClickhouse<{ span_id: string; input: string }>({
        query: `
          SELECT span_id, input
          FROM events_full
          WHERE project_id = {projectId: String}
            AND span_id IN ({rawSpanId: String}, {escapedSpanId: String})
          ORDER BY span_id ASC
        `,
        params: {
          projectId: uniqueProjectId,
          rawSpanId,
          escapedSpanId,
        },
        preferredClickhouseService: "EventsReadOnly",
        tags: {
          feature: "clickhouse-search-condition-test",
          type: "events",
          kind: "test",
        },
      });

      expect(stored).toHaveLength(2);
      expect(rawInput).not.toBe(escapedInput);

      const storedInputBySpanId = new Map(
        stored.map((row) => [row.span_id, row.input]),
      );
      expect(storedInputBySpanId.get(rawSpanId)).toBe(rawInput);
      expect(storedInputBySpanId.get(escapedSpanId)).toBe(escapedInput);

      const observations = await getObservationsWithModelDataFromEventsTable({
        projectId: uniqueProjectId,
        filter: [],
        searchQuery: "東京",
        searchType: ["content"],
        limit: 100,
        offset: 0,
      });

      expect(observations.map((observation) => observation.id).sort()).toEqual(
        [rawSpanId, escapedSpanId].sort(),
      );
    });
  });

  it("generates FTS predicates for events input/output searches", () => {
    const search = clickhouseSearchCondition({
      query: "alpha",
      searchType: ["content"],
      tablePrefix: "e",
      useEventsTablePath: true,
    });

    expect(search.query).toContain("hasAllTokens");
    expect(search.query).toContain("e.input");
    expect(search.query).toContain("e.output");
  });

  it("does not generate FTS predicates for id searches", () => {
    const ftsSearch = clickhouseSearchCondition({
      query: "alpha",
      searchType: ["id"],
      tablePrefix: "e",
      searchColumns: ["id", "name"],
      useEventsTablePath: true,
    });

    expect(ftsSearch.query).not.toContain("hasAllTokens");
  });
});
