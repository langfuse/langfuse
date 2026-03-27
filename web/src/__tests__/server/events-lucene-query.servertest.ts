import {
  extractEventsLuceneFlatFilterState,
  getEventsLuceneSerializableFilterState,
  resolveEventsLuceneQueryForApi,
  serializeEventsLuceneFilterState,
  validateEventsLuceneQuery,
  type EventsLuceneExpression,
} from "@langfuse/shared";

describe("events lucene query validation", () => {
  it("parses nested boolean logic with explicit NOT", () => {
    const validation = validateEventsLuceneQuery(
      '(name:"chat completion" OR metadata.environment:prod) AND NOT level:DEBUG',
    );

    expect(validation.isValid).toBe(true);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const expression = validation.expression as EventsLuceneExpression;
    expect(expression).toEqual({
      type: "group",
      operator: "AND",
      conditions: [
        {
          type: "group",
          operator: "OR",
          conditions: [
            {
              type: "text",
              field: { type: "field", id: "name" },
              value: "chat completion",
              quoted: true,
              wildcard: false,
              exists: false,
            },
            {
              type: "text",
              field: { type: "metadata", key: "environment" },
              value: "prod",
              quoted: false,
              wildcard: false,
              exists: false,
            },
          ],
        },
        {
          type: "not",
          condition: {
            type: "text",
            field: { type: "field", id: "level" },
            value: "DEBUG",
            quoted: false,
            wildcard: false,
            exists: false,
          },
        },
      ],
    });
  });

  it("rejects unsupported operators and fields", () => {
    const syntaxValidation = validateEventsLuceneQuery("(name:weather");
    expect(syntaxValidation.isValid).toBe(false);
    if (syntaxValidation.isValid) {
      throw new Error("Expected syntax validation to fail.");
    }
    expect(syntaxValidation.error).toContain("Invalid Lucene query:");

    const fuzzyValidation = validateEventsLuceneQuery("name:hello~2");
    expect(fuzzyValidation).toEqual({
      isValid: false,
      error:
        "Invalid Lucene query: Fuzzy search is not supported in events search.",
    });

    const proximityValidation = validateEventsLuceneQuery(
      'name:"chat completion"~2',
    );
    expect(proximityValidation).toEqual({
      isValid: false,
      error:
        "Invalid Lucene query: Phrase proximity search is not supported in events search.",
    });

    const wildcardFieldValidation = validateEventsLuceneQuery("meta*:prod");
    expect(wildcardFieldValidation).toEqual({
      isValid: false,
      error:
        "Invalid Lucene query: Field wildcards are not supported in events search.",
    });

    const fieldValidation = validateEventsLuceneQuery("toolName:weather");
    expect(fieldValidation.isValid).toBe(false);
    if (fieldValidation.isValid) {
      throw new Error("Expected unsupported field validation to fail.");
    }
    expect(fieldValidation.error).toContain(
      'Invalid Lucene query: Unsupported field "toolName". Supported fields:',
    );
    expect(fieldValidation.error).toContain("metadata.<key>.");
  });
});

