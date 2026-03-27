import {
  normalizeEventsLuceneAutocompleteValues,
  resolveEventsLuceneCompletionItems,
  tokenizeEventsLuceneQuery,
} from "@/src/features/events/components/events-lucene-search-utils";

describe("events lucene search autocomplete", () => {
  it("suggests field names when starting a query", () => {
    const result = resolveEventsLuceneCompletionItems("", 0, {});

    expect(result.from).toBe(0);
    expect(result.items.map((item) => item.label)).toEqual(
      expect.arrayContaining(["environment:", "id:", "name:", "traceId:"]),
    );
    expect(
      result.items.find((item) => item.label === "environment:"),
    ).toMatchObject({
      section: "Fields",
    });
  });

  it("suggests observed field values for known option fields", () => {
    const result = resolveEventsLuceneCompletionItems("level:D", 7, {
      level: ["DEBUG", "ERROR"],
    });

    expect(result.from).toBe(6);
    expect(result.items.map((item) => item.label)).toContain("DEBUG");
    expect(result.items.find((item) => item.label === "DEBUG")).toMatchObject({
      apply: "DEBUG",
      section: "Observed Values",
    });
  });

  it("keeps quoted completions inside the existing quote context", () => {
    const result = resolveEventsLuceneCompletionItems('name:"cha', 9, {
      name: ["chat completion"],
    });

    expect(result.from).toBe(6);
    expect(
      result.items.find((item) => item.label === "chat completion")?.apply,
    ).toBe('chat completion"');
  });

  it("suggests datetime snippets for datetime fields", () => {
    const result = resolveEventsLuceneCompletionItems("startTime:", 10, {});

    expect(result.items.map((item) => item.label)).toContain(
      "[2025-01-01 TO 2025-01-31]",
    );
    expect(
      result.items.find((item) => item.label === "[2025-01-01 TO 2025-01-31]"),
    ).toMatchObject({
      section: "Patterns",
    });
  });

  it("groups boolean operators separately after a completed clause", () => {
    const result = resolveEventsLuceneCompletionItems("level:ERROR ", 12, {});

    expect(result.items.find((item) => item.label === "AND")).toMatchObject({
      section: "Operators",
    });
    expect(
      result.items.find((item) => item.label === "AND (...)"),
    ).toMatchObject({
      apply: "AND (",
      section: "Patterns",
    });
  });

  it("normalizes sidebar filter options into plain autocomplete values", () => {
    expect(
      normalizeEventsLuceneAutocompleteValues([
        { value: "production" },
        { value: "staging" },
      ]),
    ).toEqual(["production", "staging"]);
  });
});

describe("events lucene search highlighting", () => {
  it("classifies lucene tokens for fields, operators, and values", () => {
    const tokens = tokenizeEventsLuceneQuery(
      "name:weather AND (level:ERROR OR level:WARN)",
    );

    expect(tokens).toEqual(
      expect.arrayContaining([
        { text: "name", token: "propertyName" },
        { text: "weather", token: "variableName" },
        { text: "(", token: "bracket" },
        { text: "level", token: "propertyName" },
        { text: ":", token: "punctuation" },
        { text: "ERROR", token: "variableName" },
        { text: "AND", token: "keyword" },
        { text: "OR", token: "keyword" },
        { text: "WARN", token: "variableName" },
        { text: ")", token: "bracket" },
      ]),
    );
  });
});
