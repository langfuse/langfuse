import { type NextApiRequest } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@langfuse/shared";

const {
  env,
  mockLegacyVerifyAuth,
  mockEnforceProjectAuth,
  mockDiffResults,
  mockRecordCoverage,
} = vi.hoisted(() => ({
  env: { API_AUTH_MIGRATION: "legacy" as string },
  mockLegacyVerifyAuth: vi.fn(),
  mockEnforceProjectAuth: vi.fn(),
  mockDiffResults: vi.fn(),
  mockRecordCoverage: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({ env }));

vi.mock("@/src/features/public-api/server/verifyProjectApiKeyAuth", () => ({
  verifyAuth: mockLegacyVerifyAuth,
}));

vi.mock("@/src/features/auth/policy/enforceProjectAuth", () => ({
  enforceProjectAuth: mockEnforceProjectAuth,
}));

vi.mock("@/src/features/auth/policy/shadow", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  diffResults: mockDiffResults,
  recordCoverage: mockRecordCoverage,
}));

import { verifyAuth } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";

describe("project seam verifyAuth", () => {
  const legacyScope = { scope: { projectId: "p1", accessLevel: "project" } };
  const req = { headers: {}, method: "GET" } as unknown as NextApiRequest;

  const call = () =>
    verifyAuth({ req, name: "Get Traces", action: "traces:read" });

  const legacyAllows = () =>
    mockLegacyVerifyAuth.mockResolvedValue(legacyScope);
  const legacyDenies = (status: number) =>
    mockLegacyVerifyAuth.mockRejectedValue({ status, message: "legacy" });
  const authzAllows = () =>
    mockEnforceProjectAuth.mockResolvedValue({ success: true });
  const authzDenies = () =>
    mockEnforceProjectAuth.mockResolvedValue({
      success: false,
      error: new ForbiddenError("nope"),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    env.API_AUTH_MIGRATION = "legacy";
  });

  describe("legacy mode never runs the new pipeline", () => {
    it("returns the legacy scope and skips enforceProjectAuth", async () => {
      legacyAllows();
      expect(await call()).toBe(legacyScope);
      expect(mockEnforceProjectAuth).not.toHaveBeenCalled();
    });

    it("rethrows the legacy error unchanged", async () => {
      legacyDenies(403);
      await expect(call()).rejects.toEqual({ status: 403, message: "legacy" });
      expect(mockEnforceProjectAuth).not.toHaveBeenCalled();
    });
  });

  describe("shadow mode keeps responses byte-identical to legacy", () => {
    beforeEach(() => {
      env.API_AUTH_MIGRATION = "shadow";
    });

    it("returns the legacy scope even when the new pipeline denies", async () => {
      legacyAllows();
      authzDenies();
      expect(await call()).toBe(legacyScope);
    });

    it("rethrows the legacy denial even when the new pipeline allows", async () => {
      legacyDenies(401);
      authzAllows();
      await expect(call()).rejects.toEqual({ status: 401, message: "legacy" });
    });

    it("records the parity cell and coverage counter", async () => {
      legacyAllows();
      authzDenies();
      await call();
      expect(mockRecordCoverage).toHaveBeenCalledWith("Get Traces");
      expect(mockDiffResults).toHaveBeenCalledWith(
        { success: false, error: expect.any(ForbiddenError) },
        { ok: true },
        { seam: "project_route", action: "traces:read" },
      );
    });
  });

  describe("enforce mode gates on the new decision", () => {
    beforeEach(() => {
      env.API_AUTH_MIGRATION = "enforce";
    });

    it("returns the legacy scope when the new pipeline allows", async () => {
      legacyAllows();
      authzAllows();
      expect(await call()).toBe(legacyScope);
    });

    it("throws the new pipeline's 403 when it denies", async () => {
      legacyAllows();
      authzDenies();
      await expect(call()).rejects.toEqual({ status: 403, message: "nope" });
    });

    it("does not record parity telemetry", async () => {
      legacyAllows();
      authzAllows();
      await call();
      expect(mockDiffResults).not.toHaveBeenCalled();
      expect(mockRecordCoverage).not.toHaveBeenCalled();
    });
  });
});