describe("resolveEventsLuceneQueryForApi", () => {
  it("routes plain free text to searchQuery only", () => {
    expect(resolveEventsLuceneQueryForApi("customer failure")).toEqual({
      isValid: true,
      searchQuery: "customer failure",
      searchType: ["id", "content"],
    });
  });

  it("converts fully fielded lucene queries into filter expressions", () => {
    const resolved = resolveEventsLuceneQueryForApi(
      'name:"chat completion" OR metadata.environment:prod',
    );

    expect(resolved).toEqual({
      isValid: true,
      expression: {
        type: "group",
        operator: "OR",
        conditions: [
          {
            type: "text",
            field: { type: "field", id: "name" },
            value: "chat completion",
            quoted: true,
            wildcard: false,
            exists: false,
          },
          {
            type: "text",
            field: { type: "metadata", key: "environment" },
            value: "prod",
            quoted: false,
            wildcard: false,
            exists: false,
          },
        ],
      },
      filter: {
        type: "group",
        operator: "OR",
        conditions: [
          {
            type: "stringOptions",
            column: "name",
            operator: "any of",
            value: ["chat completion"],
          },
          {
            type: "stringObject",
            column: "metadata",
            key: "environment",
            operator: "contains",
            value: "prod",
          },
        ],
      },
    });
  });

  it("converts fielded negation into the filter abstraction", () => {
    expect(resolveEventsLuceneQueryForApi("NOT promptVersion:3")).toEqual({
      isValid: true,
      expression: {
        type: "not",
        condition: {
          type: "text",
          field: { type: "field", id: "promptVersion" },
          value: "3",
          quoted: false,
          wildcard: false,
          exists: false,
        },
      },
      filter: {
        type: "group",
        operator: "OR",
        conditions: [
          {
            type: "number",
            column: "promptVersion",
            operator: "<",
            value: 3,
          },
          {
            type: "number",
            column: "promptVersion",
            operator: ">",
            value: 3,
          },
        ],
      },
    });
  });

  it("preserves nested and chained boolean groups in the filter abstraction", () => {
    expect(
      resolveEventsLuceneQueryForApi(
        "name:weather AND (level:ERROR OR (environment:prod AND NOT sessionId:abc))",
      ),
    ).toEqual({
      isValid: true,
      expression: {
        type: "group",
        operator: "AND",
        conditions: [
          {
            type: "text",
            field: { type: "field", id: "name" },
            value: "weather",
            quoted: false,
            wildcard: false,
            exists: false,
          },
          {
            type: "group",
            operator: "OR",
            conditions: [
              {
                type: "text",
                field: { type: "field", id: "level" },
                value: "ERROR",
                quoted: false,
                wildcard: false,
                exists: false,
              },
              {
                type: "group",
                operator: "AND",
                conditions: [
                  {
                    type: "text",
                    field: { type: "field", id: "environment" },
                    value: "prod",
                    quoted: false,
                    wildcard: false,
                    exists: false,
                  },
                  {
                    type: "not",
                    condition: {
                      type: "text",
                      field: { type: "field", id: "sessionId" },
                      value: "abc",
                      quoted: false,
                      wildcard: false,
                      exists: false,
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      filter: {
        type: "group",
        operator: "AND",
        conditions: [
          {
            type: "stringOptions",
            column: "name",
            operator: "any of",
            value: ["weather"],
          },
          {
            type: "group",
            operator: "OR",
            conditions: [
              {
                type: "stringOptions",
                column: "level",
                operator: "any of",
                value: ["ERROR"],
              },
              {
                type: "group",
                operator: "AND",
                conditions: [
                  {
                    type: "stringOptions",
                    column: "environment",
                    operator: "any of",
                    value: ["prod"],
                  },
                  {
                    type: "stringOptions",
                    column: "sessionId",
                    operator: "none of",
                    value: ["abc"],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  });

  it("extracts conjunctive lucene filters for sidebar sync and serializes them back", () => {
    const resolved = resolveEventsLuceneQueryForApi(
      'name:"chat completion" AND (NOT level:DEBUG) AND startTime:[2025-01-01 TO *]',
    );

    expect(resolved.isValid).toBe(true);
    if (!resolved.isValid) {
      throw new Error(resolved.error);
    }

    const flatFilterState = extractEventsLuceneFlatFilterState(resolved.filter);

    expect(flatFilterState).toEqual([
      {
        type: "stringOptions",
        column: "name",
        operator: "any of",
        value: ["chat completion"],
      },
      {
        type: "stringOptions",
        column: "level",
        operator: "none of",
        value: ["DEBUG"],
      },
      {
        type: "datetime",
        column: "startTime",
        operator: ">=",
        value: new Date("2025-01-01T00:00:00.000Z"),
      },
    ]);

    expect(serializeEventsLuceneFilterState(flatFilterState ?? [])).toBe(
      'name:"chat completion" AND NOT level:"DEBUG" AND startTime:[2025-01-01T00:00:00.000Z TO *]',
    );
  });

  it("keeps only lucene-serializable sidebar filters when mirroring state", () => {
    expect(
      getEventsLuceneSerializableFilterState([
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
        {
          type: "stringObject",
          column: "metadata",
          key: "tenant",
          operator: "does not contain",
          value: "internal",
        },
        {
          type: "number",
          column: "latency",
          operator: ">=",
          value: 2,
        },
        {
          type: "boolean",
          column: "hasParentObservation",
          operator: "=",
          value: true,
        },
      ]),
    ).toEqual([
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
      {
        type: "stringObject",
        column: "metadata",
        key: "tenant",
        operator: "does not contain",
        value: "internal",
      },
      {
        type: "number",
        column: "latency",
        operator: ">=",
        value: 2,
      },
      {
        type: "boolean",
        column: "hasParentObservation",
        operator: "=",
        value: true,
      },
    ]);
  });

  it("collapses exact-option OR groups back into syncable sidebar filters", () => {
    const resolved = resolveEventsLuceneQueryForApi(
      '(traceName:"trace-1" OR traceName:"trace-2") AND name:"chat-agent"',
    );

    expect(resolved.isValid).toBe(true);
    if (!resolved.isValid) {
      throw new Error(resolved.error);
    }

    expect(extractEventsLuceneFlatFilterState(resolved.filter)).toEqual([
      {
        type: "stringOptions",
        column: "traceName",
        operator: "any of",
        value: ["trace-1", "trace-2"],
      },
      {
        type: "stringOptions",
        column: "name",
        operator: "any of",
        value: ["chat-agent"],
      },
    ]);
  });

  it("rejects lucene operators without explicit fields", () => {
    expect(resolveEventsLuceneQueryForApi("foo OR bar")).toEqual({
      isValid: false,
      error:
        "Invalid Lucene query: Lucene operators require explicit field names in the events search bar. Use plain free text for broad search, or fielded clauses like name:weather AND level:ERROR.",
    });
  });

  it("rejects mixed fielded and bare lucene clauses", () => {
    expect(resolveEventsLuceneQueryForApi("name:weather OR trace-123")).toEqual(
      {
        isValid: false,
        error:
          "Invalid Lucene query: When you use Lucene filters in the events search bar, every clause must specify a field. Use plain free text alone, or add fields like name:weather OR traceId:trace-123.",
      },
    );
  });
});
