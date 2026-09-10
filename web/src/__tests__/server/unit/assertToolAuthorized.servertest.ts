import { describe, expect, it } from "vitest";

import { ForbiddenError } from "@langfuse/shared";

import { __test } from "@/src/features/mcp/server/mcpServer";
import type { ToolDefinition } from "@/src/features/mcp/core/define-tool";
import type { ServerContext } from "@/src/features/mcp/types";
import {
  type AuthorizationContext,
  type Policy,
  type ProjectAction,
} from "@/src/features/auth/policy/types";

const { assertToolAuthorized } = __test;

const PRJ = "prj_1";

const allowPrompts: Policy = {
  kind: "project",
  source: { kind: "role", id: "PROJECT" },
  actions: ["prompts:read"] as ProjectAction[] as never,
  resources: [PRJ],
  effect: "allow",
};

const authContext = (policies: Policy[]): AuthorizationContext => ({
  principal: {
    kind: "apiKey",
    apiKeyId: "key_1",
    userId: null,
    isInAppAgentKey: false,
    publicKey: "pk-lf-1",
    scope: "PROJECT",
    presentation: "privateKey",
    organizations: [],
    boundResource: { orgId: "org_1", projectId: PRJ },
  },
  policies,
});

const serverContext = (auth?: AuthorizationContext): ServerContext => ({
  projectId: PRJ,
  orgId: "org_1",
  apiKeyId: "key_1",
  accessLevel: "project",
  publicKey: "pk-lf-1",
  plan: "cloud:hobby",
  rateLimitOverrides: [],
  auth,
});

const tool = (action: ProjectAction | null): ToolDefinition => ({
  name: "someTool",
  description: "",
  action,
  inputSchema: { type: "object" },
});

describe("assertToolAuthorized", () => {
  it("throws when the resolved context lacks the tool's action", () => {
    expect(() =>
      assertToolAuthorized(
        tool("prompts:CUD"),
        serverContext(authContext([allowPrompts])),
      ),
    ).toThrow(ForbiddenError);
  });

  it("passes when the resolved context holds the tool's action", () => {
    expect(() =>
      assertToolAuthorized(
        tool("prompts:read"),
        serverContext(authContext([allowPrompts])),
      ),
    ).not.toThrow();
  });

  it("passes an ungated tool regardless of context", () => {
    expect(() =>
      assertToolAuthorized(tool(null), serverContext(authContext([]))),
    ).not.toThrow();
  });

  it("passes when no context resolved (legacy/shadow)", () => {
    expect(() =>
      assertToolAuthorized(tool("prompts:CUD"), serverContext(undefined)),
    ).not.toThrow();
  });
});
