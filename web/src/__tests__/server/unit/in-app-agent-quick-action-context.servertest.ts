import {
  getInAppAgentMessageEntryPointTraceMetadata,
  getInAppAgentQuickActionTraceMetadata,
  sanitizeInAppAgentContext,
} from "@/src/ee/features/in-app-agent/context";

describe("in-app agent quick-action attribution", () => {
  it("exposes trace metadata for well-formed attribution and keeps it out of the model-visible context", () => {
    const context = [
      {
        description: "quick_action_key",
        value: "analyze-failure-patterns",
      },
      {
        description: "quick_action_category",
        value: "observability",
      },
    ];

    expect(getInAppAgentQuickActionTraceMetadata(context)).toEqual({
      quick_action_key: "analyze-failure-patterns",
      quick_action_category: "observability",
    });
    expect(sanitizeInAppAgentContext(context, "project-1")).toEqual([]);
  });

  it("rejects malformed attribution", () => {
    const invalidPairs = [
      ["INVALID!", "observability"],
      ["a".repeat(81), "observability"],
      ["analyze-failure-patterns", "unknown-context"],
    ] as const;

    for (const [quickActionKey, quickActionCategory] of invalidPairs) {
      expect(
        getInAppAgentQuickActionTraceMetadata([
          { description: "quick_action_key", value: quickActionKey },
          {
            description: "quick_action_category",
            value: quickActionCategory,
          },
        ]),
      ).toEqual({});
    }

    expect(
      getInAppAgentQuickActionTraceMetadata([
        {
          description: "quick_action_key",
          value: "analyze-failure-patterns",
        },
      ]),
    ).toEqual({});
  });
});

describe("in-app agent message entry point", () => {
  it("exposes allowlisted entry points as trace metadata and keeps them out of the model-visible context", () => {
    const context = [
      { description: "message_entry_point", value: "add-widget-modal" },
    ];

    expect(getInAppAgentMessageEntryPointTraceMetadata(context)).toEqual({
      message_entry_point: "add-widget-modal",
    });
    expect(sanitizeInAppAgentContext(context, "project-1")).toEqual([]);

    expect(
      getInAppAgentMessageEntryPointTraceMetadata([
        { description: "message_entry_point", value: "not-a-real-source" },
      ]),
    ).toEqual({});
  });
});
