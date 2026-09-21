import { Tool } from "@mastra/core/tools";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { withOptionalSilentMcpOutput } from "./tools";

// Shape of a real MCP CallToolResult from getObservationFilterValues: the
// VALUES JSON lives in content[].text, with no AI SDK `{ type, value }`.
const FILTER_VALUES_JSON = JSON.stringify({
  type: "VALUES",
  column: "name",
  values: [
    { value: "Codex Turn", count: 12 },
    { value: "generation", count: 40 },
  ],
  meta: {},
});

const FILTER_VALUES_MCP_RESULT = {
  content: [{ type: "text", text: FILTER_VALUES_JSON }],
};

const dummySandbox = {
  async read() {
    return null;
  },
  async write() {
    return null;
  },
  async edit() {
    return null;
  },
  async bash() {
    return null;
  },
};

describe("in-app agent MCP toModelOutput", () => {
  it("maps an MCP CallToolResult to AI SDK { type, value }", async () => {
    const tools = withOptionalSilentMcpOutput({
      tools: {
        langfuse_getObservationFilterValues: new Tool({
          id: "langfuse_getObservationFilterValues",
          description: "Get observation filter values",
          inputSchema: z.object({ column: z.string() }),
          execute: async () => FILTER_VALUES_MCP_RESULT,
        }),
      },
      sandbox: dummySandbox,
    });
    const tool = tools.langfuse_getObservationFilterValues;
    const result = await tool.execute?.({ column: "name" }, {
      agent: { toolCallId: "tooluse_filter_values" },
    } as never);

    const output = tool.toModelOutput?.(result);

    // execute() stays the MCP envelope for events + sandbox rewind.
    // toModelOutput only wraps it so providers can serialize output.value.
    expect(result).toEqual(FILTER_VALUES_MCP_RESULT);
    expect(output).toEqual({
      type: "json",
      value: FILTER_VALUES_MCP_RESULT,
    });
    expect(JSON.stringify(output)).toContain("Codex Turn");
  });
});
