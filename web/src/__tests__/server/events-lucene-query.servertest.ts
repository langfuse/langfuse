import {
  resolveEventsLuceneQueryForApi,
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
    expect(fieldValidation).toEqual({
      isValid: false,
      error:
        'Invalid Lucene query: Unsupported field "toolName". Supported fields: id, traceId, name, traceName, type, environment, userId, sessionId, level, statusMessage, modelId, providedModelName, promptName, promptVersion, startTime, endTime, input, output, metadata.<key>.',
    });
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
            type: "string",
            column: "name",
            operator: "contains",
            value: "chat completion",
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
