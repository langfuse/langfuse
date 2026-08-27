import { type NextApiRequest } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@langfuse/shared";

const { env, mockEnforceProjectAuth } = vi.hoisted(() => ({
  env: {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined as string | undefined,
    ADMIN_API_KEY: undefined as string | undefined,
  },
  mockEnforceProjectAuth: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({ env }));

vi.mock("@langfuse/shared/src/db", () => ({ prisma: {} }));

vi.mock("@/src/features/auth/policy/enforcement.projects", () => ({
  enforceProjectAuth: mockEnforceProjectAuth,
}));

import { verifyAuth } from "@/src/features/auth/policy/projects";

describe("project route factory seam verifyAuth", () => {
  const scope = { projectId: "p1", accessLevel: "project" };
  const req = { headers: {}, method: "GET" } as unknown as NextApiRequest;

  const call = () =>
    verifyAuth({ req, name: "Get Traces", action: "traces:read" });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the resolved scope when the pipeline allows", async () => {
    mockEnforceProjectAuth.mockResolvedValue({ success: true, scope });
    expect(await call()).toEqual({ validKey: true, scope });
  });

  it("throws the pipeline's forbidden as a status and message", async () => {
    mockEnforceProjectAuth.mockResolvedValue({
      success: false,
      error: new ForbiddenError("nope"),
    });
    await expect(call()).rejects.toEqual({ status: 403, message: "nope" });
  });

  it("throws the pipeline's 401 as a status and message", async () => {
    mockEnforceProjectAuth.mockResolvedValue({
      success: false,
      error: new UnauthorizedError("bad key"),
    });
    await expect(call()).rejects.toEqual({ status: 401, message: "bad key" });
  });

  it("does not run the admin sidecar without admin headers", async () => {
    mockEnforceProjectAuth.mockResolvedValue({ success: true, scope });
    await verifyAuth({
      req,
      name: "Get Traces",
      action: "traces:read",
      isAdminApiKeyAuthAllowed: true,
    });
    expect(mockEnforceProjectAuth).toHaveBeenCalledWith(
      expect.objectContaining({ isAdminApiKeyAuthAllowed: false }),
    );
  });
});
