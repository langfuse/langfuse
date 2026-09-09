import { readFileSync } from "fs";
import { fileURLToPath } from "url";

import { type NextApiRequest } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, InvalidRequestError } from "@langfuse/shared";

const {
  env,
  mockVerifyScope,
  mockEnforceOrgAuth,
  mockDiffResults,
  mockRecordCoverage,
} = vi.hoisted(() => ({
  env: { API_AUTH_MIGRATION: "legacy" as string },
  mockVerifyScope: vi.fn(),
  mockEnforceOrgAuth: vi.fn(),
  mockDiffResults: vi.fn(),
  mockRecordCoverage: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({ env }));

vi.mock("@/src/features/public-api/server/apiAuth", () => ({
  ApiAuthService: class {
    verifyAuthHeaderAndReturnScope = mockVerifyScope;
  },
}));

vi.mock("@/src/features/auth/policy/enforceOrgAuth", () => ({
  enforceOrgAuth: mockEnforceOrgAuth,
}));

vi.mock("@/src/features/auth/policy/shadow", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  diffResults: mockDiffResults,
  recordCoverage: mockRecordCoverage,
}));

import { verifyOrgAuth } from "@/src/features/auth/policy/verifyOrgAuth";
import { type Principal } from "@/src/features/auth/policy/types";

const organization = {
  orgId: "org_1",
  plan: "oss" as const,
  rateLimitOverrides: [],
  projectIds: ["prj_1"],
  isIngestionSuspended: false,
};

const apiKeyPrincipal = (scope: "ORGANIZATION" | "PROJECT"): Principal => ({
  kind: "apiKey",
  apiKeyId: "key_1",
  userId: null,
  isInAppAgentKey: false,
  publicKey: "pk-lf-1",
  scope,
  presentation: "privateKey",
  organizations: [organization],
  boundResource:
    scope === "ORGANIZATION"
      ? { orgId: "org_1" }
      : { orgId: "org_1", projectId: "prj_1" },
});

const mappedFields = {
  orgId: "org_1",
  plan: "oss",
  rateLimitOverrides: [],
  apiKeyId: "key_1",
  publicKey: "pk-lf-1",
  isIngestionSuspended: false,
  isInAppAgentKey: false,
};

describe("org direct seam verifyOrgAuth", () => {
  const orgScope = { accessLevel: "organization", orgId: "org_1" };
  const projectScope = { accessLevel: "project", projectId: "prj_1" };
  const req = { headers: {}, method: "GET" } as unknown as NextApiRequest;

  const call = () =>
    verifyOrgAuth({
      req,
      action: "projects:read",
    });

  const legacyOrgKey = () =>
    mockVerifyScope.mockResolvedValue({ validKey: true, scope: orgScope });
  const legacyProjectKey = () =>
    mockVerifyScope.mockResolvedValue({ validKey: true, scope: projectScope });
  const legacyInvalid = () =>
    mockVerifyScope.mockResolvedValue({ validKey: false, error: "bad key" });
  const authzAllows = () =>
    mockEnforceOrgAuth.mockResolvedValue({
      success: true,
      context: { principal: apiKeyPrincipal("ORGANIZATION"), policies: [] },
      orgId: "org_1",
    });
  const authzDenies = () =>
    mockEnforceOrgAuth.mockResolvedValue({
      success: false,
      error: new ForbiddenError("nope"),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    env.API_AUTH_MIGRATION = "legacy";
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

    it("403s a non-org key, leaving the body to the route", async () => {
      legacyProjectKey();
      expect(await call()).toEqual({
        validKey: false,
        status: 403,
        error: "",
      });
    });
  });

  describe("an unset migration mode falls back to legacy", () => {
    it("returns the legacy scope and skips enforceOrgAuth", async () => {
      env.API_AUTH_MIGRATION = undefined as unknown as string;
      legacyOrgKey();
      expect(await call()).toEqual({ validKey: true, scope: orgScope });
      expect(mockEnforceOrgAuth).not.toHaveBeenCalled();
    });
  });

  describe("shadow mode keeps responses byte-identical to legacy", () => {
    beforeEach(() => {
      env.API_AUTH_MIGRATION = "shadow";
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
      expect(mockRecordCoverage).toHaveBeenCalledWith("");
      expect(mockDiffResults).toHaveBeenCalledWith(
        { success: false, error: expect.any(ForbiddenError) },
        { ok: true },
        { seam: "org_route", action: "projects:read" },
      );
    });
  });

  describe("enforce mode decides on the new pipeline alone", () => {
    beforeEach(() => {
      env.API_AUTH_MIGRATION = "enforce";
    });

    it("returns the scope the new pipeline built, without calling legacy", async () => {
      authzAllows();
      expect(await call()).toEqual({
        validKey: true,
        scope: {
          ...mappedFields,
          projectId: null,
          accessLevel: "organization",
        },
      });
      expect(mockVerifyScope).not.toHaveBeenCalled();
    });

    it("passes the route's action to the new pipeline", async () => {
      authzAllows();
      await call();
      expect(mockEnforceOrgAuth).toHaveBeenCalledWith({
        headers: req.headers,
        action: "projects:read",
      });
    });

    it("500s when the resolved org is absent from the principal", async () => {
      mockEnforceOrgAuth.mockResolvedValue({
        success: true,
        context: { principal: apiKeyPrincipal("ORGANIZATION"), policies: [] },
        orgId: "org_2",
      });
      expect(await call()).toMatchObject({ validKey: false, status: 500 });
    });

    it("403s when the new pipeline denies, leaving the body to the route", async () => {
      authzDenies();
      expect(await call()).toEqual({
        validKey: false,
        status: 403,
        error: "nope",
      });
    });

    it("surfaces a non-403 new denial with its own message", async () => {
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
      authzAllows();
      await call();
      expect(mockDiffResults).not.toHaveBeenCalled();
      expect(mockRecordCoverage).not.toHaveBeenCalled();
    });
  });
});

describe("the migration-mode gate reads a declared env var", () => {
  const source = (relativeToSrc: string) =>
    readFileSync(
      fileURLToPath(new URL(`../../../../${relativeToSrc}`, import.meta.url)),
      "utf8",
    );

  it("reads only env keys env.mjs declares", () => {
    const seam = source("features/auth/policy/verifyOrgAuth.ts");
    const schema = source("env.mjs");
    const keys = [...seam.matchAll(/\benv\.([A-Z][A-Z0-9_]*)/g)].map(
      (match) => match[1],
    );
    expect(keys.length).toBeGreaterThan(0);
    for (const key of new Set(keys)) {
      expect(schema).toContain(`${key}: z.`);
    }
  });

  it("defaults the migration mode to legacy", () => {
    expect(source("env.mjs")).toMatch(
      /API_AUTH_MIGRATION:\s*z[^;]*?\.default\("legacy"\)/,
    );
  });
});
