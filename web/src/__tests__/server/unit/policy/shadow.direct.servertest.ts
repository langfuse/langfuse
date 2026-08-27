import { type NextApiRequest } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, InvalidRequestError } from "@langfuse/shared";

const {
  env,
  mockVerifyScope,
  mockEnforceOrgAuth,
  mockEnforceProjectAuth,
  mockDiffResults,
  mockRecordCoverage,
} = vi.hoisted(() => ({
  env: { PUBLIC_API_AUTHZ_MIGRATION: "legacy" as string },
  mockVerifyScope: vi.fn(),
  mockEnforceOrgAuth: vi.fn(),
  mockEnforceProjectAuth: vi.fn(),
  mockDiffResults: vi.fn(),
  mockRecordCoverage: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({ env }));

vi.mock("@/src/features/public-api/server/apiAuth", () => ({
  ApiAuthService: class {
    verifyAuthHeaderAndReturnScope = mockVerifyScope;
  },
}));

vi.mock("@/src/features/auth/policy/enforcement.org", () => ({
  enforceOrgAuth: mockEnforceOrgAuth,
}));

vi.mock("@/src/features/auth/policy/enforcement.projects", () => ({
  enforceProjectAuth: mockEnforceProjectAuth,
}));

vi.mock("@/src/features/auth/policy/shadow", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  diffResults: mockDiffResults,
  recordCoverage: mockRecordCoverage,
}));

import {
  verifyOrgAuth,
  verifyProjectAuthDirect,
} from "@/src/features/auth/policy/shadow.direct";

describe("org direct seam verifyOrgAuth", () => {
  const orgScope = { accessLevel: "organization", orgId: "org_1" };
  const projectScope = { accessLevel: "project", projectId: "prj_1" };
  const orgDenied = "org key required";
  const req = { headers: {}, method: "GET" } as unknown as NextApiRequest;

  const call = () =>
    verifyOrgAuth({
      req,
      name: "Get Organization Projects",
      action: "projects:read",
      scopeDeniedMessage: orgDenied,
    });

  const legacyOrgKey = () =>
    mockVerifyScope.mockResolvedValue({ validKey: true, scope: orgScope });
  const legacyProjectKey = () =>
    mockVerifyScope.mockResolvedValue({ validKey: true, scope: projectScope });
  const legacyInvalid = () =>
    mockVerifyScope.mockResolvedValue({ validKey: false, error: "bad key" });
  const authzAllows = () =>
    mockEnforceOrgAuth.mockResolvedValue({ success: true });
  const authzDenies = () =>
    mockEnforceOrgAuth.mockResolvedValue({
      success: false,
      error: new ForbiddenError("nope"),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    env.PUBLIC_API_AUTHZ_MIGRATION = "legacy";
  });

  describe("legacy mode never runs the new pipeline", () => {
    it("returns the legacy scope and skips enforceOrgAuth", async () => {
      legacyOrgKey();
      expect(await call()).toEqual({ validKey: true, scope: orgScope });
      expect(mockEnforceOrgAuth).not.toHaveBeenCalled();
    });

    it("returns the legacy 401 with the auth message", async () => {
      legacyInvalid();
      expect(await call()).toEqual({
        validKey: false,
        status: 401,
        error: "bad key",
      });
    });

    it("returns the route's own 403 for a non-org key", async () => {
      legacyProjectKey();
      expect(await call()).toEqual({
        validKey: false,
        status: 403,
        error: orgDenied,
      });
    });
  });

  describe("shadow mode keeps responses byte-identical to legacy", () => {
    beforeEach(() => {
      env.PUBLIC_API_AUTHZ_MIGRATION = "shadow";
    });

    it("returns the legacy scope even when the new pipeline denies", async () => {
      legacyOrgKey();
      authzDenies();
      expect(await call()).toEqual({ validKey: true, scope: orgScope });
    });

    it("records the parity cell and coverage counter", async () => {
      legacyOrgKey();
      authzDenies();
      await call();
      expect(mockRecordCoverage).toHaveBeenCalledWith(
        "Get Organization Projects",
      );
      expect(mockDiffResults).toHaveBeenCalledWith(
        { success: false, error: expect.any(ForbiddenError) },
        { ok: true },
        { seam: "org_route", action: "projects:read" },
      );
    });
  });

  describe("enforce mode gates on the new decision", () => {
    beforeEach(() => {
      env.PUBLIC_API_AUTHZ_MIGRATION = "enforce";
    });

    it("returns the legacy scope when the new pipeline allows", async () => {
      legacyOrgKey();
      authzAllows();
      expect(await call()).toEqual({ validKey: true, scope: orgScope });
    });

    it("returns the route's own 403 when the new pipeline denies", async () => {
      legacyOrgKey();
      authzDenies();
      expect(await call()).toEqual({
        validKey: false,
        status: 403,
        error: orgDenied,
      });
    });

    it("surfaces a non-403 new denial with its own message", async () => {
      legacyOrgKey();
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

    it("does not record parity telemetry", async () => {
      legacyOrgKey();
      authzAllows();
      await call();
      expect(mockDiffResults).not.toHaveBeenCalled();
      expect(mockRecordCoverage).not.toHaveBeenCalled();
    });
  });
});

describe("project direct seam verifyProjectAuthDirect", () => {
  const projectScope = { accessLevel: "project", projectId: "prj_1" };
  const orgScope = { accessLevel: "organization", orgId: "org_1" };
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
    env.PUBLIC_API_AUTHZ_MIGRATION = "legacy";
  });

  it("returns the legacy project scope in legacy mode", async () => {
    mockVerifyScope.mockResolvedValue({ validKey: true, scope: projectScope });
    expect(await call()).toEqual({ validKey: true, scope: projectScope });
    expect(mockEnforceProjectAuth).not.toHaveBeenCalled();
  });

  it("rejects a non-project key on the project endpoint in enforce mode", async () => {
    env.PUBLIC_API_AUTHZ_MIGRATION = "enforce";
    mockVerifyScope.mockResolvedValue({ validKey: true, scope: orgScope });
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
