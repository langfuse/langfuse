import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@langfuse/shared";

import { type AuthorizationContext } from "@/src/features/auth/policy/types";

const {
  env,
  mockEnforceMcpAccess,
  mockAuthorizeMcpTool,
  mockDiffResults,
  mockRecordCoverage,
} = vi.hoisted(() => ({
  env: { PUBLIC_API_AUTHZ_MIGRATION: "legacy" as string },
  mockEnforceMcpAccess: vi.fn(),
  mockAuthorizeMcpTool: vi.fn(),
  mockDiffResults: vi.fn(),
  mockRecordCoverage: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({ env }));

vi.mock("@/src/features/auth/policy/enforcement.mcp", () => ({
  enforceMcpAccess: mockEnforceMcpAccess,
  authorizeMcpTool: mockAuthorizeMcpTool,
  mcpAccessAction: "mcp:access",
}));

vi.mock("@/src/features/auth/policy/shadow", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  diffResults: mockDiffResults,
  recordCoverage: mockRecordCoverage,
}));

import {
  assertMcpToolAccess,
  resolveMcpAuthz,
} from "@/src/features/auth/policy/shadow.mcp";

const context = {
  principal: { kind: "admin", userId: null },
  policies: [],
} as AuthorizationContext;
const headers = {};

const accessAllows = () =>
  mockEnforceMcpAccess.mockResolvedValue({
    success: true,
    context,
    projectId: "prj_1",
  });
const accessDenies = () =>
  mockEnforceMcpAccess.mockResolvedValue({
    success: false,
    error: new ForbiddenError("nope"),
  });

describe("resolveMcpAuthz connection seam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.PUBLIC_API_AUTHZ_MIGRATION = "legacy";
  });

  it("skips the new pipeline entirely in legacy mode", async () => {
    expect(await resolveMcpAuthz({ headers })).toEqual({});
    expect(mockEnforceMcpAccess).not.toHaveBeenCalled();
  });

  describe("shadow mode", () => {
    beforeEach(() => {
      env.PUBLIC_API_AUTHZ_MIGRATION = "shadow";
    });

    it("attaches authz and records parity when the new path resolves", async () => {
      accessAllows();
      expect(await resolveMcpAuthz({ headers })).toEqual({ authz: context });
      expect(mockRecordCoverage).toHaveBeenCalledWith("mcp");
      expect(mockDiffResults).toHaveBeenCalledWith(
        { success: true, context, projectId: "prj_1" },
        { ok: true },
        { seam: "mcp_access", action: "mcp:access" },
      );
    });

    it("leaves authz absent when the new path denies, never blocking", async () => {
      accessDenies();
      expect(await resolveMcpAuthz({ headers })).toEqual({ authz: undefined });
      expect(mockDiffResults).toHaveBeenCalled();
    });
  });

  describe("enforce mode", () => {
    beforeEach(() => {
      env.PUBLIC_API_AUTHZ_MIGRATION = "enforce";
    });

    it("attaches authz when the new path allows", async () => {
      accessAllows();
      expect(await resolveMcpAuthz({ headers })).toEqual({ authz: context });
    });

    it("throws the new denial to block the connection", async () => {
      accessDenies();
      await expect(resolveMcpAuthz({ headers })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });

    it("records no parity telemetry", async () => {
      accessAllows();
      await resolveMcpAuthz({ headers });
      expect(mockDiffResults).not.toHaveBeenCalled();
      expect(mockRecordCoverage).not.toHaveBeenCalled();
    });
  });
});

describe("assertMcpToolAccess per-tool seam", () => {
  const call = () =>
    assertMcpToolAccess({
      authz: context,
      projectId: "prj_1",
      action: "prompts:read",
      toolName: "getPrompt",
    });

  beforeEach(() => {
    vi.clearAllMocks();
    env.PUBLIC_API_AUTHZ_MIGRATION = "legacy";
  });

  it("is a no-op in legacy mode", () => {
    expect(call()).toBeUndefined();
    expect(mockAuthorizeMcpTool).not.toHaveBeenCalled();
  });

  describe("shadow mode records net_new parity and never blocks", () => {
    beforeEach(() => {
      env.PUBLIC_API_AUTHZ_MIGRATION = "shadow";
    });

    it("records coverage and parity against an absent legacy verdict", () => {
      mockAuthorizeMcpTool.mockReturnValue({
        success: false,
        error: new ForbiddenError("nope"),
      });
      expect(call()).toBeUndefined();
      expect(mockRecordCoverage).toHaveBeenCalledWith("getPrompt");
      expect(mockDiffResults).toHaveBeenCalledWith(
        { success: false, error: expect.any(ForbiddenError) },
        { absent: true },
        { seam: "mcp_tool", action: "prompts:read" },
      );
    });

    it("does not evaluate when authz is absent", () => {
      assertMcpToolAccess({
        authz: undefined,
        projectId: "prj_1",
        action: "prompts:read",
        toolName: "getPrompt",
      });
      expect(mockAuthorizeMcpTool).not.toHaveBeenCalled();
    });
  });

  describe("enforce mode blocks fail-closed", () => {
    beforeEach(() => {
      env.PUBLIC_API_AUTHZ_MIGRATION = "enforce";
    });

    it("runs a permitted tool", () => {
      mockAuthorizeMcpTool.mockReturnValue({ success: true });
      expect(call()).toBeUndefined();
    });

    it("blocks a tool whose action the credential lacks", () => {
      mockAuthorizeMcpTool.mockReturnValue({
        success: false,
        error: new ForbiddenError("nope"),
      });
      expect(() => call()).toThrow(ForbiddenError);
    });

    it("blocks fail-closed when authz is absent", () => {
      expect(() =>
        assertMcpToolAccess({
          authz: undefined,
          projectId: "prj_1",
          action: "prompts:read",
          toolName: "getPrompt",
        }),
      ).toThrow(ForbiddenError);
    });
  });
});
