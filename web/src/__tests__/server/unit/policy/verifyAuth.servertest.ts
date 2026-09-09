import { type NextApiRequest } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@langfuse/shared";

const {
  env,
  mockLegacyVerifyAuth,
  mockEnforceAuth,
  mockDiffResults,
  mockRecordCoverage,
} = vi.hoisted(() => ({
  env: { API_AUTH_MIGRATION: "legacy" as string },
  mockLegacyVerifyAuth: vi.fn(),
  mockEnforceAuth: vi.fn(),
  mockDiffResults: vi.fn(),
  mockRecordCoverage: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({ env }));

vi.mock("@/src/features/public-api/server/verifyProjectApiKeyAuth", () => ({
  verifyAuth: mockLegacyVerifyAuth,
}));

vi.mock("@/src/features/public-api/server/enforceAuth", () => ({
  enforceAuth: mockEnforceAuth,
}));

vi.mock("@/src/features/auth/policy/shadow", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  diffResults: mockDiffResults,
  recordCoverage: mockRecordCoverage,
}));

import { verifyProjectAuth } from "@/src/features/public-api/server/verifyProjectAuth";

describe("project seam verifyProjectAuth", () => {
  const legacyScope = { scope: { projectId: "p1", accessLevel: "project" } };
  const req = { headers: {}, method: "GET" } as unknown as NextApiRequest;

  const call = () => verifyProjectAuth({ req, action: "traces:read" });

  const legacyAllows = () =>
    mockLegacyVerifyAuth.mockResolvedValue(legacyScope);
  const legacyDenies = (status: number) =>
    mockLegacyVerifyAuth.mockRejectedValue({ status, message: "legacy" });
  const authzAllows = () =>
    mockEnforceAuth.mockResolvedValue({ success: true });
  const authzDenies = () =>
    mockEnforceAuth.mockResolvedValue({
      success: false,
      error: new ForbiddenError("nope"),
    });

  const projectScope = (presentation: "privateKey" | "publicKey") => ({
    projectId: "p1",
    accessLevel: presentation === "publicKey" ? "scores" : "project",
    orgId: "o1",
    plan: "Team",
    rateLimitOverrides: [],
    apiKeyId: "ak1",
    publicKey: "pk-lf-1",
    isIngestionSuspended: false,
    isInAppAgentKey: false,
  });
  const authzAllowsApiKey = (presentation: "privateKey" | "publicKey") =>
    mockEnforceAuth.mockResolvedValue({
      success: true,
      scope: projectScope(presentation),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    env.API_AUTH_MIGRATION = "legacy";
  });

  describe("legacy mode never runs the new pipeline", () => {
    it("returns the legacy scope and skips enforceAuth", async () => {
      legacyAllows();
      expect(await call()).toEqual({ success: true, scope: legacyScope.scope });
      expect(mockEnforceAuth).not.toHaveBeenCalled();
    });

    it("returns the legacy error unchanged", async () => {
      legacyDenies(403);
      expect(await call()).toMatchObject({
        success: false,
        error: { httpCode: 403, message: "legacy" },
      });
      expect(mockEnforceAuth).not.toHaveBeenCalled();
    });
  });

  describe("an unrecognized mode fails safe to legacy", () => {
    beforeEach(() => {
      env.API_AUTH_MIGRATION = "";
    });

    it("runs only legacy and skips the new pipeline and parity telemetry", async () => {
      legacyAllows();
      authzDenies();
      expect(await call()).toEqual({ success: true, scope: legacyScope.scope });
      expect(mockEnforceAuth).not.toHaveBeenCalled();
      expect(mockDiffResults).not.toHaveBeenCalled();
      expect(mockRecordCoverage).not.toHaveBeenCalled();
    });
  });

  describe("shadow mode keeps responses byte-identical to legacy", () => {
    beforeEach(() => {
      env.API_AUTH_MIGRATION = "shadow";
    });

    it("returns the legacy scope even when the new pipeline denies", async () => {
      legacyAllows();
      authzDenies();
      expect(await call()).toEqual({ success: true, scope: legacyScope.scope });
    });

    it("returns the legacy denial even when the new pipeline allows", async () => {
      legacyDenies(401);
      authzAllows();
      expect(await call()).toMatchObject({
        success: false,
        error: { httpCode: 401, message: "legacy" },
      });
    });

    it("records the parity cell and coverage counter", async () => {
      legacyAllows();
      authzDenies();
      await call();
      expect(mockRecordCoverage).toHaveBeenCalledWith("");
      expect(mockDiffResults).toHaveBeenCalledWith(
        { success: false, error: expect.any(ForbiddenError) },
        { ok: true },
        { seam: "project_route", action: "traces:read" },
      );
    });
  });

  describe("enforce mode is the new pipeline's sole authority", () => {
    beforeEach(() => {
      env.API_AUTH_MIGRATION = "enforce";
    });

    it("returns the new pipeline's project scope", async () => {
      authzAllowsApiKey("privateKey");
      expect(await call()).toEqual({
        success: true,
        scope: {
          projectId: "p1",
          accessLevel: "project",
          orgId: "o1",
          plan: "Team",
          rateLimitOverrides: [],
          apiKeyId: "ak1",
          publicKey: "pk-lf-1",
          isIngestionSuspended: false,
          isInAppAgentKey: false,
        },
      });
    });

    it("returns a scores-level scope for a public key", async () => {
      authzAllowsApiKey("publicKey");
      const result = await call();
      expect(result.success && result.scope.accessLevel).toBe("scores");
    });

    it("never runs legacy verify", async () => {
      authzAllowsApiKey("privateKey");
      await call();
      expect(mockLegacyVerifyAuth).not.toHaveBeenCalled();
    });

    it("returns the new pipeline's 403 when it denies", async () => {
      authzDenies();
      expect(await call()).toMatchObject({
        success: false,
        error: { httpCode: 403, message: "nope" },
      });
    });

    it("does not record parity telemetry", async () => {
      authzAllowsApiKey("privateKey");
      await call();
      expect(mockDiffResults).not.toHaveBeenCalled();
      expect(mockRecordCoverage).not.toHaveBeenCalled();
    });
  });
});
