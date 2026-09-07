import { type NextApiRequest } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ForbiddenError,
  InvalidRequestError,
  UnauthorizedError,
} from "@langfuse/shared";

const { mockEnforceOrgAuth, mockEnforceProjectAuth } = vi.hoisted(() => ({
  mockEnforceOrgAuth: vi.fn(),
  mockEnforceProjectAuth: vi.fn(),
}));

vi.mock("@/src/features/auth/policy/enforcement.org", () => ({
  enforceOrgAuth: mockEnforceOrgAuth,
}));

vi.mock("@/src/features/auth/policy/enforcement.projects", () => ({
  enforceProjectAuth: mockEnforceProjectAuth,
}));

import {
  verifyOrgAuth,
  verifyProjectAuthDirect,
} from "@/src/features/auth/policy/shadow.direct";

describe("org direct seam verifyOrgAuth", () => {
  const scope = { orgId: "org_1", accessLevel: "organization" };
  const orgDenied = "org key required";
  const req = { headers: {}, method: "GET" } as unknown as NextApiRequest;

  const call = () =>
    verifyOrgAuth({
      req,
      name: "Get Organization Projects",
      action: "projects:read",
      scopeDeniedMessage: orgDenied,
    });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the resolved scope when the pipeline allows", async () => {
    mockEnforceOrgAuth.mockResolvedValue({ success: true, scope });
    expect(await call()).toEqual({ validKey: true, scope });
  });

  it("renders a 403 as the route's own scope-denied message", async () => {
    mockEnforceOrgAuth.mockResolvedValue({
      success: false,
      error: new ForbiddenError("nope"),
    });
    expect(await call()).toEqual({
      validKey: false,
      status: 403,
      error: orgDenied,
    });
  });

  it("renders a 401 with the pipeline's own message", async () => {
    mockEnforceOrgAuth.mockResolvedValue({
      success: false,
      error: new UnauthorizedError("bad key"),
    });
    expect(await call()).toEqual({
      validKey: false,
      status: 401,
      error: "bad key",
    });
  });

  it("renders a non-403 denial with its own message", async () => {
    mockEnforceOrgAuth.mockResolvedValue({
      success: false,
      error: new InvalidRequestError("no target"),
    });
    expect(await call()).toEqual({
      validKey: false,
      status: 400,
      error: "no target",
    });
  });
});

describe("project direct seam verifyProjectAuthDirect", () => {
  const scope = { projectId: "prj_1", accessLevel: "project" };
  const projectDenied = "project key required";
  const req = { headers: {}, method: "GET" } as unknown as NextApiRequest;

  const call = () =>
    verifyProjectAuthDirect({
      req,
      name: "Get Project",
      action: "project:read",
      scopeDeniedMessage: projectDenied,
    });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the resolved project scope when the pipeline allows", async () => {
    mockEnforceProjectAuth.mockResolvedValue({ success: true, scope });
    expect(await call()).toEqual({ validKey: true, scope });
    expect(mockEnforceProjectAuth).toHaveBeenCalledWith(
      expect.objectContaining({ allowedAccessLevels: ["project"] }),
    );
  });

  it("renders a non-project key denial as the route's own message", async () => {
    mockEnforceProjectAuth.mockResolvedValue({
      success: false,
      error: new ForbiddenError("nope"),
    });
    expect(await call()).toEqual({
      validKey: false,
      status: 403,
      error: projectDenied,
    });
  });
});
