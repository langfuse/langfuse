import { describe, expect, it } from "vitest";

import { stringifyDatasetItemData } from "./datasetItemUtils";

describe("stringifyDatasetItemData", () => {
  it("returns empty string for null/undefined", () => {
    expect(stringifyDatasetItemData(null)).toBe("");
    expect(stringifyDatasetItemData(undefined)).toBe("");
  });

  // #14751: OTLP-ingested metadata often holds JSON-string values. They must
  // render as expanded JSON (like the trace viewer), not an escaped blob.
  it("expands a nested JSON-string metadata value", () => {
    const metadata = {
      "my.tools": '{"AgentA":[{"name":"getX","args":{"id":"1"}}]}',
    };

    const result = stringifyDatasetItemData(metadata);

    expect(result).not.toContain('\\"');
    expect(JSON.parse(result)).toEqual({
      "my.tools": { AgentA: [{ name: "getX", args: { id: "1" } }] },
    });
  });

  it("expands a top-level JSON-string value", () => {
    expect(stringifyDatasetItemData('{"answer":"London"}')).toBe(
      JSON.stringify({ answer: "London" }, null, 2),
    );
  });

  it("keeps a non-JSON string as a quoted string", () => {
    expect(stringifyDatasetItemData("hello world")).toBe('"hello world"');
  });

  it("does not mutate the input object", () => {
    const metadata = { nested: '{"a":1}' };
    stringifyDatasetItemData(metadata);
    expect(metadata.nested).toBe('{"a":1}');
  });
});
