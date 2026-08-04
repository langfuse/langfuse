import { sanitizeInAppAgentContext } from "@/src/features/in-app-agent/fns/sanitizeInAppAgentContext";
import { getInAppAgentMessageEntryPointTraceMetadata } from "./getInAppAgentMessageEntryPointTraceMetadata";

describe("getInAppAgentMessageEntryPointTraceMetadata", () => {
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
