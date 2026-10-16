import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";

import {
  IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES,
  type InAppAgentLangfuseMcpToolName,
} from "@langfuse/shared/in-app-agent/server/mcpPolicy";
import {
  bootstrapMcpFeatures,
  type McpToolName,
} from "@/src/features/mcp/server/bootstrap";
import { toolRegistry } from "@/src/features/mcp/server/registry";
import { skillsFeature } from "@/src/features/mcp/server/skills";
import { observationsFeature } from "@/src/features/mcp/server/observations";
import { externalMediaStorageFeature } from "@/src/features/mcp/server/externalMediaStorage";
import type { ServerContext } from "@/src/features/mcp/types";

describe("IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES", () => {
  it("keeps Skills MCP tools unregistered", () => {
    for (const { definition } of skillsFeature.tools) {
      expect(toolRegistry.getTool(definition.name)).toBeUndefined();
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

describe("MCP download tool availability", () => {
  const context: ServerContext = {
    projectId: "project-1",
    orgId: "org-1",
    apiKeyId: "key-1",
    publicKey: "pk-lf-test",
    accessLevel: "project",
    plan: "oss",
    rateLimitOverrides: [],
  };

  beforeEach(() => {
    vi.spyOn(observationsFeature, "isEnabled").mockResolvedValue(true);
    vi.spyOn(externalMediaStorageFeature, "isEnabled").mockResolvedValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each<ServerContext["inAppAgent"]>([
    undefined,
    { permissions: "read" },
    {
      permissions: "tool-allowlist",
      allowedToolNames: ["downloadFullTrace", "exportObservation"],
    },
  ])("serves downloads only to external clients: %j", async (inAppAgent) => {
    const clientContext = { ...context, inAppAgent };
    const names = (await toolRegistry.getToolDefinitions(clientContext)).map(
      (tool) => tool.name,
    );

    expect(names).toContain("getObservation");
    expect(names).toContain("createTextPrompt");
    for (const name of ["downloadFullTrace", "exportObservation"]) {
      const tool = await toolRegistry.getEnabledTool(name, clientContext);
      if (inAppAgent) {
        expect(names).not.toContain(name);
        expect(tool).toBeUndefined();
      } else {
        expect(names).toContain(name);
        expect(tool?.definition.name).toBe(name);
      }
    }
  });
});
