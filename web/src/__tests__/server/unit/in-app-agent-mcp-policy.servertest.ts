import { describe, expect, expectTypeOf, it } from "vitest";
import { ZodError } from "zod";

import {
  createInAppAgentToolPolicy,
  getInAppAgentMcpAllowedToolNames,
  IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES,
  type InAppAgentLangfuseMcpToolName,
} from "@langfuse/shared/in-app-agent/server/mcpPolicy";
import {
  getEnabledTool,
  getEnabledTools,
  MCP_TOOLS,
  type McpToolName,
} from "@/src/features/mcp/server/tools";
import { skillsFeature } from "@/src/features/mcp/server/skills";
import { ForbiddenError, UnauthorizedError } from "@langfuse/shared";
import {
  OrganizationId,
  ProjectId,
  SystemRoleId,
  systemRoleAccessRights,
} from "@langfuse/shared/rbac";
import { mockServerContext } from "../mcp-helpers";

describe("IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES", () => {
  it("exposes read-only Skills MCP tools to the assistant with skills read access", () => {
    const policy = createInAppAgentToolPolicy({
      userAccess: { projectRole: "VIEWER" },
    });
    for (const { definition } of skillsFeature.tools.filter(
      ({ definition }) => definition.annotations?.readOnlyHint === true,
    )) {
      expect(
        MCP_TOOLS.find((tool) => tool.definition.name === definition.name)
          ?.definition,
      ).toEqual(definition);
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
        userAccess: { projectRole: "MEMBER" },
      });
      expect([...memberPolicy.available]).toContain(toolName);
      expect([...memberPolicy.autoApproved]).not.toContain(toolName);
      expect(getInAppAgentMcpAllowedToolNames(memberPolicy)).not.toContain(
        toolName,
      );

      const grantedMemberPolicy = createInAppAgentToolPolicy({
        userAccess: { projectRole: "MEMBER" },
        alwaysAllowedTools: [`langfuse_${toolName}`],
      });
      expect(getInAppAgentMcpAllowedToolNames(grantedMemberPolicy)).toContain(
        toolName,
      );

      const viewerPolicy = createInAppAgentToolPolicy({
        userAccess: { projectRole: "VIEWER" },
        alwaysAllowedTools: [`langfuse_${toolName}`],
      });
      expect([...viewerPolicy.available]).not.toContain(toolName);
      expect([...viewerPolicy.autoApproved]).not.toContain(toolName);
      expect(getInAppAgentMcpAllowedToolNames(viewerPolicy)).not.toContain(
        toolName,
      );
      const definition = MCP_TOOLS.find(
        (tool) => tool.definition.name === toolName,
      )?.definition;
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

  it("keeps notebook reads automatic and notebook mutations behind Halo approval", () => {
    const member = createInAppAgentToolPolicy({
      userAccess: { projectRole: "MEMBER" },
    });
    const viewer = createInAppAgentToolPolicy({
      userAccess: { projectRole: "VIEWER" },
      alwaysAllowedTools: ["langfuse_publish_notebook"],
    });

    for (const name of [
      "list_notebooks",
      "get_notebook",
      "read_document",
      "validate_notebook",
    ] as const) {
      expect(viewer.autoApproved.has(name)).toBe(true);
      expect(
        MCP_TOOLS.find(({ definition }) => definition.name === name)?.definition
          .annotations?.readOnlyHint,
      ).toBe(true);
    }

    for (const name of [
      "create_notebook",
      "write_document",
      "patch_document",
      "update_notebook_layout",
      "publish_notebook",
    ] as const) {
      expect(viewer.available.has(name)).toBe(false);
      expect(member.autoApproved.has(name)).toBe(false);
      expect(getInAppAgentMcpAllowedToolNames(member, name)).toContain(name);
      expect(
        MCP_TOOLS.find(({ definition }) => definition.name === name)?.definition
          .annotations?.readOnlyHint,
      ).not.toBe(true);
    }
  });

  it("only exposes notebook tools to authenticated Halo requests and still requires mutation approval", async () => {
    const context = mockServerContext();
    const tool = MCP_TOOLS.find(
      ({ definition }) => definition.name === "create_notebook",
    );
    if (!tool) throw new Error("Missing create_notebook");

    const create = { title: "Example" };
    await expect(tool.handler(create, context)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );

    const authFor = (
      isInAppAgentKey: boolean,
    ): NonNullable<typeof context.auth> => ({
      principal: {
        kind: "apiKey",
        apiKeyId: context.apiKeyId,
        publicKey: context.publicKey,
        presentation: "privateKey",
        scope: "PROJECT",
        userId: isInAppAgentKey ? "creator-user" : null,
        organizations: [],
        boundResource: { orgId: context.orgId, projectId: context.projectId },
        isInAppAgentKey,
      },
      policies: [
        systemRoleAccessRights.LEGACY_PROJECT_API_KEY.policies
          .filter(({ resourceKind }) => resourceKind === "project")
          .map(({ actions, effect }) => ({
            id: "notebook-policy",
            tenantId: OrganizationId(context.orgId),
            roleId: SystemRoleId("LEGACY_PROJECT_API_KEY"),
            resources: [ProjectId(context.projectId)],
            actions,
            effect,
          })),
      ],
    });

    const external = { ...context, auth: authFor(false) };
    const halo = mockServerContext({
      auth: authFor(true),
      inAppAgent: {
        permissions: "tool-allowlist",
        allowedToolNames: ["publish_notebook"],
      },
    });
    const externalTools = (await getEnabledTools(external)).map(
      ({ definition }) => definition.name,
    );
    const haloTools = (await getEnabledTools(halo)).map(
      ({ definition }) => definition.name,
    );
    for (const name of [
      "list_notebooks",
      "get_notebook",
      "read_document",
      "validate_notebook",
      "create_notebook",
      "write_document",
      "patch_document",
      "publish_notebook",
      "update_notebook_layout",
    ]) {
      expect(externalTools).not.toContain(name);
      expect(haloTools).toContain(name);
      await expect(getEnabledTool(name, external)).resolves.toBeUndefined();
    }
    await expect(getEnabledTool("list_notebooks", halo)).resolves.toBeDefined();
    await expect(
      getEnabledTool("publish_notebook", halo),
    ).resolves.toBeDefined();
    await expect(tool.handler(create, external)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(tool.handler(create, halo)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it.each([
    { name: "create_notebook", input: { title: "a".repeat(251) } },
    { name: "create_notebook", input: { title: "a\0b" } },
    { name: "list_notebooks", input: { search: "a".repeat(251) } },
    { name: "list_notebooks", input: { search: "a\0b" } },
    { name: "list_notebooks", input: { cursor: "a".repeat(129) } },
    { name: "get_notebook", input: { notebookId: "invalid/id" } },
    {
      name: "write_document",
      input: { notebookId: "notebook", markdown: "a".repeat(512_001) },
    },
    {
      name: "write_document",
      input: { notebookId: "notebook", jsonl: "a".repeat(512_001) },
    },
    {
      name: "write_document",
      input: {
        notebookId: "notebook",
        documentId: "main",
        label: "New document",
        markdown: "Ambiguous destination",
      },
    },
    {
      name: "write_document",
      input: { notebookId: "notebook", documentId: "main", width: "100%" },
    },
    {
      name: "write_document",
      input: { notebookId: "notebook", label: "New document", width: "full" },
    },
    {
      name: "write_document",
      input: {
        notebookId: "notebook",
        layout: { kind: "default" },
        width: "full",
      },
    },
    {
      name: "write_document",
      input: {
        notebookId: "notebook",
        documentId: "main",
        markdown: "Not a layout update",
        layout: { kind: "default" },
      },
    },
    {
      name: "write_document",
      input: {
        notebookId: "notebook",
        blocks: Array.from({ length: 501 }, () => ({ schema: "text@1" })),
      },
    },
    {
      name: "patch_document",
      input: {
        notebookId: "notebook",
        operations: Array.from({ length: 501 }, () => ({
          op: "remove",
          blockId: "block",
        })),
      },
    },
  ])("rejects out-of-bounds input for $name", async ({ name, input }) => {
    const tool = MCP_TOOLS.find(({ definition }) => definition.name === name);
    if (!tool) throw new Error(`Missing ${name}`);
    await expect(
      tool.handler(input, mockServerContext()),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it.each([
    { notebookId: "notebook", markdown: "# Main document" },
    { notebookId: "notebook", layout: { kind: "default" } },
  ])(
    "accepts write_document input before checking authorization: %o",
    async (input) => {
      const tool = MCP_TOOLS.find(
        ({ definition }) => definition.name === "write_document",
      );
      if (!tool) throw new Error("Missing write_document");
      await expect(tool.handler(input, mockServerContext())).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof UnauthorizedError || error instanceof ForbiddenError,
      );
    },
  );

  it("classifies every Langfuse MCP tool exactly once", () => {
    expectTypeOf<InAppAgentLangfuseMcpToolName>().toEqualTypeOf<McpToolName>();

    const registeredToolNames = MCP_TOOLS.map(
      (tool) => tool.definition.name,
    ).sort();
    const classifiedToolNames = Object.keys(
      IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES,
    ).sort();

    expect(classifiedToolNames).toEqual(registeredToolNames);
  });
});
