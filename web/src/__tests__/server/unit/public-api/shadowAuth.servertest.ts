import { readFileSync } from "fs";
import { fileURLToPath } from "url";

import { type NextApiRequest } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ForbiddenError,
  InternalServerError,
  InvalidRequestError,
} from "@langfuse/shared";

const {
  env,
  mockVerifyScope,
  mockLegacyProjectAuth,
  mockEnforceAuth,
  mockShadowAuthDiff,
} = vi.hoisted(() => ({
  env: { API_AUTH_MIGRATION: "legacy" as string },
  mockVerifyScope: vi.fn(),
  mockLegacyProjectAuth: vi.fn(),
  mockEnforceAuth: vi.fn(),
  mockShadowAuthDiff: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({ env }));

vi.mock("@/src/features/public-api/server/apiAuth", () => ({
  ApiAuthService: class {
    verifyAuthHeaderAndReturnScope = mockVerifyScope;
  },
}));

vi.mock("@/src/features/public-api/server/verifyProjectApiKeyAuth", () => ({
  verifyAuth: mockLegacyProjectAuth,
}));

vi.mock("@/src/features/public-api/server/enforceAuth", () => ({
  enforceAuth: mockEnforceAuth,
}));

vi.mock(
  "@/src/features/public-api/server/shadowAuthDiff",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    shadowAuthDiff: mockShadowAuthDiff,
  }),
);

import { shadowAuth } from "@/src/features/public-api/server/shadowAuth";

const mappedFields = {
  orgId: "org_1",
  plan: "oss",
  rateLimitOverrides: [],
  apiKeyId: "key_1",
  publicKey: "pk-lf-1",
  isIngestionSuspended: false,
  isInAppAgentKey: false,
};

describe("org-family dispatch (allowedAccessLevels ['organization'])", () => {
  const orgScope = { accessLevel: "organization", orgId: "org_1" };
  const projectScope = { accessLevel: "project", projectId: "prj_1" };
  const req = { headers: {}, method: "GET" } as unknown as NextApiRequest;

  const call = () =>
    shadowAuth({
      req,
      action: "projects:read",
      allowedAccessLevels: ["organization"],
    });

  const legacyOrgKey = () =>
    mockVerifyScope.mockResolvedValue({ validKey: true, scope: orgScope });
  const legacyProjectKey = () =>
    mockVerifyScope.mockResolvedValue({ validKey: true, scope: projectScope });
  const legacyInvalid = () =>
    mockVerifyScope.mockResolvedValue({ validKey: false, error: "bad key" });
  const authzAllows = () =>
    mockEnforceAuth.mockResolvedValue({
      success: true,
      scope: { ...mappedFields, projectId: null, accessLevel: "organization" },
    });
  const authzDenies = () =>
    mockEnforceAuth.mockResolvedValue({
      success: false,
      error: new ForbiddenError("nope"),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    env.API_AUTH_MIGRATION = "legacy";
  });

  describe("legacy mode never runs the new pipeline", () => {
    it("returns the legacy scope and skips enforceAuth", async () => {
      legacyOrgKey();
      expect(await call()).toEqual({ success: true, scope: orgScope });
      expect(mockEnforceAuth).not.toHaveBeenCalled();
    });

    it("returns the legacy 401 with the auth message", async () => {
      legacyInvalid();
      expect(await call()).toMatchObject({
        success: false,
        error: { httpCode: 401, message: "bad key" },
      });
    });

    it("403s a non-org key, leaving the body to the route", async () => {
      legacyProjectKey();
      expect(await call()).toMatchObject({
        success: false,
        error: { httpCode: 403, message: "" },
      });
    });
  });

  describe("an unset migration mode falls back to legacy", () => {
    it("returns the legacy scope and skips enforceAuth", async () => {
      env.API_AUTH_MIGRATION = undefined as unknown as string;
      legacyOrgKey();
      expect(await call()).toEqual({ success: true, scope: orgScope });
      expect(mockEnforceAuth).not.toHaveBeenCalled();
    });
  });

  describe("shadow mode keeps responses byte-identical to legacy", () => {
    beforeEach(() => {
      env.API_AUTH_MIGRATION = "shadow";
    });

    it("returns the legacy scope even when the new pipeline denies", async () => {
      legacyOrgKey();
      authzDenies();
      expect(await call()).toEqual({ success: true, scope: orgScope });
    });

    it("records the parity cell", async () => {
      legacyOrgKey();
      authzDenies();
      await call();
      expect(mockShadowAuthDiff).toHaveBeenCalledWith(
        { success: false, error: expect.any(ForbiddenError) },
        { success: true, status: 200, scope: orgScope },
        "projects:read",
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
        success: true,
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
      expect(mockEnforceAuth).toHaveBeenCalledWith({
        req,
        action: "projects:read",
        allowedAccessLevels: ["organization"],
      });
    });

    it("renders a new-pipeline 500 as a 500 denial", async () => {
      mockEnforceAuth.mockResolvedValue({
        success: false,
        error: new InternalServerError("unmappable principal"),
      });
      expect(await call()).toMatchObject({
        success: false,
        error: { httpCode: 500 },
      });
    });

    it("403s when the new pipeline denies, leaving the body to the route", async () => {
      authzDenies();
      expect(await call()).toMatchObject({
        success: false,
        error: { httpCode: 403, message: "nope" },
      });
    });

    it("surfaces a non-403 new denial with its own message", async () => {
      mockEnforceAuth.mockResolvedValue({
        success: false,
        error: new InvalidRequestError("no target"),
      });
      expect(await call()).toMatchObject({
        success: false,
        error: { httpCode: 400, message: "no target" },
      });
    });

    it("does not record parity telemetry", async () => {
      authzAllows();
      await call();
      expect(mockShadowAuthDiff).not.toHaveBeenCalled();
    });
  });
});

describe("project-family dispatch (allowedAccessLevels ['project'])", () => {
  const legacyScope = { scope: { projectId: "p1", accessLevel: "project" } };
  const req = { headers: {}, method: "GET" } as unknown as NextApiRequest;

  const call = () =>
    shadowAuth({
      req,
      action: "traces:read",
      allowedAccessLevels: ["project"],
    });

  const legacyAllows = () =>
    mockLegacyProjectAuth.mockResolvedValue(legacyScope);
  const legacyDenies = (status: number) =>
    mockLegacyProjectAuth.mockRejectedValue({ status, message: "legacy" });
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
      expect(mockShadowAuthDiff).not.toHaveBeenCalled();
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

    it("records the parity cell", async () => {
      legacyAllows();
      authzDenies();
      await call();
      expect(mockShadowAuthDiff).toHaveBeenCalledWith(
        { success: false, error: expect.any(ForbiddenError) },
        { success: true, status: 200, scope: legacyScope.scope },
        "traces:read",
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
      expect(mockLegacyProjectAuth).not.toHaveBeenCalled();
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
      expect(mockShadowAuthDiff).not.toHaveBeenCalled();
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
    const seam = source("features/public-api/server/shadowAuth.ts");
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
