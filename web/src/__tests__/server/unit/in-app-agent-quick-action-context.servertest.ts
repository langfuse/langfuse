import {
  getInAppAgentQuickActionTraceMetadata,
  sanitizeInAppAgentContext,
} from "@/src/ee/features/in-app-agent/context";

describe("in-app agent quick-action attribution", () => {
  it("exposes trace metadata for well-formed attribution and keeps it out of the model-visible context", () => {
    const context = [
      {
        description: "assistant_quick_action_id",
        value: "analyze-failure-patterns",
      },
      {
        description: "assistant_quick_action_context",
        value: "observability",
      },
    ];

    expect(getInAppAgentQuickActionTraceMetadata(context)).toEqual({
      assistant_quick_action_id: "analyze-failure-patterns",
      assistant_quick_action_context: "observability",
    });
    expect(sanitizeInAppAgentContext(context, "project-1")).toEqual([]);
  });

  it("rejects malformed attribution", () => {
    const invalidPairs = [
      ["INVALID!", "observability"],
      ["a".repeat(81), "observability"],
      ["analyze-failure-patterns", "unknown-context"],
    ] as const;

    for (const [actionId, quickActionContext] of invalidPairs) {
      expect(
        getInAppAgentQuickActionTraceMetadata([
          { description: "assistant_quick_action_id", value: actionId },
          {
            description: "assistant_quick_action_context",
            value: quickActionContext,
          },
        ]),
      ).toEqual({});
    }

    expect(
      getInAppAgentQuickActionTraceMetadata([
        {
          description: "assistant_quick_action_id",
          value: "analyze-failure-patterns",
        },
      ]),
    ).toEqual({});
  });
});
