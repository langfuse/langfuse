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
  createInAppAgentToolPolicy,
  getInAppAgentMcpAllowedToolNames,
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
  it("exposes read-only Skills MCP tools to the assistant with skills read access", () => {
    const policy = createInAppAgentToolPolicy({
      userAccess: { projectRole: "VIEWER", isAdmin: false },
    });
    for (const { definition } of skillsFeature.tools.filter(
      ({ definition }) => definition.annotations?.readOnlyHint === true,
    )) {
      expect(toolRegistry.getTool(definition.name)?.definition).toEqual(
        definition,
      );
      expect(definition.action).toBe("skills:read");
      expect(definition.annotations?.readOnlyHint).toBe(true);
      expect([...policy.available]).toContain(definition.name);
      expect([...policy.autoApproved]).toContain(definition.name);
    }
  });

  it.each(["createSkillVersion", "updateSkillLabels", "updateSkillTags"])(
    "requires approval for %s and excludes viewers even with a stored grant",
    (toolName) => {
      const memberPolicy = createInAppAgentToolPolicy({
        userAccess: { projectRole: "MEMBER", isAdmin: false },
      });
      expect([...memberPolicy.available]).toContain(toolName);
      expect([...memberPolicy.autoApproved]).not.toContain(toolName);
      expect(getInAppAgentMcpAllowedToolNames(memberPolicy)).not.toContain(
        toolName,
      );

      const grantedMemberPolicy = createInAppAgentToolPolicy({
        userAccess: { projectRole: "MEMBER", isAdmin: false },
        alwaysAllowedTools: [`langfuse_${toolName}`],
      });
      expect(getInAppAgentMcpAllowedToolNames(grantedMemberPolicy)).toContain(
        toolName,
      );

      const viewerPolicy = createInAppAgentToolPolicy({
        userAccess: { projectRole: "VIEWER", isAdmin: false },
        alwaysAllowedTools: [`langfuse_${toolName}`],
      });
      expect([...viewerPolicy.available]).not.toContain(toolName);
      expect([...viewerPolicy.autoApproved]).not.toContain(toolName);
      expect(getInAppAgentMcpAllowedToolNames(viewerPolicy)).not.toContain(
        toolName,
      );
      const definition = toolRegistry.getTool(toolName)?.definition;
      expect(definition?.action).toBe("skills:CUD");
      expect(definition?.annotations?.destructiveHint).toBe(true);
      expect(definition?.annotations?.readOnlyHint).not.toBe(true);
    },
  );

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
