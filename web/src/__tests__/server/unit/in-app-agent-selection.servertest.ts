import { describe, expect, it } from "vitest";

import { IN_APP_AGENT_TRACE_SELECTION_TOOL_NAME } from "@/src/ee/features/in-app-agent/constants";
import { InAppAgentRuntimeStateSchema } from "@/src/ee/features/in-app-agent/schema";
import {
  createSelectedTraceIdentifiersTool,
  withInAppAgentToolApproval,
} from "@/src/ee/features/in-app-agent/server/tools";

describe("createSelectedTraceIdentifiersTool", () => {
  it("returns a deduplicated large selection in bounded pages", async () => {
    const tool = createSelectedTraceIdentifiersTool({
      kind: "traces",
      ids: [
        ...Array.from({ length: 55 }, (_, index) => `trace-${index}`),
        "trace-0",
      ],
    });
    const tools = withInAppAgentToolApproval({
      [IN_APP_AGENT_TRACE_SELECTION_TOOL_NAME]: tool,
    });

    expect(
      InAppAgentRuntimeStateSchema.safeParse({
        type: "newConversation",
        projectId: "project-1",
        traceSelection: {
          kind: "traces",
          ids: Array.from({ length: 55 }, (_, index) => `trace-${index}`),
        },
      }).success,
    ).toBe(true);
    expect(
      tools[IN_APP_AGENT_TRACE_SELECTION_TOOL_NAME]?.requireApproval,
    ).not.toBe(true);

    await expect(tool.execute?.({} as never, {} as never)).resolves.toEqual({
      kind: "traces",
      ids: Array.from({ length: 50 }, (_, index) => `trace-${index}`),
      totalCount: 55,
      nextCursor: 50,
    });
    await expect(
      tool.execute?.({ cursor: 50 } as never, {} as never),
    ).resolves.toEqual({
      kind: "traces",
      ids: Array.from({ length: 5 }, (_, index) => `trace-${index + 50}`),
      totalCount: 55,
      nextCursor: null,
    });
  });
});
