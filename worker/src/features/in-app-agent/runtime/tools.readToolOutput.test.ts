import { describe, expect, it } from "vitest";

import {
  buildReadToolOutputResult,
  type ReadToolOutputFn,
} from "./tools";

describe("buildReadToolOutputResult", () => {
  it("serializes the fetched page as JSON", async () => {
    const fetchOutput: ReadToolOutputFn = async () => ({
      toolCallId: "call-1",
      totalChars: 100,
      offset: 0,
      returnedChars: 100,
      hasMore: false,
      content: "x".repeat(100),
    });

    const result = await buildReadToolOutputResult(fetchOutput, {
      toolCallId: "call-1",
    });

    expect(JSON.parse(result)).toEqual({
      toolCallId: "call-1",
      totalChars: 100,
      offset: 0,
      returnedChars: 100,
      hasMore: false,
      content: "x".repeat(100),
    });
  });

  it("returns a structured error when the toolCallId is unknown", async () => {
    const fetchOutput: ReadToolOutputFn = async () => null;

    const result = await buildReadToolOutputResult(fetchOutput, {
      toolCallId: "missing",
      offset: 5,
      limit: 10,
    });

    expect(JSON.parse(result)).toEqual({
      toolCallId: "missing",
      error:
        "No persisted tool result found for this toolCallId in this conversation.",
    });
  });
});
