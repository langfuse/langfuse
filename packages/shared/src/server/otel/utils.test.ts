import { describe, expect, it } from "vitest";

import { isLangGraphControlFlowInterruptSpan } from "./utils";

describe("isLangGraphControlFlowInterruptSpan", () => {
  it("returns true for GraphInterrupt exception events on error spans", () => {
    expect(
      isLangGraphControlFlowInterruptSpan({
        status: { code: 2 },
        events: [
          {
            name: "exception",
            attributes: [
              {
                key: "exception.type",
                value: { stringValue: "langgraph.errors.GraphInterrupt" },
              },
            ],
          },
        ],
      }),
    ).toBe(true);
  });

  it("returns true for GraphBubbleUp exception events on error spans", () => {
    expect(
      isLangGraphControlFlowInterruptSpan({
        status: { code: 2 },
        events: [
          {
            name: "exception",
            attributes: [
              {
                key: "exception.type",
                value: { stringValue: "langgraph.errors.GraphBubbleUp" },
              },
            ],
          },
        ],
      }),
    ).toBe(true);
  });

  it("returns false for real errors", () => {
    expect(
      isLangGraphControlFlowInterruptSpan({
        status: { code: 2 },
        events: [
          {
            name: "exception",
            attributes: [
              {
                key: "exception.type",
                value: { stringValue: "ValueError" },
              },
            ],
          },
        ],
      }),
    ).toBe(false);
  });
});
