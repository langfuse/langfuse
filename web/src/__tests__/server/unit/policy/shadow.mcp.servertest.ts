import { beforeEach, describe, expect, it, vi } from "vitest";

import { type NextApiRequest } from "next";

import { ForbiddenError } from "@langfuse/shared";

import { type AuthorizationContext } from "@/src/features/auth/policy/types";

const { env, mockShadowAuth, mockAuthorize } = vi.hoisted(() => ({
  env: { API_AUTH_MIGRATION: "legacy" as string },
  mockShadowAuth: vi.fn(),
  mockAuthorize: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({ env }));

vi.mock("@/src/features/public-api/server/shadowAuth", () => ({
  shadowAuth: mockShadowAuth,
}));

vi.mock("@/src/features/auth/policy/authorize", () => ({
  authorize: mockAuthorize,
}));

import {
  assertMcpToolAccess,
  resolveMcpAuthz,
} from "@/src/features/auth/policy/shadow.mcp";

const context = {
  principal: { kind: "admin", userId: null },
  policies: [],
} as AuthorizationContext;
const req = { headers: {}, query: {} } as unknown as NextApiRequest;

describe("resolveMcpAuthz connection seam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.API_AUTH_MIGRATION = "legacy";
  });

  it("skips shadowAuth entirely in legacy mode", async () => {
    expect(await resolveMcpAuthz({ req })).toEqual({});
    expect(mockShadowAuth).not.toHaveBeenCalled();
  });

  describe("shadow mode", () => {
    beforeEach(() => {
      env.API_AUTH_MIGRATION = "shadow";
    });

    it("leaves authz absent since shadowAuth returns the legacy scope without a context", async () => {
      mockShadowAuth.mockResolvedValue({ success: true, scope: {} });
      expect(await resolveMcpAuthz({ req })).toEqual({ authz: undefined });
    });

    it("never blocks when shadowAuth reports the legacy denial", async () => {
      mockShadowAuth.mockResolvedValue({
        success: false,
        error: new ForbiddenError("nope"),
      });
      expect(await resolveMcpAuthz({ req })).toEqual({});
    });
  });

  describe("enforce mode", () => {
    beforeEach(() => {
      env.API_AUTH_MIGRATION = "enforce";
    });

    it("attaches the resolved context when enforce allows", async () => {
      mockShadowAuth.mockResolvedValue({
        success: true,
        scope: {},
        ctx: context,
      });
      expect(await resolveMcpAuthz({ req })).toEqual({ authz: context });
    });

    it("throws the denial to block the connection", async () => {
      mockShadowAuth.mockResolvedValue({
        success: false,
        error: new ForbiddenError("nope"),
      });
      await expect(resolveMcpAuthz({ req })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });
});

describe("assertMcpToolAccess per-tool seam", () => {
  const call = (authz?: AuthorizationContext) =>
    assertMcpToolAccess({ authz, projectId: "prj_1", action: "prompts:read" });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is a no-op when no context is attached", () => {
    expect(call(undefined)).toBeUndefined();
    expect(mockAuthorize).not.toHaveBeenCalled();
  });

  it("runs a permitted tool", () => {
    mockAuthorize.mockReturnValue({ success: true });
    expect(call(context)).toBeUndefined();
    expect(mockAuthorize).toHaveBeenCalledWith(context, "prompts:read", {
      projectId: "prj_1",
    });
  });

  it("blocks a tool whose action the credential lacks", () => {
    mockAuthorize.mockReturnValue({
      success: false,
      error: new ForbiddenError("nope"),
    });
    expect(() => call(context)).toThrow(ForbiddenError);
  });
});
