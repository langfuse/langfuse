import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@langfuse/shared";
import {
  OrganizationId,
  ProjectId,
  SystemRoleId,
  type ProjectAction,
} from "@langfuse/shared/rbac";

const { env } = vi.hoisted(() => ({
  env: { API_AUTH_MIGRATION: "enforce" as string },
}));

vi.mock("@/src/env.mjs", () => ({ env }));

const { shadowAuthDiff } = vi.hoisted(() => ({ shadowAuthDiff: vi.fn() }));

vi.mock("@/src/features/public-api/server/shadowAuthDiff", () => ({
  shadowAuthDiff,
}));

import { __test } from "@/src/features/mcp/server/mcpServer";
import type { McpTool } from "@/src/features/mcp/core/define-tool";
import { formatErrorForUser } from "@/src/features/mcp/core/error-formatting";
import {
  __dangerouslySkipAuthz,
  type ApiAction,
} from "@/src/features/public-api/server/enforceAuth";

import type { ServerContext } from "@/src/features/mcp/types";
import { type Policy } from "@/src/features/rbac/types";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";
import { ProtocolErrorCode } from "@modelcontextprotocol/server";

const { assertToolAuthorized } = __test;

const PRJ = "prj_1";

const allowPrompts: Policy = {
  id: "system/LEGACY_PROJECT_API_KEY:project",
  tenantId: OrganizationId("org_1"),
  roleId: SystemRoleId("LEGACY_PROJECT_API_KEY"),
  actions: ["prompts:read"] as ProjectAction[] as never,
  resources: [ProjectId(PRJ)],
  effect: "ALLOW",
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
  policies: [policies],
});

const serverContext = (auth?: AuthorizationContext): ServerContext => ({
  projectId: PRJ,
  orgId: "org_1",
  apiKeyId: "key_1",
  accessLevel: "project",
  publicKey: "pk-lf-1",
  plan: "cloud:hobby",
  rateLimitOverrides: [],
  accessAuditLogEnabled: false,
  auth,
});

const tool = (action: ApiAction): Pick<McpTool, "action"> => ({ action });

/** The denial as the tool call reports it. */
const denial = (check: () => void) => {
  try {
    check();
  } catch (error) {
    return formatErrorForUser(error);
  }
  throw new Error("expected a denial");
};

describe("assertToolAuthorized", () => {
  beforeEach(() => {
    env.API_AUTH_MIGRATION = "enforce";
    shadowAuthDiff.mockReset();
  });

  it("denies with an InvalidRequest message when the context lacks the tool's action", () => {
    expect(
      denial(() =>
        assertToolAuthorized(
          tool("prompts:CUD"),
          serverContext(authContext([allowPrompts])),
        ),
      ),
    ).toMatchObject({
      code: ProtocolErrorCode.InvalidRequest,
      message: expect.stringContaining(
        'Access denied. The "prompts:CUD" permission is required to access this resource.',
      ),
    });
  });

  it("passes when the resolved context holds the tool's action", () => {
    expect(() =>
      assertToolAuthorized(
        tool("prompts:read"),
        serverContext(authContext([allowPrompts])),
      ),
    ).not.toThrow();
  });

  it("keeps the generic permission message for an invalid wildcard target", () => {
    expect(
      denial(() =>
        assertToolAuthorized(tool("prompts:read"), {
          ...serverContext(authContext([allowPrompts])),
          projectId: "*",
        }),
      ),
    ).toMatchObject({
      code: ProtocolErrorCode.InvalidRequest,
      message: expect.stringContaining(
        "Access denied. You do not have permission to access this resource.",
      ),
    });
  });

  it("passes an ungated tool regardless of context", () => {
    expect(() =>
      assertToolAuthorized(
        tool(__dangerouslySkipAuthz),
        serverContext(authContext([])),
      ),
    ).not.toThrow();
  });

  it("passes when no context resolved in legacy", () => {
    env.API_AUTH_MIGRATION = "legacy";
    expect(() =>
      assertToolAuthorized(tool("prompts:CUD"), serverContext(undefined)),
    ).not.toThrow();
  });

  it("rejects a gated tool without context in enforce", () => {
    expect(
      denial(() => assertToolAuthorized(tool("prompts:CUD"), serverContext())),
    ).toMatchObject({
      code: ProtocolErrorCode.InvalidRequest,
      message: expect.stringContaining(
        "Authentication failed. Please check your API key.",
      ),
    });
  });

  describe("shadow mode", () => {
    beforeEach(() => {
      env.API_AUTH_MIGRATION = "shadow";
    });

    it("diffs a denied action without throwing", () => {
      expect(() =>
        assertToolAuthorized(
          tool("prompts:CUD"),
          serverContext(authContext([allowPrompts])),
        ),
      ).not.toThrow();
      expect(shadowAuthDiff).toHaveBeenCalledWith(
        { success: false, error: expect.any(ForbiddenError) },
        { success: true, scope: { accessLevel: "project" } },
        "prompts:CUD",
        {
          apiKeyId: "key_1",
          publicKey: "pk-lf-1",
          resource: "unknown",
        },
      );
    });

    it("diffs an allowed action", () => {
      assertToolAuthorized(
        tool("prompts:read"),
        serverContext(authContext([allowPrompts])),
      );
      expect(shadowAuthDiff).toHaveBeenCalledWith(
        { success: true },
        { success: true, scope: { accessLevel: "project" } },
        "prompts:read",
        {
          apiKeyId: "key_1",
          publicKey: "pk-lf-1",
          resource: "unknown",
        },
      );
    });
  });
});
