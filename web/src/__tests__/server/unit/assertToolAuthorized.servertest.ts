import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";

import { ForbiddenError } from "@langfuse/shared";

const { env } = vi.hoisted(() => ({
  env: { API_AUTH_MIGRATION: "enforce" as string },
}));

vi.mock("@/src/env.mjs", () => ({ env }));

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
  beforeEach(() => {
    env.API_AUTH_MIGRATION = "enforce";
  });

  it("throws a formatted InvalidRequest error when the context lacks the tool's action", () => {
    expect(() =>
      assertToolAuthorized(
        tool("prompts:CUD"),
        serverContext(authContext([allowPrompts])),
      ),
    ).toThrow(
      expect.objectContaining({ code: ErrorCode.InvalidRequest }) as Error,
    );
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

  it("passes when no context resolved (legacy)", () => {
    expect(() =>
      assertToolAuthorized(tool("prompts:CUD"), serverContext(undefined)),
    ).not.toThrow();
  });

  describe("shadow mode", () => {
    beforeEach(() => {
      env.API_AUTH_MIGRATION = "shadow";
    });

    it("diffs a denied action without throwing", () => {
      const diff = vi.fn();
      expect(() =>
        assertToolAuthorized(
          tool("prompts:CUD"),
          serverContext(authContext([allowPrompts])),
          diff,
        ),
      ).not.toThrow();
      expect(diff).toHaveBeenCalledWith(
        { success: false, error: expect.any(ForbiddenError) },
        { success: true, scope: { accessLevel: "project" } },
        "prompts:CUD",
      );
    });

    it("diffs an allowed action", () => {
      const diff = vi.fn();
      assertToolAuthorized(
        tool("prompts:read"),
        serverContext(authContext([allowPrompts])),
        diff,
      );
      expect(diff).toHaveBeenCalledWith(
        { success: true },
        { success: true, scope: { accessLevel: "project" } },
        "prompts:read",
      );
    });
  });
});
