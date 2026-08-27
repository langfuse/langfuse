import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@langfuse/shared";

import { type AuthorizationContext } from "@/src/features/auth/policy/types";

const { mockEnforceMcpAccess, mockAuthorizeMcpTool } = vi.hoisted(() => ({
  mockEnforceMcpAccess: vi.fn(),
  mockAuthorizeMcpTool: vi.fn(),
}));

vi.mock("@/src/features/auth/policy/enforcement.mcp", () => ({
  enforceMcpAccess: mockEnforceMcpAccess,
  authorizeMcpTool: mockAuthorizeMcpTool,
  mcpAccessAction: "mcp:access",
}));

import {
  assertMcpToolAccess,
  resolveMcpAuthz,
} from "@/src/features/auth/policy/mcp";

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
  });

  it("resolves the context and bound project when the pipeline allows", async () => {
    accessAllows();
    expect(await resolveMcpAuthz({ headers })).toEqual({
      authz: context,
      projectId: "prj_1",
    });
  });

  it("throws the denial to block the connection", async () => {
    accessDenies();
    await expect(resolveMcpAuthz({ headers })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
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
    expect(mockAuthorizeMcpTool).not.toHaveBeenCalled();
  });
});
