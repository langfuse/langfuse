import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@langfuse/shared";

import { type AuthorizationContext } from "@/src/features/auth/policy/types";

const { mockAuthenticate, mockAuthorize } = vi.hoisted(() => ({
  mockAuthenticate: vi.fn(),
  mockAuthorize: vi.fn(),
}));

vi.mock("@/src/features/auth/policy/identity", () => ({
  authenticate: mockAuthenticate,
}));

vi.mock("@/src/features/auth/policy/authorize", () => ({
  authorize: mockAuthorize,
}));

import {
  __test,
  enforceMcpAccess,
} from "@/src/features/auth/policy/enforcement.mcp";

const projectContext: AuthorizationContext = {
  principal: {
    kind: "apiKey",
    apiKeyId: "key_1",
    userId: null,
    organizations: [],
    boundResource: { projectId: "prj_1" },
  },
  policies: [],
};

const orgContext: AuthorizationContext = {
  principal: {
    kind: "apiKey",
    apiKeyId: "key_2",
    userId: null,
    organizations: [],
    boundResource: { orgId: "org_1" },
  },
  policies: [],
};

describe("boundProjectIdOf", () => {
  it("returns the bound project of a project key", () => {
    expect(__test.boundProjectIdOf(projectContext)).toBe("prj_1");
  });

  it("returns undefined for a non-project-bound principal", () => {
    expect(__test.boundProjectIdOf(orgContext)).toBeUndefined();
  });
});

describe("enforceMcpAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("surfaces an authentication failure", async () => {
    mockAuthenticate.mockResolvedValue({
      success: false,
      error: new UnauthorizedError("bad key"),
    });
    expect(await enforceMcpAccess({ headers: {} })).toMatchObject({
      success: false,
      error: expect.any(UnauthorizedError),
    });
  });

  it("403s a credential with no bound project", async () => {
    mockAuthenticate.mockResolvedValue({ success: true, context: orgContext });
    expect(await enforceMcpAccess({ headers: {} })).toMatchObject({
      success: false,
      error: expect.any(ForbiddenError),
    });
  });

  it("403s when the credential lacks mcp:access", async () => {
    mockAuthenticate.mockResolvedValue({
      success: true,
      context: projectContext,
    });
    mockAuthorize.mockReturnValue({
      success: false,
      error: new ForbiddenError("nope"),
    });
    expect(await enforceMcpAccess({ headers: {} })).toMatchObject({
      success: false,
      error: expect.any(ForbiddenError),
    });
    expect(mockAuthorize).toHaveBeenCalledWith(projectContext, "mcp:access", {
      projectId: "prj_1",
    });
  });

  it("resolves the context and bound project when mcp:access is held", async () => {
    mockAuthenticate.mockResolvedValue({
      success: true,
      context: projectContext,
    });
    mockAuthorize.mockReturnValue({ success: true });
    expect(await enforceMcpAccess({ headers: {} })).toEqual({
      success: true,
      context: projectContext,
      projectId: "prj_1",
    });
  });
});
