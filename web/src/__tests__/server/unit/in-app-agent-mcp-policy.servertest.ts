import { describe, expect, expectTypeOf, it } from "vitest";

import {
  createInAppAgentToolPolicy,
  IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES,
  type InAppAgentLangfuseMcpToolName,
} from "@langfuse/shared/in-app-agent/server/mcpPolicy";
import {
  bootstrapMcpFeatures,
  type McpToolName,
} from "@/src/features/mcp/server/bootstrap";
import { toolRegistry } from "@/src/features/mcp/server/registry";
import { skillsFeature } from "@/src/features/mcp/server/skills";

describe("IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES", () => {
  it("exposes read-only Skills MCP tools to the assistant with skills read access", () => {
    const policy = createInAppAgentToolPolicy({
      userAccess: { projectRole: "VIEWER", isAdmin: false },
    });
    for (const { definition } of skillsFeature.tools) {
      expect(toolRegistry.getTool(definition.name)?.definition).toEqual(
        definition,
      );
      expect(definition.action).toBe("skills:read");
      expect(definition.annotations?.readOnlyHint).toBe(true);
      expect([...policy.available]).toContain(definition.name);
      expect([...policy.autoApproved]).toContain(definition.name);
    }
  });

  it("does not expose Skills MCP tools without user access", () => {
    const policy = createInAppAgentToolPolicy({});
    for (const { definition } of skillsFeature.tools) {
      expect([...policy.available]).not.toContain(definition.name);
      expect([...policy.autoApproved]).not.toContain(definition.name);
    }
  });

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
