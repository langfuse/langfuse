import { describe, expect, it } from "vitest";
import { zipObservationToolCalls } from "./observationForEval";

describe("zipObservationToolCalls", () => {
  it("zips ClickHouse parallel arrays into named tool calls with parsed arguments", () => {
    const result = zipObservationToolCalls({
      tool_calls: [
        '{"id":"call_1","arguments":"{\\"query\\":\\"weather\\"}","type":"function","index":0}',
        '{"id":"toolu_2","arguments":"{\\"city\\":\\"Berlin\\"}","type":"tool_use","index":1}',
      ],
      tool_call_names: ["search", "get_weather"],
    });

    expect(result).toEqual([
      {
        id: "call_1",
        name: "search",
        arguments: { query: "weather" },
        type: "function",
        index: 0,
      },
      {
        id: "toolu_2",
        name: "get_weather",
        arguments: { city: "Berlin" },
        type: "tool_use",
        index: 1,
      },
    ]);
  });

  it("returns an empty array for observations without tool calls", () => {
    expect(
      zipObservationToolCalls({ tool_calls: [], tool_call_names: [] }),
    ).toEqual([]);
  });

  it("keeps unparsable arguments as the raw string", () => {
    const result = zipObservationToolCalls({
      tool_calls: [
        '{"id":"call_1","arguments":"not json","type":"","index":0}',
      ],
      tool_call_names: ["search"],
    });

    expect(result[0]?.arguments).toBe("not json");
  });

  it("falls back to defaults when an entry is missing or malformed", () => {
    const result = zipObservationToolCalls({
      tool_calls: ["not json at all"],
      tool_call_names: ["search", "unmatched"],
    });

    expect(result).toEqual([
      { id: "", name: "search", arguments: {}, type: "", index: 0 },
      { id: "", name: "unmatched", arguments: {}, type: "", index: 0 },
    ]);
  });

  it("accepts entries that are already objects", () => {
    const result = zipObservationToolCalls({
      tool_calls: [
        { id: "call_1", arguments: { a: 1 }, type: "function", index: 2 },
      ],
      tool_call_names: ["search"],
    });

    expect(result).toEqual([
      {
        id: "call_1",
        name: "search",
        arguments: { a: 1 },
        type: "function",
        index: 2,
      },
    ]);
  });
});
