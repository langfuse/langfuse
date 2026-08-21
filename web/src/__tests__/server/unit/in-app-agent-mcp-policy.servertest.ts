import { describe, expect, expectTypeOf, it } from "vitest";

import {
  IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES,
  type InAppAgentLangfuseMcpToolName,
} from "@langfuse/shared/in-app-agent/server/mcpPolicy";
import {
  bootstrapMcpFeatures,
  type McpToolName,
} from "@/src/features/mcp/server/bootstrap";
import { toolRegistry } from "@/src/features/mcp/server/registry";

describe("IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES", () => {
  it("classifies every Langfuse MCP tool exactly once", () => {
    expect(bootstrapMcpFeatures).toBeTypeOf("function");
    expectTypeOf<InAppAgentLangfuseMcpToolName>().toEqualTypeOf<McpToolName>();

    const registeredToolNames = toolRegistry
      .getFeatures()
      .flatMap((feature) => feature.tools.map((tool) => tool.definition.name))
      .sort();
    const classifiedToolNames = Object.keys(
      IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES,
    ).sort();

    expect(classifiedToolNames).toEqual(registeredToolNames);
  });
});
