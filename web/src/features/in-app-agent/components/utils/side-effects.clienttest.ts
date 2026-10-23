import { IN_APP_AGENT_TOOL_REJECTION_ERROR_CODE } from "@langfuse/shared/in-app-agent";
import { performToolSideEffectsForCompletedToolCalls } from "./side-effects";

function createUtils() {
  const invalidate = vi.fn().mockResolvedValue(undefined);
  const utils = { skills: { invalidate } } as unknown as Parameters<
    typeof performToolSideEffectsForCompletedToolCalls
  >[0]["utils"];
  return { utils, invalidate };
}

describe("skill tool side effects", () => {
  it("invalidates skills for approved skill write tools", async () => {
    const { utils, invalidate } = createUtils();
    const handledToolCallIds = new Set<string>();

    for (const toolName of [
      "langfuse_createSkillVersion",
      "langfuse_updateSkillLabels",
      "langfuse_updateSkillTags",
    ]) {
      await performToolSideEffectsForCompletedToolCalls({
        toolCalls: [{ toolCallId: toolName, toolName }],
        handledToolCallIds,
        utils,
      });
    }

    expect(invalidate).toHaveBeenCalledTimes(3);
  });

  it("does not invalidate skills for a rejected call", async () => {
    const { utils, invalidate } = createUtils();

    await performToolSideEffectsForCompletedToolCalls({
      toolCalls: [
        {
          toolCallId: "rejected-label-update",
          toolName: "langfuse_updateSkillLabels",
          toolError: JSON.stringify({
            code: IN_APP_AGENT_TOOL_REJECTION_ERROR_CODE,
          }),
        },
      ],
      handledToolCallIds: new Set(),
      utils,
    });

    expect(invalidate).not.toHaveBeenCalled();
  });
});
