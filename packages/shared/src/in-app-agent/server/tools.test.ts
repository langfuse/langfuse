import { describe, expect, it } from "vitest";

import {
  createInAppAgentToolPolicy,
  getInAppAgentToolApprovalSource,
  IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES,
} from "./mcpPolicy";

describe("createInAppAgentToolPolicy", () => {
  it("lists experiments with promptExperiments:read", () => {
    expect(
      IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES.listExperiments.availability,
    ).toEqual({ scope: "promptExperiments:read" });
    expect(
      IN_APP_AGENT_LANGFUSE_MCP_TOOL_POLICIES.listExperimentItems.availability,
    ).toEqual({ scope: "promptExperiments:read" });
  });

  it("keeps listExperiments available to members", () => {
    const asMember = createInAppAgentToolPolicy({
      userAccess: { projectRole: "MEMBER", isAdmin: false },
    });

    expect(asMember.available.has("listExperiments")).toBe(true);
    expect(asMember.available.has("listExperimentItems")).toBe(true);
  });

  it("drops a stored grant the user's role no longer covers", () => {
    const grants = ["langfuse_createModel"];

    const asOwner = createInAppAgentToolPolicy({
      userAccess: { projectRole: "OWNER", isAdmin: false },
      alwaysAllowedTools: grants,
    });

    expect(asOwner.available.has("createModel")).toBe(true);
    expect(asOwner.autoApproved.has("createModel")).toBe(true);

    const asMember = createInAppAgentToolPolicy({
      userAccess: { projectRole: "MEMBER", isAdmin: false },
      alwaysAllowedTools: grants,
    });

    expect(asMember.available.has("createModel")).toBe(false);
    expect(asMember.autoApproved.has("createModel")).toBe(false);
  });
});

describe("getInAppAgentToolApprovalSource", () => {
  const ownerPolicy = createInAppAgentToolPolicy({
    userAccess: { projectRole: "OWNER", isAdmin: false },
    alwaysAllowedTools: ["langfuse_createTextPrompt"],
  });

  it.each([
    {
      name: "human",
      toolName: "langfuse_createTextPrompt",
      toolCallId: "call-1",
      humanApprovedToolCallId: "call-1",
      source: "human",
    },
    {
      name: "conversation_grant",
      toolName: "langfuse_createTextPrompt",
      toolCallId: "call-2",
      source: "conversation_grant",
    },
    {
      name: "auto for MCP policy",
      toolName: "langfuse_listAnnotationQueues",
      toolCallId: "call-3",
      source: "auto",
    },
    {
      name: "auto for sandbox tools",
      toolName: "read",
      toolCallId: "call-4",
      source: "auto",
    },
  ] as const)(
    "classifies $name",
    ({ toolName, toolCallId, humanApprovedToolCallId, source }) => {
      expect(
        getInAppAgentToolApprovalSource({
          toolName,
          policy: ownerPolicy,
          toolCallId,
          humanApprovedToolCallId,
        }),
      ).toBe(source);
    },
  );
});
