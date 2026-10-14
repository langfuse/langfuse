import { describe, expect, it } from "vitest";

import { parseStructuredStatusMessage } from "./statusMessagePresentation";

describe("parseStructuredStatusMessage", () => {
  it("parses JSON objects and arrays", () => {
    expect(
      parseStructuredStatusMessage('{"error":{"retryable":true}}'),
    ).toEqual({
      error: { retryable: true },
    });
    expect(parseStructuredStatusMessage('[{"code":"timeout"}]')).toEqual([
      { code: "timeout" },
    ]);
  });

  it("leaves plain text and JSON scalars as text", () => {
    expect(parseStructuredStatusMessage("Request timed out")).toBeUndefined();
    expect(parseStructuredStatusMessage("404")).toBeUndefined();
    expect(parseStructuredStatusMessage('"Request timed out"')).toBeUndefined();
  });

  it("does not parse oversized status messages", () => {
    expect(
      parseStructuredStatusMessage(`{"message":"${"x".repeat(5_000)}"}`),
    ).toBeUndefined();
  });
});
